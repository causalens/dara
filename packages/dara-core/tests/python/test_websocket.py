import asyncio
import os

import pytest
from async_asgi_testclient import TestClient as AsyncTestClient

from dara.core import DerivedVariable, UpdateVariable, Variable
from dara.core.configuration import ConfigurationBuilder
from dara.core.definitions import ComponentInstance
from dara.core.main import _start_application

from tests.python.tasks import exception_task
from tests.python.utils import (
    AUTH_HEADERS,
    _async_ws_connect,
    _call_action,
    create_app,
    get_ws_messages,
)

pytestmark = pytest.mark.anyio


class LocalJsComponent(ComponentInstance):
    pass


# Create a config to test with
builder: ConfigurationBuilder = ConfigurationBuilder()
builder.add_component(component=LocalJsComponent, local=True)
builder.add_page(name='Js Test', content=ComponentInstance.construct(name='LocalJsComponent', props={}), icon='Hdd')
config = create_app(builder)


os.environ['DARA_DOCKER_MODE'] = 'TRUE'


async def test_websocket_token_required():
    app = _start_application(config)
    async with AsyncTestClient(app) as client:
        with pytest.raises(Exception) as e:
            session = client.websocket_connect('/api/core/ws')
            await session.connect()


async def test_websocket_invalid_token():
    app = _start_application(config)

    async with AsyncTestClient(app) as client:
        with pytest.raises(Exception) as e:
            session = client.websocket_connect('/api/core/ws?token=random_token')
            await session.connect()

async def test_custom_ws_handler():
    builder = ConfigurationBuilder()

    def custom_handler(channel: str, msg):
        return {
            'channel': channel,
            'message': msg,
            'response': 'response'
        }

    builder.add_ws_handler(kind='my_custom_kind', handler=custom_handler)

    config = create_app(builder)
    app = _start_application(config)

    async with AsyncTestClient(app) as client:
        async with _async_ws_connect(client) as websocket:
            # Receive the init message
            init = await websocket.receive_json()

            # Send a message with our custom kind
            await websocket.send_json({'type': 'custom', 'message': { 'kind': 'my_custom_kind', 'data': 'test'}})

            # Should receive the message back
            msg = await websocket.receive_json()
            assert msg == {
                'type': 'custom',
                'message': {
                    'kind': 'my_custom_kind',
                    'data': {
                        'channel': init.get('message').get('channel'),
                        'message': 'test',
                        'response': 'response'
                    }
                }
            }

async def test_action_handler_error():
    builder = ConfigurationBuilder()
    config = create_app(builder)

    def resolver(ctx: UpdateVariable.Ctx):
        # Force an error, using zero division for simplicity
        y = 2 / 0
        return f'{ctx.inputs.new}_{ctx.inputs.old}_{ctx.extras[0]}'

    var = Variable()
    var2 = Variable()

    action = UpdateVariable(resolver, var, extras=[var2])

    app = _start_application(config)

    async with AsyncTestClient(app) as client:
        async with _async_ws_connect(client) as websocket:
            init = await websocket.receive_json()
            ws_channel = init.get('message').get('channel')

            # We have to catch the error here otherwise the test stops, in a normal flow the error would simply be logged
            with pytest.raises(ZeroDivisionError):
                await _call_action(
                    client,
                    action,
                    {'inputs': {'new': 'test', 'old': 'current'}, 'extras': ['val2'], 'ws_channel': ws_channel},
                )

            # Websocket should receive error message
            msg = await websocket.receive_json()

            # The message should contain traceback and current time
            assert 'error' in msg.get('message')
            assert msg.get('message').get('error').startswith('Traceback')
            assert 'time' in msg.get('message')


async def test_action_task_error():
    builder = ConfigurationBuilder()

    result = Variable()

    derived = DerivedVariable(exception_task, variables=[], run_as_task=True)
    action = UpdateVariable(lambda ctx: ctx.extras[0], variable=result, extras=[derived])

    config = create_app(builder, use_tasks=True)

    # Run the app so the component is initialized
    app = _start_application(config)

    # Remove the exception handler so we can actually test the exception, otherwise the test crashes
    loop = asyncio.get_running_loop()

    def handler(loop, context):
        pass

    loop.set_exception_handler(handler)

    async with AsyncTestClient(app) as client:
        payload = {
            'inputs': {'old': None, 'new': None},
            'extras': [
                {
                    'type': 'derived',
                    'uid': str(derived.uid),
                    'values': [],
                },
            ],
        }

        async with _async_ws_connect(client) as websocket:
            # Receive the init message
            init = await websocket.receive_json()

            # Start the task, should receive task_id back
            response = await _call_action(
                client, action, {**payload, 'ws_channel': init.get('message', {}).get('channel')}
            )
            assert 'task_id' in response.json()
            task_id = response.json().get('task_id')

            # Wait a bit, websocket should receive an error message and a traceback
            messages = await get_ws_messages(websocket)
            assert len(messages) == 2

            traceback_msg = next(filter(lambda m: 'error' in m['message'], messages))

            # Check it's a valid error message containing the traceback
            assert traceback_msg.get('message').get('error').startswith('Traceback')
            assert 'time' in traceback_msg.get('message')

            # Check that the other message is the task result as an error
            task_result_msg = next(filter(lambda m: 'status' in m['message'], messages))
            assert task_result_msg.get('message').get('status') == 'ERROR'
            assert task_result_msg.get('message').get('task_id') == task_id

            # Task should have error stored as its result
            result = (await client.get(f'/api/core/tasks/{str(task_id)}', headers=AUTH_HEADERS)).json()
            assert 'error' in result
