import asyncio
import os
from uuid import uuid4
import anyio


from dara.core.interactivity.any_variable import NOT_REGISTERED
from dara.core.auth import BasicAuthConfig
from dara.core.auth.definitions import SessionRequestBody

import pytest
from async_asgi_testclient import TestClient as AsyncTestClient

from dara.core import DerivedVariable, UpdateVariable, Variable
from dara.core.configuration import ConfigurationBuilder
from dara.core.definitions import ComponentInstance
from dara.core.main import _start_application
from dara.core.internal.websocket import WS_CHANNEL

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

            # The error will be send as a websocket message
            await _call_action(
                client,
                action,
                {'ws_channel': ws_channel, 'input': 'test', 'values': {'old':'current', 'kwarg_0': 'val2' }}
            )

            # Websocket should receive a Notify action about the error
            msg = await websocket.receive_json()

            assert 'action' in msg.get('message')
            action = msg.get('message').get('action')

            assert action.get('name') == 'Notify'
            assert action.get('status') == 'ERROR'


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
            'input': None,
            'values': {
                'old': None,
                'kwarg_0': {
                    'type': 'derived',
                    'uid': str(derived.uid),
                    'values': [],
                },
            }
        }

        async with _async_ws_connect(client) as websocket:
            # Receive the init message
            init = await websocket.receive_json()

            # Start the task, should receive task_id back
            response = await _call_action(
                client, action, {**payload, 'ws_channel': init.get('message', {}).get('channel')}
            )
            task_id = response.json()['task_id']

            # Wait a bit, websocket should receive an error message
            messages = await get_ws_messages(websocket)

            # Check ws got an error notification for the task
            task_result_msg = next(filter(lambda m: 'status' in m['message'], messages))
            assert task_result_msg.get('message').get('status') == 'ERROR'
            assert task_result_msg.get('message').get('task_id') == task_id

            # Check we got a traceback message
            traceback_msg = next(filter(lambda m: 'error' in m['message'], messages))
            assert traceback_msg.get('message').get('error').startswith('Traceback')
            assert 'time' in traceback_msg.get('message')

            # Task should have error stored as its result
            result = (await client.get(f'/api/core/tasks/{str(task_id)}', headers=AUTH_HEADERS)).json()
            assert 'error' in result

async def test_two_websockets_both_with_values():
    app, token = setup_two_websocket_tests()

    async with AsyncTestClient(app) as testclient:
        async with _async_ws_connect(testclient, token) as websocket:
            # get the init message
            await websocket.receive_json()
            variable = Variable(default='current')
            expected_return_value = 'return_value'
            var_value = None

            async def server():
                nonlocal var_value
                var_value = await variable.get_current_value()

            async def client():
                # get msg from server
                websocket_msg = await websocket.receive_json()

                # Assert that the request is correct
                assert websocket_msg.get('message').get('variable').get('__typename') == 'Variable'
                assert websocket_msg.get('message').get('variable').get('default') == 'current'

                # send a response back for the first websocket
                await websocket.send_json({
                    'type': 'message',
                    'channel': websocket_msg.get('message').get('__rchan'),
                    'message': expected_return_value
                })

            async with anyio.create_task_group() as tg:
                tg.start_soon(client)
                tg.start_soon(server)

            async with _async_ws_connect(testclient, token) as second_ws:
                second_init = await second_ws.receive_json()

                ## Make sure the websocket channel is set correctly
                WS_CHANNEL.set(second_init.get('message').get('channel'))

                second_var_expected_value = 'second_var_expected_value'
                second_var_value = None
                async def second_server():
                    nonlocal second_var_value
                    second_var_value = await variable.get_current_value()

                async def second_client():
                    # get msg from server
                    second_ws_message = await second_ws.receive_json()

                    # Assert that the request is correct
                    assert second_ws_message.get('message').get('variable').get('__typename') == 'Variable'
                    assert second_ws_message.get('message').get('variable').get('default') == 'current'

                    # send a response back for the second websocket
                    await second_ws.send_json({
                        'type': 'message',
                        'channel': second_ws_message.get('message').get('__rchan'),
                        'message': second_var_expected_value
                    })

                async with anyio.create_task_group() as tg_second:
                    ## run the first client again to return two values
                    tg_second.start_soon(client)

                    tg_second.start_soon(second_client)
                    tg_second.start_soon(second_server)
                
                # Assert that the second variable is correctly set based on the second response because of the WS_CHANNEL
                assert second_var_value == second_var_expected_value

            # Assert that the first value remains unaffected by the second value
            assert var_value == expected_return_value

async def test_two_websockets_only_one_with_value(): 
    app, token = setup_two_websocket_tests()

    async with AsyncTestClient(app) as testclient:
        async with _async_ws_connect(testclient, token) as websocket:
            init = await websocket.receive_json()
            variable = Variable(default='current')
            expected_return_value = 'return_value'
            var_value = None

            async def server():
                nonlocal var_value
                var_value = await variable.get_current_value()

            async def client():
                # get msg from server
                websocket_msg = await websocket.receive_json()

                # Assert that the request is correct
                assert websocket_msg.get('message').get('variable').get('__typename') == 'Variable'
                assert websocket_msg.get('message').get('variable').get('default') == 'current'

                # send a response back
                await websocket.send_json({
                    'type': 'message',
                    'channel': websocket_msg.get('message').get('__rchan'),
                    'message': expected_return_value
                })

            async with anyio.create_task_group() as tg:
                tg.start_soon(client)
                tg.start_soon(server)

            async with _async_ws_connect(testclient, token) as second_websocket:
                init = await second_websocket.receive_json()
                second_var_value = None
                async def second_server():
                    nonlocal second_var_value
                    second_var_value = await variable.get_current_value()

                async def second_client():
                    # get msg from server
                    second_ws_message = await second_websocket.receive_json()

                    # Assert that the request is correct
                    assert second_ws_message.get('message').get('variable').get('__typename') == 'Variable'
                    assert second_ws_message.get('message').get('variable').get('default') == 'current'

                    # send a response back
                    await second_websocket.send_json({
                        'type': 'message',
                        'channel': second_ws_message.get('message').get('__rchan'),
                        'message': NOT_REGISTERED
                    })

                async with anyio.create_task_group() as tg_second:
                    tg_second.start_soon(client)
                    tg_second.start_soon(second_client)
                    tg_second.start_soon(second_server)
                
                # Assert that the second variable is correctly set based on the original value as the second value is not registered
                assert second_var_value == expected_return_value

            # Assert that the first value remains unaffected by the second value
            assert var_value == expected_return_value

async def test_two_websockets_only_one_with_value_return_exact():
    app, token = setup_two_websocket_tests()

    async with AsyncTestClient(app) as testclient:
        async with _async_ws_connect(testclient, token) as websocket:
            init = await websocket.receive_json()
            variable = Variable(default='current')
            expected_return_value = 'return_value'
            var_value = None

            async def server():
                nonlocal var_value
                var_value = await variable.get_current_value()

            async def client():
                # get msg from server
                websocket_msg = await websocket.receive_json()

                # Assert that the request is correct
                assert websocket_msg.get('message').get('variable').get('__typename') == 'Variable'
                assert websocket_msg.get('message').get('variable').get('default') == 'current'

                # send a response back
                await websocket.send_json({
                    'type': 'message',
                    'channel': websocket_msg.get('message').get('__rchan'),
                    'message': expected_return_value
                })

            async with anyio.create_task_group() as tg:
                tg.start_soon(client)
                tg.start_soon(server)

            async with _async_ws_connect(testclient, token) as second_websocket:
                second_init = await second_websocket.receive_json()
                second_var_value = None
                async def second_server():
                    nonlocal second_var_value
                    second_var_value = await variable.get_current_value()

                ## Make sure the websocket channel is set correctly
                WS_CHANNEL.set(second_init.get('message').get('channel'))

                async def second_client():
                    # get msg from server
                    second_ws_message = await second_websocket.receive_json()

                    # Assert that the request is correct
                    assert second_ws_message.get('message').get('variable').get('__typename') == 'Variable'
                    assert second_ws_message.get('message').get('variable').get('default') == 'current'

                    # send a response back
                    await second_websocket.send_json({
                        'type': 'message',
                        'channel': second_ws_message.get('message').get('__rchan'),
                        'message': NOT_REGISTERED
                    })

                async with anyio.create_task_group() as tg_second:
                    tg_second.start_soon(client)
                    tg_second.start_soon(second_client)
                    tg_second.start_soon(second_server)
                
                # Assert that the second variable is none -- this is due to the fact that we specified the channel and it should pull value in that channel
                assert second_var_value is None

            # Assert that the first value remains unaffected by the second value
            assert var_value == expected_return_value

def setup_two_websocket_tests():
    builder = ConfigurationBuilder()

    basic_auth = BasicAuthConfig(username='test', password='test')
    
    config = create_app(builder)
    config.auth_config = basic_auth
    app = _start_application(config)

    # Login the user and set the session registry
    token = basic_auth.get_token(SessionRequestBody(username="test", password='test')).get('token');
    basic_auth.verify_token(token);

    return app, token


