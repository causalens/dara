import inspect
import os
from contextvars import ContextVar
from datetime import datetime, timedelta, timezone
from typing import Optional, Union
from unittest.mock import patch

import anyio
import jwt
import pytest
from async_asgi_testclient import TestClient as AsyncClient
from exceptiongroup import BaseExceptionGroup
from freezegun import freeze_time
from tests.python.utils import _async_ws_connect, _call_action, get_action_results

from dara.core.auth.definitions import JWT_ALGO
from dara.core.base_definitions import Action
from dara.core.configuration import ConfigurationBuilder
from dara.core.definitions import ComponentInstance
from dara.core.interactivity.actions import DownloadContent
from dara.core.interactivity.plain_variable import Variable
from dara.core.internal.cache_store import CacheStore
from dara.core.internal.download import DownloadDataEntry, DownloadRegistryEntry, download, generate_download_code
from dara.core.internal.registries import utils_registry
from dara.core.internal.settings import get_settings
from dara.core.main import _start_application

pytestmark = pytest.mark.anyio


class MockComponent(ComponentInstance):
    text: Union[str, Variable]

    action: Optional[Action] = None

    def __init__(self, text: Union[str, Variable], action: Optional[Action] = None):
        super().__init__(text=text, uid='uid', action=action)


async def test_download():
    """
    Test that get-by-code workflow works as expected
    """
    code = 'foo'

    store: CacheStore = utils_registry.get('Store')

    data_entry = await store.get(DownloadRegistryEntry, key=code)
    assert data_entry is None

    with freeze_time('2023-01-01 12:00:00'):
        # Put an entry
        code = await generate_download_code('test_download.txt', cleanup_file=False)

        # Entry is there
        assert await store.get(DownloadRegistryEntry, key=code) is not None

    # Advance time forward 15 minutes
    with freeze_time('2023-01-01 12:15:00'):
        # Check that the entry is not retrieved after the time due to eviction (expired)
        assert await store.get(DownloadRegistryEntry, key=code) is None

    # Create a local test file, try to download and check if it has been deleted
    with open('test_download.txt', 'w') as f:
        f.write('test')

    # Put an entry
    code = await generate_download_code('test_download.txt', cleanup_file=True)
    entry = await store.get(DownloadRegistryEntry, key=code)
    assert entry is not None

    async_file, cleanup = await download(entry)
    assert isinstance(async_file, anyio.AsyncFile)
    assert inspect.isfunction(cleanup)

    # Check content of the file
    assert (await async_file.read()) == b'test'

    # Check cleanup
    await cleanup()
    assert not os.path.exists('test_download.txt')


@patch('dara.core.interactivity.actions.uuid.uuid4', return_value='uid')
async def test_download_content_extras(_uid):
    """
    Test that extras are passed through to the resolver

    TODO: Deprecated API, remove in 2.0
    """
    builder = ConfigurationBuilder()

    action = ContextVar('action')

    def resolver(ctx: DownloadContent.Ctx):
        return ctx.extras[0]

    def page():
        var = Variable('./test.txt')
        act = DownloadContent(resolver, extras=[var], cleanup_file=True)
        action.set(act)
        return MockComponent(text=var, action=act)

    builder.add_page('Test', content=page)

    config = builder._to_configuration()

    app = _start_application(config)

    async with AsyncClient(app) as client:
        async with _async_ws_connect(client) as websocket:
            init = await websocket.receive_json()
            exec_uid = 'exec_uid'

            response = await _call_action(
                client,
                action.get(),
                data={
                    'input': None,
                    'values': {
                        'kwarg_0': './test.txt',
                    },
                    'ws_channel': init.get('message', {}).get('channel'),
                    'execution_id': exec_uid,
                },
            )

            action_results = await get_action_results(websocket, exec_uid)

            assert len(action_results) == 1
            # Returned action is NavigateTo the download url with the code embedded
            url = action_results[0].get('url')
            code = url.split('?code=')[1]

            # Assert the entry is in store by the returned key
            entry = await utils_registry.get('Store').get(DownloadRegistryEntry, key=code)
            assert entry is not None
            assert entry.file_path == './test.txt'
            assert entry.cleanup_file is True


@patch('dara.core.interactivity.actions.uuid.uuid4', return_value='uid')
async def test_file_not_found(_uid):
    """
    Test that when file not found that it raises an error
    """
    builder = ConfigurationBuilder()

    action = ContextVar('action')

    def resolver(ctx: DownloadContent.Ctx):
        return ctx.extras[0]

    def page():
        var = Variable('./test.txt')
        act = DownloadContent(resolver, extras=[var])
        action.set(act)
        return MockComponent(text=var, action=act)

    builder.add_page('Test', content=page)

    config = builder._to_configuration()

    app = _start_application(config)

    async with AsyncClient(app) as client:
        async with _async_ws_connect(client) as websocket:
            init = await websocket.receive_json()
            exec_uid = 'exec_uid'
            response = await _call_action(
                client,
                action.get(),
                data={
                    'input': None,
                    'values': {
                        'kwarg_0': './test.txt',
                    },
                    'ws_channel': init.get('message', {}).get('channel'),
                    'execution_id': exec_uid,
                },
            )

            action_results = await get_action_results(websocket, exec_uid)

            assert len(action_results) == 1
            assert isinstance(action_results[0]['url'], str)

            with pytest.raises((BaseExceptionGroup, FileNotFoundError)) as err:
                call_main = await client.get(action_results[0]['url'])

            error_msg = str(err.value.exceptions[0]) if isinstance(err.value, BaseExceptionGroup) else str(err.value)
            assert "No such file or directory: './test.txt'" in error_msg


@patch('dara.core.interactivity.actions.uuid.uuid4', return_value='uid')
async def test_file_cleanup(_uid):
    """
    Test that file is correctly streamed and cleaned up when cleanup_file flag is set to true
    """
    builder = ConfigurationBuilder()

    action = ContextVar('action')

    def resolver(ctx: DownloadContent.Ctx):
        f = open('test_download_content.txt', 'a')
        f.write(ctx.extras[0])
        f.close()
        return './test_download_content.txt'

    def page():
        var = Variable('Some content for the file')
        act = DownloadContent(resolver, extras=[var], cleanup_file=True)
        action.set(act)
        return MockComponent(text=var, action=act)

    builder.add_page('Test', content=page)

    config = builder._to_configuration()

    app = _start_application(config)

    async with AsyncClient(app) as client:
        async with _async_ws_connect(client) as websocket:
            init = await websocket.receive_json()
            exec_uid = 'exec_uid'
            response = await _call_action(
                client,
                action.get(),
                data={
                    'input': None,
                    'values': {
                        'kwarg_0': 'Some content for the file',
                    },
                    'ws_channel': init.get('message', {}).get('channel'),
                    'execution_id': exec_uid,
                },
            )

            action_results = await get_action_results(websocket, exec_uid)
            assert len(action_results) == 1
            url = action_results[0]['url']

            response2 = await client.get(url)

            # Checks if request successful
            assert response2.content == b'Some content for the file'
            assert response2.headers.get('Content-Disposition') == 'attachment; filename=test_download_content.txt'

            # Checks if file is cleaned up after
            assert not os.path.exists('./test_download_content.txt')


@patch('dara.core.interactivity.actions.uuid.uuid4', return_value='uid')
async def test_file_cleanup_false(_uid):
    """
    Test that file is not cleaned up if cleanup_file is False
    """
    builder = ConfigurationBuilder()

    action = ContextVar('action')

    def resolver(ctx: DownloadContent.Ctx):
        f = open('test_download_content.txt', 'a')
        f.write(ctx.extras[0])
        f.close()
        return './test_download_content.txt'

    def page():
        var = Variable('Some content for the file')
        act = DownloadContent(resolver, extras=[var], cleanup_file=False)
        action.set(act)
        return MockComponent(text=var, action=act)

    builder.add_page('Test', content=page)

    config = builder._to_configuration()

    app = _start_application(config)

    async with AsyncClient(app) as client:
        async with _async_ws_connect(client) as websocket:
            init = await websocket.receive_json()
            exec_uid = 'exec_uid'

            response = await _call_action(
                client,
                action.get(),
                data={
                    'input': None,
                    'values': {
                        'kwarg_0': 'Some content for the file',
                    },
                    'ws_channel': init.get('message', {}).get('channel'),
                    'execution_id': exec_uid,
                },
            )

            action_results = await get_action_results(websocket, exec_uid)
            assert len(action_results) == 1
            url = action_results[0]['url']

            response2 = await client.get(url)

            # Checks if request successful
            assert response2.content == b'Some content for the file'
            assert response2.headers.get('Content-Disposition') == 'attachment; filename=test_download_content.txt'

            # Checks if still exists:
            assert os.path.exists('./test_download_content.txt')
            # Manual cleanup
            os.remove('./test_download_content.txt')
            assert not os.path.exists('./test_download_content.txt')
