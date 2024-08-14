import asyncio
import inspect
import os

import anyio
import pytest
from async_asgi_testclient import TestClient as AsyncTestClient
from fastapi.encoders import jsonable_encoder

from dara.core import DerivedVariable, UpdateVariable, Variable
from dara.core.auth import BasicAuthConfig, MultiBasicAuthConfig
from dara.core.auth.definitions import SessionRequestBody
from dara.core.configuration import ConfigurationBuilder
from dara.core.definitions import ComponentInstance
from dara.core.interactivity.any_variable import NOT_REGISTERED
from dara.core.internal.registries import utils_registry
from dara.core.internal.websocket import (
    WS_CHANNEL,
    CustomClientMessage,
    CustomClientMessagePayload,
    DaraClientMessage,
    DaraServerMessage,
    ServerMessagePayload,
    WebSocketHandler,
    WebsocketManager,
)
from dara.core.main import _start_application

from tests.python.tasks import exception_task
from tests.python.utils import (
    AUTH_HEADERS,
    _async_ws_connect,
    _call_action,
    create_app,
    get_ws_messages,
    wait_for,
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

@pytest.fixture(autouse=True)
async def cleanup_registry():
    from dara.core.internal.registries import custom_ws_handlers_registry
    yield
    custom_ws_handlers_registry.replace({})

async def _send_task(handler: WebSocketHandler, messages: list):
    """
    Helper function to send messages to a websocket handler in an async thread

    :param handler: the ws_handler to use
    :param messages: the messages to send
    """
    # First we wait for the first task to send the message in the first place
    await wait_for(lambda: list(handler.pending_responses.keys())[0])

    msg_id = list(handler.pending_responses.keys())[0]

    # Process the messages which should unblock the first task and allow it to complete
    for message in messages:
        msg = DaraClientMessage(
            channel=msg_id,
            message=message,
            chunk_count=None if len(messages) == 1 else len(messages),
        )
        await handler.process_client_message(msg)


async def test_websocket_receive_custom_sync_response():
    """
    Test a custom synchronous handler responding to a message.
    """
    from dara.core.internal.registries import custom_ws_handlers_registry

    ws_mgr = WebsocketManager()
    ws_handler = ws_mgr.create_handler('CHANNEL')

    def custom_handler(channel: str, msg):
        return msg

    custom_ws_handlers_registry.register('CUSTOM_KIND', custom_handler)

    result = ws_handler.process_client_message(
        CustomClientMessage(message=CustomClientMessagePayload(kind='CUSTOM_KIND', data='INPUT', __rchan='RESPONSE_CHANNEL'))
    )
    assert inspect.iscoroutine(result)
    await result

    result_message = await ws_handler.receive_stream.receive()
    result_message = jsonable_encoder(result_message)
    assert result_message['message']['kind'] == 'CUSTOM_KIND'
    assert result_message['message']['__response_for'] == 'RESPONSE_CHANNEL'
    assert result_message['message']['data'] == 'INPUT'

async def test_websocket_receive_custom_async_response():
    """
    Test a custom asynchronous handler responding to a message.
    """
    from dara.core.internal.registries import custom_ws_handlers_registry

    ws_mgr = WebsocketManager()
    ws_handler = ws_mgr.create_handler('CHANNEL')

    async def custom_handler(channel: str, msg):
        return msg

    custom_ws_handlers_registry.register('CUSTOM_KIND', custom_handler)

    result = ws_handler.process_client_message(
        CustomClientMessage(message=CustomClientMessagePayload(kind='CUSTOM_KIND', data='INPUT', __rchan='RESPONSE_CHANNEL'))
    )
    assert result is None

    # Result will be sent back in a task
    await anyio.sleep(1)

    result_message = await ws_handler.receive_stream.receive()
    result_message = jsonable_encoder(result_message)
    assert result_message['message']['kind'] == 'CUSTOM_KIND'
    assert result_message['message']['__response_for'] == 'RESPONSE_CHANNEL'
    assert result_message['message']['data'] == 'INPUT'

async def test_websocket_send_and_wait():
    """
    Test that calling send_and_wait on a websocket handler will block until a response is received
    """
    result = {}
    ws_mgr = WebsocketManager()
    ws_handler = ws_mgr.create_handler('CHANNEL')

    async def get_task():
        nonlocal result
        result = await ws_handler.send_and_wait(DaraServerMessage(message=ServerMessagePayload()))

    # Run the two tasks concurrently
    async with anyio.create_task_group() as tg:
        tg.start_soon(_send_task, ws_handler, ['hello'])
        tg.start_soon(get_task)

    # Verify that a single response was returned
    assert result == 'hello'


async def test_websocket_send_and_wait_with_chunks():
    """
    Test that calling send_and_wait on a websocket handler will block until a response is received even when the
    response is sent in multiple chunks
    """
    result = {}
    ws_mgr = WebsocketManager()
    ws_handler = ws_mgr.create_handler('CHANNEL')

    async def get_task():
        nonlocal result
        result = await ws_handler.send_and_wait(DaraServerMessage(message=ServerMessagePayload()))

    # Run the two tasks concurrently
    async with anyio.create_task_group() as tg:
        tg.start_soon(_send_task, ws_handler, ['hello', 'world', '!!!'])
        tg.start_soon(get_task)

    # Verify that a list of responses was returned
    assert result == ['hello', 'world', '!!!']


async def test_websocket_broadcast():
    builder = ConfigurationBuilder()

    basic_auth = MultiBasicAuthConfig(users={'test': 'test', 'test2': 'test2'})

    config = create_app(builder)
    config.auth_config = basic_auth
    app = _start_application(config)

    # Get two tokens for same user
    token1 = basic_auth.get_token(SessionRequestBody(username='test', password='test')).get('token')
    token1_2 = basic_auth.get_token(SessionRequestBody(username='test', password='test')).get('token')
    token2 = basic_auth.get_token(SessionRequestBody(username='test2', password='test2')).get('token')

    async with AsyncTestClient(app) as client:
        async with _async_ws_connect(client, token1) as ws1:
            init1 = await ws1.receive_json()
            async with _async_ws_connect(client, token1_2) as ws1_2:
                init1_2 = await ws1_2.receive_json()
                async with _async_ws_connect(client, token2) as ws2:
                    init_2 = await ws2.receive_json()

                    # Broadcast a message
                    ws_mgr: WebsocketManager = utils_registry.get('WebsocketManager')
                    await ws_mgr.broadcast({'message': 'broadcast message'})

                    # Check all websockets received the message
                    messages1 = await get_ws_messages(ws1, timeout=1)
                    messages1_2 = await get_ws_messages(ws1_2, timeout=1)
                    messages2 = await get_ws_messages(ws2, timeout=1)

                    assert len(messages1) == 1
                    assert len(messages1_2) == 1
                    assert len(messages2) == 1

                    assert messages1[0].get('message') == {'message': 'broadcast message'}
                    assert messages1_2[0].get('message') == {'message': 'broadcast message'}
                    assert messages2[0].get('message') == {'message': 'broadcast message'}


async def test_websocket_send_to_user():
    builder = ConfigurationBuilder()

    basic_auth = MultiBasicAuthConfig(users={'test': 'test', 'test2': 'test2'})

    config = create_app(builder)
    config.auth_config = basic_auth
    app = _start_application(config)

    # Get two tokens for same user
    token1 = basic_auth.get_token(SessionRequestBody(username='test', password='test')).get('token')
    token1_2 = basic_auth.get_token(SessionRequestBody(username='test', password='test')).get('token')
    token2 = basic_auth.get_token(SessionRequestBody(username='test2', password='test2')).get('token')

    async with AsyncTestClient(app) as client:
        async with _async_ws_connect(client, token1) as ws1:
            init1 = await ws1.receive_json()
            async with _async_ws_connect(client, token1_2) as ws1_2:
                init1_2 = await ws1_2.receive_json()
                async with _async_ws_connect(client, token2) as ws2:
                    init_2 = await ws2.receive_json()

                    # Send a message to user 'test'
                    ws_mgr: WebsocketManager = utils_registry.get('WebsocketManager')
                    await ws_mgr.send_message_to_user('test', {'message': 'broadcast message'})

                    # Check only user1 websockets received the message
                    messages1 = await get_ws_messages(ws1, timeout=1)
                    messages1_2 = await get_ws_messages(ws1_2, timeout=1)
                    messages2 = await get_ws_messages(ws2, timeout=1)

                    assert len(messages1) == 1
                    assert len(messages1_2) == 1
                    assert len(messages2) == 0

                    assert messages1[0].get('message') == {'message': 'broadcast message'}
                    assert messages1_2[0].get('message') == {'message': 'broadcast message'}


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
        return {'channel': channel, 'message': msg, 'response': 'response'}

    builder.add_ws_handler(kind='my_custom_kind', handler=custom_handler)

    config = create_app(builder)
    app = _start_application(config)

    async with AsyncTestClient(app) as client:
        async with _async_ws_connect(client) as websocket:
            # Receive the init message
            init = await websocket.receive_json()

            # Send a message with our custom kind
            await websocket.send_json({'type': 'custom', 'message': {'kind': 'my_custom_kind', 'data': 'test'}})

            # Should receive the message back
            msg = await websocket.receive_json()
            assert msg == {
                'type': 'custom',
                'message': {
                    'kind': 'my_custom_kind',
                    'data': {'channel': init.get('message').get('channel'), 'message': 'test', 'response': 'response'},
                },
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
                {'ws_channel': ws_channel, 'input': 'test', 'values': {'old': 'current', 'kwarg_0': 'val2'}},
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
            },
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


async def test_two_websockets_both_with_values_with_set_ws_channel():
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
                await websocket.send_json(
                    {
                        'type': 'message',
                        'channel': websocket_msg.get('message').get('__rchan'),
                        'message': expected_return_value,
                    }
                )

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
                    await second_ws.send_json(
                        {
                            'type': 'message',
                            'channel': second_ws_message.get('message').get('__rchan'),
                            'message': second_var_expected_value,
                        }
                    )

                async with anyio.create_task_group() as tg_second:
                    ## run the first client again to return two values
                    tg_second.start_soon(second_client)
                    tg_second.start_soon(second_server)

                # Assert that the second variable is correctly set based on the second response because of the WS_CHANNEL
                assert second_var_value == second_var_expected_value

            # Assert that the first value remains unaffected by the second value
            assert var_value == expected_return_value


async def test_two_websockets_both_with_values_with_stale_ws_channel():
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
                await websocket.send_json(
                    {
                        'type': 'message',
                        'channel': websocket_msg.get('message').get('__rchan'),
                        'message': expected_return_value,
                    }
                )

            async with anyio.create_task_group() as tg:
                tg.start_soon(client)
                tg.start_soon(server)

            async with _async_ws_connect(testclient, token) as second_ws:
                second_init = await second_ws.receive_json()

                ## Set the WS_CHANNEL to a stale value to make sure it is correctly ignored
                WS_CHANNEL.set('STALE_CHANNEL')

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
                    await second_ws.send_json(
                        {
                            'type': 'message',
                            'channel': second_ws_message.get('message').get('__rchan'),
                            'message': second_var_expected_value,
                        }
                    )

                async with anyio.create_task_group() as tg_second:
                    ## run the first client again to return two values
                    tg_second.start_soon(second_client)
                    tg_second.start_soon(second_server)

                # Assert that the second variable is correctly set based on the second response because of the WS_CHANNEL
                assert second_var_value[second_init.get('message').get('channel')] == second_var_expected_value

            # Assert that the first value remains unaffected by the second value
            assert var_value == expected_return_value


async def test_two_websockets_both_with_values_without_set_ws_channel():
    app, token = setup_two_websocket_tests()

    async with AsyncTestClient(app) as testclient:
        async with _async_ws_connect(testclient, token) as websocket:
            # get the init message
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

                # send a response back for the first websocket
                await websocket.send_json(
                    {
                        'type': 'message',
                        'channel': websocket_msg.get('message').get('__rchan'),
                        'message': expected_return_value,
                    }
                )

            async with anyio.create_task_group() as tg:
                tg.start_soon(client)
                tg.start_soon(server)

            async with _async_ws_connect(testclient, token) as second_ws:
                second_init = await second_ws.receive_json()

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
                    await second_ws.send_json(
                        {
                            'type': 'message',
                            'channel': second_ws_message.get('message').get('__rchan'),
                            'message': second_var_expected_value,
                        }
                    )

                async with anyio.create_task_group() as tg_second:
                    ## run the first client again to return two values
                    tg_second.start_soon(client)

                    tg_second.start_soon(second_client)
                    tg_second.start_soon(second_server)

                # Assert that the second variable is a dict of both the first and second values because WS_CHANNEL is not set
                assert second_var_value == {
                    second_init.get('message').get('channel'): second_var_expected_value,
                    init.get('message').get('channel'): expected_return_value,
                }

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
                await websocket.send_json(
                    {
                        'type': 'message',
                        'channel': websocket_msg.get('message').get('__rchan'),
                        'message': expected_return_value,
                    }
                )

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
                    await second_websocket.send_json(
                        {
                            'type': 'message',
                            'channel': second_ws_message.get('message').get('__rchan'),
                            'message': NOT_REGISTERED,
                        }
                    )

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
                await websocket.send_json(
                    {
                        'type': 'message',
                        'channel': websocket_msg.get('message').get('__rchan'),
                        'message': expected_return_value,
                    }
                )

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
                    await second_websocket.send_json(
                        {
                            'type': 'message',
                            'channel': second_ws_message.get('message').get('__rchan'),
                            'message': NOT_REGISTERED,
                        }
                    )

                async with anyio.create_task_group() as tg_second:
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
    token = basic_auth.get_token(SessionRequestBody(username='test', password='test')).get('token')
    basic_auth.verify_token(token)

    return app, token
