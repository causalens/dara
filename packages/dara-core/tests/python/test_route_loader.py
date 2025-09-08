from typing import Union

import anyio
import pytest
from async_asgi_testclient import TestClient
from pydantic import SerializeAsAny

from dara.core.configuration import ConfigurationBuilder
from dara.core.definitions import ComponentInstance
from dara.core.interactivity.actions import action
from dara.core.interactivity.any_variable import AnyVariable
from dara.core.interactivity.derived_variable import DerivedVariable
from dara.core.interactivity.plain_variable import Variable
from dara.core.internal.dependency_resolution import ResolvedDerivedVariable
from dara.core.internal.normalization import denormalize
from dara.core.main import _start_application
from dara.core.router import Outlet, PageRoute, Router
from dara.core.visual.dynamic_component import py_component

from tests.python.utils import AUTH_HEADERS, _get_template, ndjson, normalize_request

pytestmark = pytest.mark.anyio


class Stack(ComponentInstance):
    children: list

    def __init__(self, *children):
        super().__init__(children=children)


class Text(ComponentInstance):
    text: SerializeAsAny[Union[str, AnyVariable]]


async def test_load_nested_templates():
    config = ConfigurationBuilder()

    router = Router()
    parent = router.add_page(path='parent', content=lambda: Stack(Text(text='parent'), Outlet()))
    child = router.add_page(path='child', content=lambda: Stack(Text(text='child'), Outlet()))
    grandparent = router.add_page(path='grandparent', content=lambda: Stack(Text(text='grandparent'), Outlet()))

    config.router = router
    app = _start_application(config._to_configuration())

    async with TestClient(app) as client:
        response, _status = await _get_template(client, page_id=parent.get_identifier())
        assert response['template'] == parent.route_data.content.model_dump()

        response, _status = await _get_template(client, page_id=child.get_identifier())
        assert response['template'] == child.route_data.content.model_dump()

        response, _status = await _get_template(client, page_id=grandparent.get_identifier())
        assert response['template'] == grandparent.route_data.content.model_dump()


async def test_execute_actions():
    config = ConfigurationBuilder()

    var = Variable(default=2)

    @action
    async def test_action(ctx: action.Ctx, previous_value, static_kwarg):
        assert isinstance(ctx.input['route'], PageRoute)
        assert ctx.input['route'].path == 'blog/:id'

        blog_id = int(ctx.input['params']['id'])
        await ctx.update(variable=var, value=blog_id + previous_value + static_kwarg + 1)
        await ctx.reset_variables(var)

    action_instance = test_action(previous_value=var, static_kwarg=10)

    router = Router()
    route = router.add_page(
        path='blog/:id', content=lambda: Stack(Text(text='parent'), Outlet()), on_load=action_instance
    )
    config.router = router

    app = _start_application(config._to_configuration())

    async with TestClient(app) as client:
        response, _status = await _get_template(
            client,
            page_id=route.get_identifier(),
            params={'id': '5'},
            actions=[{'action': action_instance, 'inputs': {'previous_value': 2}}],
        )
        action_results = response['actions']
        assert len(action_results) == 1

        results = action_results[action_instance.uid]
        assert len(results) == 2

        assert results[0]['name'] == 'UpdateVariable'
        assert results[0]['value'] == 5 + 2 + 10 + 1

        assert results[1]['name'] == 'ResetVariables'
        assert results[1]['variables'][0]['uid'] == var.uid


async def test_on_load_action_error_raises():
    config = ConfigurationBuilder()

    @action
    async def test_action(ctx: action.Ctx):
        raise Exception('test exception')

    action_instance = test_action()

    router = Router()
    route = router.add_page(
        path='blog/:id', content=lambda: Stack(Text(text='parent'), Outlet()), on_load=action_instance
    )
    config.router = router

    app = _start_application(config._to_configuration())

    async with TestClient(app) as client:
        response, status = await _get_template(
            client,
            page_id=route.get_identifier(),
            params={'id': '5'},
            response_ok=False,
            actions=[{'action': action_instance, 'inputs': {}}],
        )
        assert status == 500
        assert set(response['detail'].keys()) == {'error', 'stacktrace', 'path', 'action_name'}


async def test_loader_derived_values():
    """
    Test that the loader executes derived values (variables, py_components) when given
    the correct data and streams the results.

    This acts as an integration test for correctly streaming all the data from the loader.
    """
    config = ConfigurationBuilder()

    var = Variable(default=2)
    action_ran = anyio.Event()
    dv_runs = 0
    py_comp_runs = 0

    async def dv_resolver(var_value):
        nonlocal dv_runs
        dv_runs += 1
        return int(var_value) + 1

    dv = DerivedVariable(dv_resolver, variables=[var])

    @py_component
    def TestComponent(input_val: int):
        nonlocal py_comp_runs
        py_comp_runs += 1
        return Text(text=str(input_val))

    py_instance = TestComponent(input_val=dv)

    @action
    async def test_action(ctx: action.Ctx, previous_value, static_kwarg):
        action_ran.set()
        await ctx.update(variable=var, value=previous_value + static_kwarg + 1)

    action_instance = test_action(previous_value=var, static_kwarg=10)

    router = Router()
    route = router.add_page(
        path='blog/:id',
        content=Stack(Text(text='parent'), Text(text=dv), py_instance, Outlet()),
        on_load=action_instance,
    )
    config.router = router

    app = _start_application(config._to_configuration())

    async with TestClient(app) as client:
        normalized_values, lookup = normalize_request(
            {
                'previous_value': 2,
            },
            action_instance.dynamic_kwargs,
        )
        action_payloads = [
            {
                'uid': action_instance.uid,
                'definition_uid': action_instance.definition_uid,
                'values': {
                    'data': normalized_values,
                    'lookup': lookup,
                },
            }
        ]

        normalized_values, lookup = normalize_request([2], dv.variables)
        dv_payloads = [
            {
                'uid': dv.uid,
                'values': {
                    'data': normalized_values,
                    'lookup': lookup,
                },
            }
        ]

        normalized_values, lookup = normalize_request(
            {'input_val': ResolvedDerivedVariable(type='derived', uid=dv.uid, values=[2], force_key=None)},
            py_instance.dynamic_kwargs,
        )
        py_comp_payloads = [
            {
                'uid': py_instance.uid,
                'name': py_instance.__class__.__name__,
                'values': {
                    'data': normalized_values,
                    'lookup': lookup,
                },
            }
        ]

        response = await client.post(
            f'/api/core/route/{route.get_identifier()}',
            headers=AUTH_HEADERS,
            json={
                'action_payloads': action_payloads,
                'derived_variable_payloads': dv_payloads,
                'py_component_payloads': py_comp_payloads,
                'params': {'id': '4'},
                'ws_channel': 'test_channel',
            },
        )
        assert response.status_code == 200

        dv_results = []
        py_comp_results = []

        i = 0
        async for chunk in ndjson(response):
            # template should arrive first
            if i == 0:
                assert chunk['type'] == 'template'
            elif i == 1:
                # then actions
                assert chunk['type'] == 'actions'
                assert len(chunk['actions']) == 1
                action_results = chunk['actions'][action_instance.uid]
                assert len(action_results) == 1
                assert action_results[0]['name'] == 'UpdateVariable'
                assert action_results[0]['variable']['uid'] == var.uid
                assert action_results[0]['value'] == 2 + 10 + 1  # prev + static_kwarg + 1
                assert action_ran.is_set()
            else:
                # afterwards, dv and py_component
                if chunk['type'] == 'derived_variable':
                    dv_results.append(chunk)
                elif chunk['type'] == 'py_component':
                    py_comp_results.append(chunk)
                else:
                    raise ValueError(f'Unexpected chunk type: {chunk["type"]}')
            i += 1

        # both dv and py_component should have run once each
        assert dv_runs == 1
        assert py_comp_runs == 1

        assert len(dv_results) == 1
        dv_result = dv_results[0]['result']
        assert dv_result['ok'] is True
        assert dv_result['value']['value'] == 3

        assert len(py_comp_results) == 1
        py_comp_result = py_comp_results[0]['result']
        assert py_comp_result['ok'] is True
        py_comp_template = denormalize(py_comp_result['value']['data'], py_comp_result['value']['lookup'])
        assert py_comp_template['name'] == 'Text'
        assert py_comp_template['props']['text'] == '3'
