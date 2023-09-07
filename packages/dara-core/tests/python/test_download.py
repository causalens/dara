import os
from contextvars import ContextVar
from datetime import datetime, timedelta, timezone
from typing import Optional, Union
from unittest.mock import patch
from exceptiongroup import BaseExceptionGroup

import jwt
import pytest
from async_asgi_testclient import TestClient as AsyncClient

from dara.core.auth.definitions import JWT_ALGO
from dara.core.base_definitions import Action
from dara.core.configuration import ConfigurationBuilder
from dara.core.definitions import ComponentInstance
from dara.core.interactivity.actions import DownloadContent
from dara.core.interactivity.plain_variable import Variable
from dara.core.internal.download import generate_download_code, get_by_code
from dara.core.internal.settings import get_settings
from dara.core.main import _start_application

from tests.python.utils import _call_action

pytestmark = pytest.mark.anyio


class MockComponent(ComponentInstance):
    text: Union[str, Variable]

    action: Optional[Action] = None

    def __init__(self, text: Union[str, Variable], action: Optional[Action] = None):
        super().__init__(text=text, uid='uid', action=action)


async def test_get_by_code():
    """
    Test that get-by-code workflow works as expected
    """

    # First, check that even if JWT is valid dataset cannot be retrieved if the code isn't generated via the api
    code = jwt.encode({'any': 'data'}, get_settings().jwt_secret, JWT_ALGO)

    # Raises because code wasn't registered
    with pytest.raises(ValueError) as err:
        data = get_by_code(code)

    assert str(err.value) == 'Invalid download code'

    # Check expired code
    from dara.core.internal.download import download_registry

    expired_code = jwt.encode(
        {
            'file_path': './some/path.pdf',
            'exp': datetime.now(tz=timezone.utc) - timedelta(minutes=10),
            'cleanup_file': False,
            'identity_name': 'test_user',
        },
        get_settings().jwt_secret,
        JWT_ALGO,
    )
    download_registry.add(expired_code)

    # Raises because code expired
    with pytest.raises(ValueError) as err:
        data = get_by_code(expired_code)

    assert str(err.value) == 'Download code expired'

    # Create a local test file, try to download and check if it has been deleted
    code_to_file = generate_download_code('./path/to/test/file.txt', cleanup_file=False)
    path, file_name, cleanup_file, username = get_by_code(code_to_file)

    assert path == './path/to/test/file.txt'
    assert file_name == 'file.txt'
    assert cleanup_file == False


@patch('dara.core.interactivity.actions.uuid.uuid4', return_value='uid')
async def test_download_content_extras(_uid):
    """
    Test that extras are passed through to the resolver
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
        response = await _call_action(
            client,
            action.get(),
            data={
                'inputs': {'value': None},
                'extras': [
                    './test.txt',
                ],
                'ws_channel': 'uid',
            },
        )

        path, file_name, cleanup_file, username = get_by_code(response.json())

        assert path == './test.txt'
        assert file_name == 'test.txt'
        assert cleanup_file == True


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
        response = await _call_action(
            client,
            action.get(),
            data={
                'inputs': {'value': None},
                'extras': [
                    './test.txt',
                ],
                'ws_channel': 'uid',
            },
        )

        with pytest.raises(BaseExceptionGroup) as err:
            call_main = await client.get(f'/api/core/download?code={response.json()}')

        assert str(err.value.exceptions[0]) == 'Download file "test.txt" could not be found at: ./test.txt'


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
        response = await _call_action(
            client,
            action.get(),
            data={
                'inputs': {'value': None},
                'extras': [
                    'Some content for the file',
                ],
                'ws_channel': 'uid',
            },
        )

        response2 = await client.get(f'/api/core/download?code={response.json()}')

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
        response = await _call_action(
            client,
            action.get(),
            data={
                'inputs': {'value': None},
                'extras': [
                    'Some content for the file',
                ],
                'ws_channel': 'uid',
            },
        )

        response2 = await client.get(f'/api/core/download?code={response.json()}')

        # Checks if request successful
        assert response2.content == b'Some content for the file'
        assert response2.headers.get('Content-Disposition') == 'attachment; filename=test_download_content.txt'

        # Checks if still exists:
        assert os.path.exists('./test_download_content.txt')
        # Manual cleanup
        os.remove('./test_download_content.txt')
        assert not os.path.exists('./test_download_content.txt')
