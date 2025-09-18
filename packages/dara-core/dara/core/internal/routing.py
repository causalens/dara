"""
Copyright 2023 Impulse Innovations Limited


Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
"""

import inspect
import json
import math
import os
import traceback
from collections.abc import Mapping
from functools import wraps
from importlib.metadata import version
from typing import Annotated, Any, Callable, Dict, List, Literal, Optional, Union
from urllib.parse import unquote

import anyio
from anyio.streams.memory import MemoryObjectSendStream
from fastapi import (
    APIRouter,
    Body,
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    Path,
    Response,
    UploadFile,
)
from fastapi.encoders import jsonable_encoder
from fastapi.responses import StreamingResponse
from pandas import DataFrame
from pydantic import BaseModel, Field
from starlette.background import BackgroundTask
from starlette.status import HTTP_415_UNSUPPORTED_MEDIA_TYPE

from dara.core.auth.routes import verify_session
from dara.core.base_definitions import ActionResolverDef, BaseTask, NonTabularDataError, UploadResolverDef
from dara.core.configuration import Configuration
from dara.core.interactivity.actions import ACTION_CONTEXT
from dara.core.interactivity.any_data_variable import upload
from dara.core.interactivity.filtering import FilterQuery, Pagination
from dara.core.interactivity.server_variable import ServerVariable
from dara.core.internal.cache_store import CacheStore
from dara.core.internal.devtools import print_stacktrace
from dara.core.internal.download import DownloadRegistryEntry
from dara.core.internal.execute_action import CURRENT_ACTION_ID, execute_action_sync
from dara.core.internal.normalization import NormalizedPayload, denormalize, normalize
from dara.core.internal.pandas_utils import data_response_to_json, df_to_json, is_data_response
from dara.core.internal.registries import (
    action_def_registry,
    action_registry,
    backend_store_registry,
    component_registry,
    derived_variable_registry,
    download_code_registry,
    latest_value_registry,
    server_variable_registry,
    static_kwargs_registry,
    upload_resolver_registry,
    utils_registry,
)
from dara.core.internal.registry_lookup import RegistryLookup
from dara.core.internal.tasks import TaskManager, TaskManagerError
from dara.core.internal.utils import get_cache_scope
from dara.core.internal.websocket import WS_CHANNEL, ws_handler
from dara.core.logging import dev_logger
from dara.core.persistence import BackendStoreEntry
from dara.core.visual.dynamic_component import CURRENT_COMPONENT_ID, PyComponentDef


def error_decorator(handler: Callable[..., Any]):
    """Wrapper for routes to improve the default error message in the framework"""
    if inspect.iscoroutinefunction(handler):

        @wraps(handler)
        async def _async_inner_func(*args, **kwargs):
            try:
                return await handler(*args, **kwargs)
            except Exception as err:
                # If HTTPException was raised directly just re-raise
                if isinstance(err, HTTPException):
                    raise err
                dev_logger.error('Unhandled error', error=err)
                raise HTTPException(status_code=500, detail=str(err)) from err

        return _async_inner_func

    @wraps(handler)
    def _inner_func(*args, **kwargs):
        try:
            return handler(*args, **kwargs)
        except Exception as err:
            # If HTTPException was raised directly just re-raise
            if isinstance(err, HTTPException):
                raise err
            dev_logger.error('Unhandled error', error=err)
            raise HTTPException(status_code=500, detail=str(err)) from err

    return _inner_func


core_api_router = APIRouter()


@core_api_router.get('/actions', dependencies=[Depends(verify_session)])
async def get_actions():
    return action_def_registry.get_all().items()


class ActionRequestBody(BaseModel):
    values: NormalizedPayload[Mapping[str, Any]]
    """Dynamic kwarg values"""

    input: Any = None
    """Input from the component"""

    ws_channel: str
    """Websocket channel assigned to the client"""

    uid: str
    """Instance uid"""

    execution_id: str
    """Execution id, unique to this request"""


@core_api_router.post('/action/{uid}', dependencies=[Depends(verify_session)])
async def get_action(uid: str, body: ActionRequestBody):
    store: CacheStore = utils_registry.get('Store')
    task_mgr: TaskManager = utils_registry.get('TaskManager')
    registry_mgr: RegistryLookup = utils_registry.get('RegistryLookup')
    action_def: ActionResolverDef = await registry_mgr.get(action_registry, uid)

    CURRENT_ACTION_ID.set(body.uid)
    WS_CHANNEL.set(body.ws_channel)

    # Denormalize the values
    values = denormalize(body.values.data, body.values.lookup)

    # Fetch static kwargs
    static_kwargs = await registry_mgr.get(static_kwargs_registry, body.uid)

    # Execute the action - kick off a background task to run the handler
    response = await action_def.execute_action(
        action_def,
        body.input,
        values,
        static_kwargs,
        body.execution_id,
        body.ws_channel,
        store,
        task_mgr,
    )

    if isinstance(response, BaseTask):
        await task_mgr.run_task(response, body.ws_channel)
        return {'task_id': response.task_id}

    return {'execution_id': response}


@core_api_router.get('/download')  # explicitly unauthenticated
async def get_download(code: str):
    store: CacheStore = utils_registry.get('Store')

    try:
        data_entry = await store.get(DownloadRegistryEntry, key=code)

        # If not found directly in the store, use the override registry
        # to check if we can get the download entry from there
        if data_entry is None:
            registry_mgr: RegistryLookup = utils_registry.get('RegistryLookup')
            # NOTE: This will throw a Value/KeyError if the code is not found so no need to rethrow
            data_entry = await registry_mgr.get(download_code_registry, code)
            # We managed to find one from the lookup,
            # remove it from the registry immediately because it's one time use
            download_code_registry.remove(code)

        async_file, cleanup = await data_entry.download(data_entry)

        file_name = os.path.basename(data_entry.file_path)

        # This mirrors builtin's FastAPI FileResponse implementation
        async def stream_file():
            has_content = True
            chunk_size = 64 * 1024
            while has_content:
                chunk = await async_file.read(chunk_size)
                has_content = chunk_size == len(chunk)
                yield chunk

        return StreamingResponse(
            content=stream_file(),
            headers={'Content-Disposition': f'attachment; filename={file_name}'},
            background=BackgroundTask(cleanup),
        )

    except (KeyError, ValueError) as e:
        raise ValueError('Invalid or expired download code') from e


@core_api_router.get('/components/{name}/definition', dependencies=[Depends(verify_session)])
async def get_component_definition(name: str):
    """
    Attempt to refetch a component definition from the backend.
    This is used when a component isn't immediately available in the initial registry,
    e.g. when it was added by a py_component.

    :param name: the name of component
    """
    registry_mgr: RegistryLookup = utils_registry.get('RegistryLookup')
    component = await registry_mgr.get(component_registry, name)
    return component.model_dump(exclude={'func'})


class ComponentRequestBody(BaseModel):
    # Dynamic kwarg values
    values: NormalizedPayload[Mapping[str, Any]]
    # Instance uid
    uid: str
    # Websocket channel assigned to the client
    ws_channel: str


@core_api_router.post('/components/{component}', dependencies=[Depends(verify_session)])
async def get_component(component: str, body: ComponentRequestBody):
    CURRENT_COMPONENT_ID.set(body.uid)
    WS_CHANNEL.set(body.ws_channel)
    store: CacheStore = utils_registry.get('Store')
    task_mgr: TaskManager = utils_registry.get('TaskManager')
    registry_mgr: RegistryLookup = utils_registry.get('RegistryLookup')
    comp_def = await registry_mgr.get(component_registry, component)

    if isinstance(comp_def, PyComponentDef):
        static_kwargs = await registry_mgr.get(static_kwargs_registry, body.uid)
        values = denormalize(body.values.data, body.values.lookup)

        response = await comp_def.render_component(comp_def, store, task_mgr, values, static_kwargs)

        dev_logger.debug(
            f'PyComponent {comp_def.func.__name__ if comp_def.func else "anonymous"}',
            'return value',
            {'value': response},
        )

        if isinstance(response, BaseTask):
            await task_mgr.run_task(response, body.ws_channel)
            return {'task_id': response.task_id}

        return response

    raise HTTPException(status_code=400, detail='Requesting this type of component is not supported')


@core_api_router.get('/derived-variable/{uid}/latest', dependencies=[Depends(verify_session)])
async def get_latest_derived_variable(uid: str):
    try:
        store: CacheStore = utils_registry.get('Store')
        latest_value_entry = latest_value_registry.get(uid)
        variable_entry = derived_variable_registry.get(uid)

        # Lookup the latest key in the cache
        scope = get_cache_scope(variable_entry.cache.cache_type if variable_entry.cache else None)
        latest_key = await store.get(latest_value_entry, key=scope)

        if latest_key is None:
            return None

        # Lookup latest value for that key
        latest_value = await store.get_or_wait(variable_entry, key=latest_key)

        dev_logger.debug(
            f'DerivedVariable {variable_entry.uid[:3]}..{variable_entry.uid[-3:]}',
            'latest value',
            {'value': latest_value, 'uid': uid},
        )
        return latest_value

    except KeyError as err:
        raise ValueError(f'Could not find latest value for derived variable with uid: {uid}') from err


class TabularRequestBody(BaseModel):
    filters: Optional[FilterQuery] = None
    ws_channel: str
    dv_values: Optional[NormalizedPayload[List[Any]]] = None
    """DerivedVariable values if variable is a DerivedVariable"""
    force_key: Optional[str] = None
    """Optional force key if variable is a DerivedVariable and a recalculation is forced"""


@core_api_router.post('/tabular-variable/{uid}', dependencies=[Depends(verify_session)])
async def get_tabular_variable(
    uid: str,
    body: TabularRequestBody,
    offset: Optional[int] = None,
    limit: Optional[int] = None,
    order_by: Optional[str] = None,
    index: Optional[str] = None,
):
    """
    Generic endpoint for getting tabular data from a variable.
    Supports ServerVariables and DerivedVariables.
    """
    WS_CHANNEL.set(body.ws_channel)

    try:
        pagination = Pagination(offset=offset, limit=limit, orderBy=order_by, index=index)
        registry_mgr: RegistryLookup = utils_registry.get('RegistryLookup')

        # ServerVariable
        if body.dv_values is None:
            server_variable_entry = await registry_mgr.get(server_variable_registry, uid)
            data_response = await ServerVariable.get_tabular_data(server_variable_entry, body.filters, pagination)
            return Response(data_response_to_json(data_response), media_type='application/json')

        # DerivedVariable
        store: CacheStore = utils_registry.get('Store')
        task_mgr: TaskManager = utils_registry.get('TaskManager')
        variable_def = await registry_mgr.get(derived_variable_registry, uid)
        values = denormalize(body.dv_values.data, body.dv_values.lookup)

        result = await variable_def.get_tabular_data(
            variable_def, store, task_mgr, values, body.force_key, pagination, body.filters
        )

        if isinstance(result, BaseTask):
            await task_mgr.run_task(result, body.ws_channel)
            return {'task_id': result.task_id}

        return Response(data_response_to_json(result), media_type='application/json')
    except NonTabularDataError as e:
        raise HTTPException(status_code=HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail=str(e)) from e


@core_api_router.get('/server-variable/{uid}/sequence', dependencies=[Depends(verify_session)])
async def get_server_variable_sequence(
    uid: str,
):
    registry_mgr: RegistryLookup = utils_registry.get('RegistryLookup')
    server_variable_entry = await registry_mgr.get(server_variable_registry, uid)
    seq_num = await ServerVariable.get_sequence_number(server_variable_entry)
    return {'sequence_number': seq_num}


@core_api_router.post('/data/upload', dependencies=[Depends(verify_session)])
async def upload_data(
    data_uid: Optional[str] = None,
    data: UploadFile = File(),
    resolver_id: Optional[str] = Form(default=None),
):
    """
    Upload endpoint.
    Can run a custom resolver_id (if previously registered, otherwise runs a default one)
    and update a data variable with its return value (if target is specified).
    """
    registry_mgr: RegistryLookup = utils_registry.get('RegistryLookup')

    if data_uid is None and resolver_id is None:
        raise HTTPException(
            400,
            'Neither resolver_id or data_uid specified, at least one of them is required',
        )

    try:
        # If resolver id is provided, run the custom
        if resolver_id:
            upload_resolver_def: UploadResolverDef = await registry_mgr.get(upload_resolver_registry, resolver_id)
            await upload_resolver_def.upload(data, data_uid, resolver_id)
        else:
            # Run the default logic as a fallback, e.g. programmatic upload
            await upload(data, data_uid, resolver_id)

        return {'status': 'SUCCESS'}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


class DerivedStateRequestBody(BaseModel):
    values: NormalizedPayload[List[Any]]
    force_key: Optional[str] = None
    ws_channel: str


@core_api_router.post('/derived-variable/{uid}', dependencies=[Depends(verify_session)])
async def get_derived_variable(uid: str, body: DerivedStateRequestBody):
    task_mgr: TaskManager = utils_registry.get('TaskManager')
    store: CacheStore = utils_registry.get('Store')
    registry_mgr: RegistryLookup = utils_registry.get('RegistryLookup')
    variable_def = await registry_mgr.get(derived_variable_registry, uid)

    values = denormalize(body.values.data, body.values.lookup)

    result = await variable_def.get_value(variable_def, store, task_mgr, values, body.force_key)

    response: Any = result

    WS_CHANNEL.set(body.ws_channel)

    if isinstance(result['value'], BaseTask):
        # Kick off the task
        await task_mgr.run_task(result['value'], body.ws_channel)
        response = {
            'task_id': result['value'].task_id,
            'cache_key': result['cache_key'],
        }

    dev_logger.debug(
        f'DerivedVariable {variable_def.uid[:3]}..{variable_def.uid[-3:]}',
        'return value',
        {'value': response, 'uid': uid},
    )

    # Return {cache_key: <cache_key>, value: <value>}
    return response


@core_api_router.get('/store/{store_uid}', dependencies=[Depends(verify_session)])
async def read_backend_store(store_uid: str):
    registry_mgr: RegistryLookup = utils_registry.get('RegistryLookup')
    store_entry: BackendStoreEntry = await registry_mgr.get(backend_store_registry, store_uid)
    result = store_entry.store.read()

    # Backend implementation could return a coroutine
    if inspect.iscoroutine(result):
        result = await result

    # Get the current key and sequence number for this store
    store = store_entry.store
    key = await store._get_key()
    sequence_number = store.sequence_number.get(key, 0)

    return {'value': result, 'sequence_number': sequence_number}


@core_api_router.post('/store', dependencies=[Depends(verify_session)])
async def sync_backend_store(ws_channel: str = Body(), values: Dict[str, Any] = Body()):
    registry_mgr: RegistryLookup = utils_registry.get('RegistryLookup')

    async def _write(store_uid: str, value: Any):
        WS_CHANNEL.set(ws_channel)
        store_entry: BackendStoreEntry = await registry_mgr.get(backend_store_registry, store_uid)
        result = store_entry.store.write(value, ignore_channel=ws_channel)

        # Backend implementation could return a coroutine
        if inspect.iscoroutine(result):
            await result

    async with anyio.create_task_group() as tg:
        for store_uid, value in values.items():
            tg.start_soon(_write, store_uid, value)


@core_api_router.get('/tasks/{task_id}', dependencies=[Depends(verify_session)])
async def get_task_result(task_id: str):
    try:
        task_mgr: TaskManager = utils_registry.get('TaskManager')
        res = await task_mgr.get_result(task_id)

        dev_logger.debug(
            f'Retrieving result for Task {task_id}',
            'return value',
            {'value': res},
        )

        # Serialize dataframes correctly, either direct or as a DataResponse
        if isinstance(res, DataFrame):
            return Response(df_to_json(res), media_type='application/json')
        elif is_data_response(res):
            return Response(data_response_to_json(res), media_type='application/json')

        return res
    except KeyError as err:
        raise HTTPException(status_code=404, detail=str(err)) from err
    except Exception as err:
        raise ValueError(f'The result for task id {task_id} could not be found') from err


@core_api_router.delete('/tasks/{task_id}', dependencies=[Depends(verify_session)])
async def cancel_task(task_id: str):
    try:
        task_mgr: TaskManager = utils_registry.get('TaskManager')
        return await task_mgr.cancel_task(task_id)
    except TaskManagerError as e:
        dev_logger.error(
            f'The task id {task_id} could not be found, it may have already been cancelled',
            e,
        )


@core_api_router.get('/version', dependencies=[Depends(verify_session)])
async def get_version():
    return {'version': version('dara_core')}


# Add the main websocket connection
core_api_router.add_api_websocket_route('/ws', ws_handler)


class ActionPayload(BaseModel):
    uid: str
    definition_uid: str
    values: NormalizedPayload[Mapping[str, Any]]


class DerivedVariablePayload(BaseModel):
    uid: str
    values: NormalizedPayload[List[Any]]


class PyComponentPayload(BaseModel):
    uid: str
    name: str
    values: NormalizedPayload[Mapping[str, Any]]


class RouteDataRequestBody(BaseModel):
    action_payloads: List[ActionPayload] = Field(default_factory=list)
    derived_variable_payloads: List[DerivedVariablePayload] = Field(default_factory=list)
    py_component_payloads: List[PyComponentPayload] = Field(default_factory=list)
    ws_channel: str
    params: Dict[str, str] = Field(default_factory=dict)


class Result(BaseModel):
    ok: bool
    value: Any

    @staticmethod
    def success(value: Any) -> 'Result':
        return Result(ok=True, value=value)

    @staticmethod
    def error(error: str) -> 'Result':
        return Result(ok=False, value=error)


class DerivedVariableChunk(BaseModel):
    type: Literal['derived_variable'] = 'derived_variable'
    uid: str
    result: Result


class PyComponentChunk(BaseModel):
    type: Literal['py_component'] = 'py_component'
    uid: str
    result: Result


Chunk = Union[DerivedVariableChunk, PyComponentChunk]


def create_loader_route(config: Configuration, app: FastAPI):
    route_map = config.router.to_route_map()

    @app.post('/api/core/route/{route_id}', dependencies=[Depends(verify_session)])
    async def get_route_data(route_id: Annotated[str, Path()], body: Annotated[RouteDataRequestBody, Body()]):
        # unquote route_id since it can be url-encoded
        route_id = unquote(route_id)

        route_data = route_map.get(route_id)

        if route_data is None:
            raise HTTPException(status_code=404, detail=f'Route {route_id} not found')

        action_results: Dict[str, Any] = {}

        if len(body.action_payloads) > 0:
            store: CacheStore = utils_registry.get('Store')
            task_mgr: TaskManager = utils_registry.get('TaskManager')
            registry_mgr: RegistryLookup = utils_registry.get('RegistryLookup')

            WS_CHANNEL.set(body.ws_channel)

            # Run actions in order to guarantee execution order
            for action_payload in body.action_payloads:
                action_def = await registry_mgr.get(action_registry, action_payload.definition_uid)
                static_kwargs = await registry_mgr.get(static_kwargs_registry, action_payload.uid)

                CURRENT_ACTION_ID.set(action_payload.uid)
                values = denormalize(action_payload.values.data, action_payload.values.lookup)
                try:
                    action_results[action_payload.uid] = await execute_action_sync(
                        action_def,
                        inp={'params': body.params, 'route': route_data.definition},
                        values=values,
                        static_kwargs=static_kwargs,
                        store=store,
                        task_mgr=task_mgr,
                    )
                except BaseException as e:
                    assert route_data.definition is not None
                    route_path = route_data.definition.full_path
                    action_name = str(action_def.resolver)
                    raise HTTPException(
                        status_code=500,
                        detail={
                            'error': str(e),
                            'stacktrace': print_stacktrace(e),
                            'path': route_path,
                            'action_name': action_name,
                        },
                    ) from e

                # Reset the action context after running actions
                CURRENT_ACTION_ID.set('')
                ACTION_CONTEXT.set(None)

        async def process_variables(send_stream: MemoryObjectSendStream[Chunk]):
            for payload in body.derived_variable_payloads:
                try:
                    # Run the usual DV endpoint logic
                    result = await get_derived_variable(
                        uid=payload.uid,
                        body=DerivedStateRequestBody(
                            values=payload.values,
                            ws_channel=body.ws_channel,
                            force_key=None,
                        ),
                    )
                    await send_stream.send(DerivedVariableChunk(uid=payload.uid, result=Result.success(result)))
                except BaseException as e:
                    dev_logger.error(f'Error streaming derived_variable {payload.uid}', error=e)
                    await send_stream.send(
                        DerivedVariableChunk(uid=payload.uid, result=Result.error(str(e))),
                    )

        async def process_py_components(send_stream: MemoryObjectSendStream[Chunk]):
            for payload in body.py_component_payloads:
                try:
                    result = await get_component(
                        component=payload.name,
                        body=ComponentRequestBody(
                            uid=payload.uid,
                            values=payload.values,
                            ws_channel=body.ws_channel,
                        ),
                    )
                    await send_stream.send(PyComponentChunk(uid=payload.uid, result=Result.success(result)))
                except BaseException as e:
                    dev_logger.error(f'Error streaming py_component {payload.name}', error=e)
                    await send_stream.send(
                        PyComponentChunk(uid=payload.uid, result=Result(ok=False, value=str(e))),
                    )

        normalized_template, lookup = normalize(jsonable_encoder(route_data.content))

        # Setup the stream response
        async def stream():
            try:

                def create_chunk(x):
                    return json.dumps(x) + '\r\n'

                # 1. Send the template and actions
                yield create_chunk(
                    {
                        'type': 'template',
                        'template': {
                            'data': normalized_template,
                            'lookup': lookup,
                        },
                    }
                )
                yield create_chunk({'type': 'actions', 'actions': jsonable_encoder(action_results)})

                # 2. Optionally, if there are DVs or py_components to preload, process them in the background and stream them back as they arrive
                if len(body.derived_variable_payloads) > 0 or len(body.py_component_payloads) > 0:
                    send_stream, receive_stream = anyio.create_memory_object_stream[Chunk](max_buffer_size=math.inf)

                    async def process_derived_state():
                        async with send_stream, anyio.create_task_group() as tg:
                            if len(body.derived_variable_payloads) > 0:
                                tg.start_soon(process_variables, send_stream)
                            if len(body.py_component_payloads) > 0:
                                tg.start_soon(process_py_components, send_stream)

                    async with anyio.create_task_group() as tg:
                        tg.start_soon(process_derived_state)

                        async for item in receive_stream:
                            yield create_chunk(jsonable_encoder(item))
            except Exception as e:
                traceback.print_exc()
                dev_logger.error(f'Error streaming loader data for route {route_id}', error=e)

        return StreamingResponse(content=stream(), media_type='application/x-ndjson')
