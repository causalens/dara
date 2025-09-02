import pytest
from async_asgi_testclient import TestClient

from dara.core.configuration import ConfigurationBuilder
from dara.core.definitions import ComponentInstance
from dara.core.interactivity.actions import action
from dara.core.interactivity.plain_variable import Variable
from dara.core.main import _start_application
from dara.core.router import Outlet, PageRoute, Router

from tests.python.utils import _get_template

pytestmark = pytest.mark.anyio


class Stack(ComponentInstance):
    children: list

    def __init__(self, *children):
        super().__init__(children=children)


class Text(ComponentInstance):
    text: str


async def test_load_nested_templates():
    config = ConfigurationBuilder()

    router = Router()
    parent = router.add_page(path='parent', content=lambda: Stack(Text(text='parent'), Outlet()))
    child = router.add_page(path='child', content=lambda: Stack(Text(text='child'), Outlet()))
    grandparent = router.add_page(path='grandparent', content=lambda: Stack(Text(text='grandparent'), Outlet()))

    config.router = router
    app = _start_application(config._to_configuration())

    # Router is compiled as the app is started
    assert parent.compiled_data is not None
    assert parent.compiled_data.content is not None
    assert child.compiled_data is not None
    assert child.compiled_data.content is not None
    assert grandparent.compiled_data is not None
    assert grandparent.compiled_data.content is not None

    async with TestClient(app) as client:
        response, _status = await _get_template(client, page_id=parent.get_identifier())
        assert response['template'] == parent.compiled_data.content.model_dump()

        response, _status = await _get_template(client, page_id=child.get_identifier())
        assert response['template'] == child.compiled_data.content.model_dump()

        response, _status = await _get_template(client, page_id=grandparent.get_identifier())
        assert response['template'] == grandparent.compiled_data.content.model_dump()


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
        action_results = response['action_results']
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
