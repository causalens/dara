import datetime
from typing import List

import jwt
import pytest
from async_asgi_testclient import TestClient
from async_asgi_testclient.websocket import WebSocketSession

from dara.core.auth.definitions import JWT_ALGO, USER, TokenData, UserData
from dara.core.configuration import ConfigurationBuilder
from dara.core.interactivity.server_variable import ServerVariable
from dara.core.internal.registries import utils_registry
from dara.core.internal.websocket import WebsocketManager
from dara.core.main import _start_application

from tests.python.utils import TEST_JWT_SECRET, _async_ws_connect, create_app, get_ws_messages

pytestmark = pytest.mark.anyio

USER_1 = UserData(
    identity_id='user_1',
    identity_name='user_1',
    identity_email='user1@example.com',
)
USER_1_TOKEN = jwt.encode(
    TokenData(
        session_id='token1',
        identity_name='user_1',
        groups=[],
        exp=datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(days=1),
    ).model_dump(),
    TEST_JWT_SECRET,
    algorithm=JWT_ALGO,
)

USER_2 = UserData(
    identity_id='user_2',
    identity_name='user_2',
    identity_email='user2@example.com',
)
USER_2_TOKEN = jwt.encode(
    TokenData(
        session_id='token2',
        identity_name='user_2',
        groups=[],
        exp=datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(days=1),
    ).model_dump(),
    TEST_JWT_SECRET,
    algorithm=JWT_ALGO,
)


def get_auth_headers(token: str):
    return {'Authorization': f'Bearer {token}'}


async def _get_seq_number(client: TestClient, sv: ServerVariable, token: str = USER_1_TOKEN):
    response = await client.get(
        f'/api/core/server-variable/{sv.uid}/sequence',
        headers=get_auth_headers(token),
    )
    assert response.status_code == 200
    content = response.json()
    return content['sequence_number']


def _seq_from_ws(message: dict):
    return message['message']['sequence_number']


async def assert_seq_received(ws: WebSocketSession, seq: int):
    messages = await get_ws_messages(ws, count=1)
    assert len(messages) == 1
    seq_received = _seq_from_ws(messages[0])
    assert seq_received == seq


async def test_memory_backend_read_write():
    config = ConfigurationBuilder()
    app = _start_application(config._to_configuration())

    async with TestClient(app) as client:
        async with _async_ws_connect(client, USER_1_TOKEN) as ws:
            await get_ws_messages(ws, count=1)

            sv = ServerVariable()
            assert await _get_seq_number(client, sv) == 0
            assert await sv.read() is None

            await sv.write('test')
            assert await _get_seq_number(client, sv) == 1
            assert await sv.read() == 'test'
            await assert_seq_received(ws, 1)

            await sv.write('test2')
            assert await _get_seq_number(client, sv) == 2
            assert await sv.read() == 'test2'
            await assert_seq_received(ws, 2)


async def test_memory_backend_user_scope_read_write():
    USER.set(USER_1)

    # can't initialize with default for user scope
    with pytest.raises(Exception):
        ServerVariable(scope='user', default='test')

    config = ConfigurationBuilder()
    app = _start_application(config._to_configuration())

    async with TestClient(app) as client:
        async with _async_ws_connect(client, USER_1_TOKEN) as ws:
            await get_ws_messages(ws, count=1)

            async with _async_ws_connect(client, USER_2_TOKEN) as ws2:
                await get_ws_messages(ws2, count=1)

                sv = ServerVariable(scope='user')
                assert await sv.read() is None

                # Write as user1
                await sv.write('test')
                assert await sv.read() == 'test'
                assert await _get_seq_number(client, sv) == 1
                await assert_seq_received(ws, 1)

                # Switch to user2, should have None as state
                USER.set(USER_2)
                assert await sv.read() is None
                assert await _get_seq_number(client, sv, token=USER_2_TOKEN) == 0

                # Write as user2
                await sv.write('test2')
                assert await sv.read() == 'test2'
                assert await _get_seq_number(client, sv, token=USER_2_TOKEN) == 1
                await assert_seq_received(ws2, 1)

                # Switch back to user1, should still be test
                USER.set(USER_1)
                assert await sv.read() == 'test'
                assert await _get_seq_number(client, sv) == 1

                # No more messages should be received, simply inspect pending messages
                assert await get_ws_messages(ws, count=1, timeout=0.1) == []
                assert await get_ws_messages(ws2, count=1, timeout=0.1) == []
