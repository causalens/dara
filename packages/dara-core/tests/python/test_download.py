import inspect
import os
from collections.abc import Awaitable, Callable
from contextvars import ContextVar
from tempfile import TemporaryDirectory
from unittest.mock import patch

import anyio
import pytest
from async_asgi_testclient import TestClient as AsyncClient
from exceptiongroup import BaseExceptionGroup
from freezegun import freeze_time

from dara.core.base_definitions import Action
from dara.core.configuration import ConfigurationBuilder
from dara.core.definitions import ComponentInstance
from dara.core.interactivity.actions import DownloadContent
from dara.core.interactivity.plain_variable import Variable
from dara.core.internal.cache_store import CacheStore
from dara.core.internal.download import (
    GENERATE_CODE_OVERRIDE,
    DownloadDataEntry,
    DownloadRegistryEntry,
    download,
    generate_download_code,
)
from dara.core.internal.registries import utils_registry
from dara.core.internal.registry import RegistryType
from dara.core.main import _start_application

from tests.python.utils import _async_ws_connect, _call_action, get_action_results

pytestmark = pytest.mark.anyio


class MockComponent(ComponentInstance):
    text: str | Variable

    action: Action | None = None

    def __init__(self, text: str | Variable, action: Action | None = None):
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

    async with AsyncClient(app) as client, _async_ws_connect(client) as websocket:
        init = await websocket.receive_json()
        exec_uid = 'exec_uid'

        await _call_action(
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

    async with AsyncClient(app) as client, _async_ws_connect(client) as websocket:
        init = await websocket.receive_json()
        exec_uid = 'exec_uid'
        await _call_action(
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
            await client.get(action_results[0]['url'])

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

    async with AsyncClient(app) as client, _async_ws_connect(client) as websocket:
        init = await websocket.receive_json()
        exec_uid = 'exec_uid'
        await _call_action(
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

    async with AsyncClient(app) as client, _async_ws_connect(client) as websocket:
        init = await websocket.receive_json()
        exec_uid = 'exec_uid'

        await _call_action(
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


async def test_download_override():
    """
    Test download override
    """
    code = 'foo'

    store: CacheStore = utils_registry.get('Store')

    data_entry = await store.get(DownloadRegistryEntry, key=code)
    assert data_entry is None, 'Entry should not exist'

    with TemporaryDirectory() as tmpdir:
        # write a file
        with open(os.path.join(tmpdir, 'test.txt'), 'w') as f:
            f.write('test')

        custom_download_called = False
        code_override_called = False

        async def custom_download(entry: DownloadDataEntry) -> tuple[anyio.AsyncFile, Callable[..., Awaitable]]:
            nonlocal custom_download_called
            custom_download_called = True

            aiofile = await anyio.open_file(os.path.join(tmpdir, 'test.txt'), mode='rb')

            async def noop():
                pass

            return aiofile, noop

        async def code_override(code_to_find: str) -> DownloadDataEntry:
            nonlocal code_override_called
            code_override_called = True
            if code_to_find == code:
                return entry
            raise ValueError('NOT FOUND')

        # make an entry but don't put it in the store
        entry = DownloadDataEntry(uid=code, file_path='test.txt', cleanup_file=True, download=custom_download)

        builder = ConfigurationBuilder()
        builder.add_registry_lookup({RegistryType.DOWNLOAD_CODE: code_override})
        config = builder._to_configuration()
        app = _start_application(config)

        # call the download endpoint directly
        async with AsyncClient(app) as client:
            response = await client.get(f'/api/core/download?code={code}')
            assert response.status_code == 200
            assert response.content == b'test'
            assert custom_download_called
            assert code_override_called


async def test_download_code_override():
    GENERATE_CODE_OVERRIDE.set(lambda x: f'{x}_override')

    code = await generate_download_code('test_download.txt', cleanup_file=True)
    assert code == 'test_download.txt_override'
