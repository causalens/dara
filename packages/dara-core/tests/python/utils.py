import datetime
import inspect
import json
import re
from collections.abc import Awaitable, Callable, Mapping
from contextlib import asynccontextmanager
from typing import (
    Any,
    TypeVar,
    Union,
    cast,
)
from unittest.mock import MagicMock
from uuid import uuid4

import anyio
import jwt
from async_asgi_testclient import TestClient as AsyncClient
from async_asgi_testclient.response import Response
from async_asgi_testclient.websocket import WebSocketSession
from typing_extensions import TypedDict

from dara.core.auth.definitions import JWT_ALGO
from dara.core.base_definitions import AnnotatedAction
from dara.core.configuration import ConfigurationBuilder
from dara.core.interactivity import AnyVariable, DerivedVariable
from dara.core.interactivity.data_variable import DataVariable
from dara.core.interactivity.server_variable import ServerVariable
from dara.core.internal.normalization import NormalizedPayload, denormalize


class AsyncMagicMock(MagicMock):
    async def __call__(self, *args, **kwargs):
        return super(AsyncMagicMock, self).__call__(*args, **kwargs)


TEST_JWT_SECRET = 'd6446c35450e31c4d0b48351c0423bf9'
TEST_SSO_ISSUER_URL = 'http://test-identity-provider.causalens.dev/'
TEST_SSO_CLIENT_ID = 'CLIENT_ID'
TEST_SSO_CLIENT_SECRET = 'CLIENT_SECRET'
TEST_SSO_REDIRECT_URI = 'http://localhost:8000/sso-callback'
TEST_SSO_GROUPS = 'dev,test'

# Object containing env values from .env.test
ENV_OVERRIDE = {
    'JWT_SECRET': TEST_JWT_SECRET,
    'SSO_ISSUER_URL': TEST_SSO_ISSUER_URL,
    'SSO_CLIENT_ID': TEST_SSO_CLIENT_ID,
    'SSO_CLIENT_SECRET': TEST_SSO_CLIENT_SECRET,
    'SSO_REDIRECT_URI': TEST_SSO_REDIRECT_URI,
    'SSO_GROUPS': TEST_SSO_GROUPS,
}

DATA_FILES = {'TEST_DATA_CSV': 'test-data.csv'}


TEST_TOKEN = jwt.encode(
    {
        'session_id': 'token2',
        'identity_id': 'test_user_2',
        'identity_name': 'test_user_2',
        'groups': [],
        'exp': datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(days=1),
    },
    TEST_JWT_SECRET,
    algorithm=JWT_ALGO,
)
AUTH_HEADERS = {'Authorization': f'Bearer {TEST_TOKEN}'}


def read_template_json(path: str, data: dict) -> dict:
    """
    Read a JSON file from the specified path, replacing {{variable_name}} strings with provided data.

    :param path: path to JSON file
    :param data: data to use for replacements
    """
    with open(path, encoding='utf-8') as fp:
        json_string = fp.read()

        for key, val in data.items():
            json_string = json_string.replace('{{' + key + '}}', val)

        return json.loads(json_string)


class ResolvedDerivedVariable(TypedDict):
    values: list[Union[Any, 'ResolvedDerivedVariable']]


JsonLike = Union[Mapping, list]


def _loop(iterable: JsonLike):
    if isinstance(iterable, dict):
        return iterable.items()
    else:
        return enumerate(iterable)


def _normalize_resolved_dv(resolved_dv: dict, definition: DerivedVariable[Any]) -> tuple[JsonLike, Mapping]:
    lookup = {}
    normalized_values = []

    for idx, val in enumerate(resolved_dv['values']):
        if isinstance(val, dict) and 'values' in val:
            nested_normalized, nested_lookup = _normalize_resolved_dv(
                val, cast(DerivedVariable, definition.variables[idx])
            )
            normalized_values.append(nested_normalized)
            lookup.update(nested_lookup)
        else:
            var_def = definition.variables[idx]
            identifier = f'{var_def.__class__.__name__}:{str(var_def.uid)}'
            lookup[identifier] = val
            normalized_values.append({'__ref': identifier})

    return {**resolved_dv, 'values': normalized_values}, lookup


def _get_at_index(arr: list, idx: int):
    try:
        return arr[idx]
    except:  # noqa: E722
        return None


def normalize_request(values: JsonLike, definitions: JsonLike) -> tuple[JsonLike, Mapping]:
    """
    Normalize a request for a PyComponent or DerivedVariable.
    This implementation mimics the normalization logic in frontend - js/shared/utils/normalization
    """
    data: Mapping | list[Any] = {} if isinstance(values, dict) else [None for x in range(len(values))]
    lookup = {}

    for i, (key, value) in enumerate(_loop(values)):
        nested_def = cast(
            DerivedVariable | DataVariable,
            definitions.get(key, None) if isinstance(definitions, dict) else _get_at_index(definitions, i),
        )

        if nested_def is None:
            data[key] = value
        elif isinstance(nested_def, DerivedVariable):
            nested_data, nested_lookup = _normalize_resolved_dv(value, nested_def)
            data[key] = nested_data
            lookup.update(nested_lookup)
        elif isinstance(nested_def, dict):
            identifier = f'{nested_def.__class__.__name__}:{str(nested_def.uid)}'
            lookup[identifier] = value
            data[key] = {'__ref': identifier}
        else:
            data[key] = value

    return data, lookup


class ActionPayload(TypedDict):
    uid: str
    definition_uid: str
    values: Mapping[str, Any] | NormalizedPayload[Any]


class ActionParam(TypedDict):
    action: AnnotatedAction
    inputs: dict[str, Any]


async def ndjson(response: Response):
    """
    Turn a response into an async iterator of NDJSON chunks.
    This uses internals of the response object as the original implementation of iter_content doesn't work with ndjson.
    """
    buffer = ''
    pattern = re.compile(r'\r?\n')

    # already have the entire content in memory
    if response._content_consumed:
        content = response._content.decode('utf-8')
        for part in pattern.split(content):
            if len(part) == 0:
                continue
            yield json.loads(part)
        return

    # otherwise keep reading until we get the entire content
    async for chunk in response.generate(n=1):
        chunk = chunk.decode('utf-8')
        yield json.loads(chunk)
        buffer += chunk

        parts = pattern.split(buffer)
        buffer = parts.pop()
        for part in parts:
            yield json.loads(part)

    if len(buffer) > 0:
        yield json.loads(buffer)


async def _get_template(
    client: AsyncClient,
    page_id: str,
    response_ok=True,
    actions: list[ActionParam] | None = None,
    params: dict[str, str] | None = None,
    ws_channel: str = 'test_channel',
) -> tuple[Any, int]:
    """
    Helper function to fetch the template data from the loader endpoint.
    Consumes the entire response stream of NDJSON chunks and returns them categorized by type.
    """
    if actions is None:
        actions = []

    action_payloads = []

    for action_param in actions:
        action, inputs = action_param['action'], action_param['inputs']
        normalized_values, lookup = normalize_request(inputs, action.dynamic_kwargs)
        values = {'data': normalized_values, 'lookup': lookup}
        action_payloads.append(ActionPayload(uid=action.uid, definition_uid=action.definition_uid, values=values))

    response = await client.post(
        f'/api/core/route/{page_id}',
        headers=AUTH_HEADERS,
        json={'action_payloads': action_payloads, 'params': params or {}, 'ws_channel': ws_channel},
    )

    data = {
        'derived_variable': [],
        'py_component': [],
    }

    # if non-200 response, return the json directly as it will have the error e.g. {'detail': '...'}
    if response.status_code == 200:
        async for chunk in ndjson(response):
            if chunk['type'] == 'template':
                normalized_data = denormalize(chunk['template']['data'], chunk['template']['lookup'])
                data['template'] = normalized_data
            elif chunk['type'] == 'actions':
                data['actions'] = chunk['actions']
            elif chunk['type'] == 'derived_variable':
                data['derived_variable'].append(chunk)
            elif chunk['type'] == 'py_component':
                data['py_component'].append(chunk)
    else:
        data = response.json()

    if response_ok:
        assert response.status_code == 200

    return data, response.status_code


async def _get_tabular_derived_variable(
    client: AsyncClient,
    dv: DerivedVariable,
    data: dict,
    headers=AUTH_HEADERS,
    expect_success=True,
):
    # Denormalize data.dv_values
    normalized_values, lookup = normalize_request(data['dv_values'], dv.variables)
    data['dv_values'] = {'data': normalized_values, 'lookup': lookup}

    response = await client.post(
        f'/api/core/tabular-variable/{str(dv.uid)}',
        json=data,
        headers=headers,
    )
    if expect_success:
        assert response.status_code == 200

    return response


async def _get_tabular_server_variable(
    client: AsyncClient,
    sv: ServerVariable,
    data: dict,
    headers=AUTH_HEADERS,
    expect_success=True,
    query_string: dict | None = None,
):
    response = await client.post(
        f'/api/core/tabular-variable/{str(sv.uid)}', json=data, headers=headers, query_string=query_string
    )
    if expect_success:
        assert response.status_code == 200

    return response


async def _get_derived_variable(
    client: AsyncClient, dv: DerivedVariable, data: dict, headers=AUTH_HEADERS, expect_success=True
):
    if 'values' in data:
        # Denormalize data.values
        normalized_values, lookup = normalize_request(data['values'], dv.variables)
        data['values'] = {'data': normalized_values, 'lookup': lookup}

    response = await client.post(
        f'/api/core/derived-variable/{str(dv.uid)}',
        json=data,
        headers=headers,
    )

    if expect_success:
        assert response.status_code == 200

    return response


async def _get_latest_derived_variable(client: AsyncClient, dv: DerivedVariable, headers=AUTH_HEADERS):
    response = await client.get(
        f'/api/core/derived-variable/{str(dv.uid)}/latest',
        headers=headers,
    )
    assert response.status_code == 200
    return response


async def _get_py_component(
    client: AsyncClient,
    name: str,
    kwargs: dict[str, AnyVariable],
    data: dict,
    headers=AUTH_HEADERS,
    expect_success=True,
):
    if 'values' in data:
        # Denormalize data.values
        normalized_values, lookup = normalize_request(data['values'], kwargs)
        data['values'] = {'data': normalized_values, 'lookup': lookup}

    response = await client.post(f'/api/core/components/{name}', json=data, headers=headers)
    if expect_success:
        assert response.status_code == 200
        res = response.json()

        if 'task_id' in res:
            return res

        return denormalize(res['data'], res['lookup'])

    return response


class ActionRequestBody(TypedDict):
    values: Mapping[str, Any]
    input: Any
    ws_channel: str


async def _call_action(client: AsyncClient, action: AnnotatedAction, data: ActionRequestBody):
    normalized_values, lookup = normalize_request(data['values'], action.dynamic_kwargs)
    data['values'] = {'data': normalized_values, 'lookup': lookup}

    data.setdefault('execution_id', str(uuid4()))
    data['uid'] = action.uid

    response = await client.post(
        f'/api/core/action/{action.definition_uid}',
        json=data,
        headers=AUTH_HEADERS,
    )

    return response


@asynccontextmanager
async def _async_ws_connect(client: AsyncClient, token: str = TEST_TOKEN):
    async with client.websocket_connect(f'/api/core/ws?token={token}') as ws:
        yield ws


SLEEP_INTERVAL = 0.05


async def sleep_for(seconds: float):
    """Sleep for n seconds in small intervals to not block the GIL or the main thread"""
    with anyio.move_on_after(seconds):
        while True:
            await anyio.sleep(SLEEP_INTERVAL)


WaitForResult = TypeVar('WaitForResult')


async def wait_for(callback: Callable[[], WaitForResult], timeout: float = 1) -> WaitForResult:
    """
    Wait for the result of the callback to not be None and not raise any exceptions.
    Retries the callback until it succeeds or timeout is passed. Once timeout passed
    the result of the callback is returned directly regardless of None/exceptions.

    Sleeping is done in small intervals to not block the GIL or the main thread
    """
    with anyio.move_on_after(timeout):
        while True:
            await anyio.sleep(SLEEP_INTERVAL)

            try:
                result = callback()
                if inspect.iscoroutine(result):
                    result = await result
            except BaseException:
                continue
            else:
                if result is not None:
                    return result

    # Once timeout passed, try one more time, this time without error handling
    return callback()


async def wait_assert(condition: Callable[[], bool | Awaitable[bool]], timeout: float = 1):
    """
    Wait for assertion to be true.
    Retries the assertion until succeeds or timeout is passed.

    Sleeping is done in small intervals to not block the GIL or the main thread
    """
    with anyio.move_on_after(timeout):
        while True:
            await anyio.sleep(SLEEP_INTERVAL)

            try:
                # Quit once condition is true
                result = condition()
                if inspect.iscoroutine(result):
                    result = await result

                if result:
                    return
            except AssertionError:
                continue

    # Once timeout passed, assert condition must be true
    result = condition()
    if inspect.iscoroutine(result):
        result = await result
    assert result


async def get_ws_messages(ws: WebSocketSession, timeout: float = 3, count: int | None = None) -> list[dict]:
    """
    Wait for ws messages until timeout is passed.
    """
    messages = []

    while True:
        with anyio.move_on_after(timeout) as scope:
            msg = await ws.receive_json()
            messages.append(msg)

            if count is not None and len(messages) == count:
                break

        if scope.cancel_called:
            break

    return messages


async def get_action_results(ws: WebSocketSession, execution_id: str, timeout: float = 3) -> list[dict]:
    """
    Wait for action results until timeout is passed.
    """
    actions = []

    while True:
        with anyio.move_on_after(timeout) as scope:
            msg = await ws.receive_json()
            # Valid message
            if 'message' in msg and 'action' in msg['message'] and msg['message']['uid'] == execution_id:
                # Sentinel to end listening
                if (action := msg['message']['action']) is None:
                    break
                else:
                    actions.append(action)

        if scope.cancel_called:
            break

    return actions


def create_app(configuration: ConfigurationBuilder, use_tasks=False):
    """
    Create an app from a configuration. Disabling tasks speeds up the startup/shutdown time as there is no TaskPool created

    Note: `use_tasks` MUST be `True` if a test uses tasks, otherwise it will fail as there will be no TaskPool created
    """
    configuration.task_module = 'tests.python.tasks' if use_tasks else None
    return configuration._to_configuration()
