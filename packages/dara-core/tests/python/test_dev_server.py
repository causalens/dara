import base64
import json

import pytest
import respx
from httpx import Response

from dara.core.js_tooling.dev_server import (
    DEV_SERVER_INFO_PATH,
    DevServerInfo,
    DevServerSettings,
    check_dev_server,
)


def test_dev_server_info_resolves_paths(tmp_path):
    """Development server identity should contain canonical project and static workspace paths."""
    project_root = tmp_path / 'project'
    project_root.mkdir()
    settings = DevServerSettings(port=3100)

    info = DevServerInfo.from_static_files_dir('custom-static', cwd=project_root, settings=settings)

    assert info.cwd == str(project_root.resolve())
    assert info.static_files_dir == str((project_root / 'custom-static').resolve())
    assert info.origin == 'http://localhost:3100'


def test_dev_server_info_encodes_json(tmp_path):
    """Development server identity should be transportable as base64url JSON."""
    info = DevServerInfo.from_static_files_dir(
        'custom-static',
        cwd=tmp_path,
        settings=DevServerSettings(port=3100),
    )

    decoded = json.loads(base64.urlsafe_b64decode(info.encode()).decode('utf-8'))

    assert decoded == {
        'version': 1,
        'cwd': str(tmp_path.resolve()),
        'static_files_dir': str((tmp_path / 'custom-static').resolve()),
        'origin': 'http://localhost:3100',
    }


def test_dev_server_settings_can_be_loaded_from_project_env(monkeypatch: pytest.MonkeyPatch, tmp_path):
    """Both Dara commands should resolve the same project-level development port."""
    monkeypatch.chdir(tmp_path)
    (tmp_path / '.env').write_text('VITE_SERVER_PORT=3200\n')

    assert DevServerSettings().port == 3200


@pytest.mark.anyio
@respx.mock
async def test_check_dev_server_accepts_matching_server(tmp_path):
    """A server for the expected static workspace should pass the handshake."""
    expected = DevServerInfo.from_static_files_dir('dist', cwd=tmp_path)
    respx.get(f'{expected.origin}{DEV_SERVER_INFO_PATH}').mock(
        return_value=Response(200, json={'info': expected.encode()})
    )

    assert await check_dev_server(expected) is None


@pytest.mark.anyio
@respx.mock
async def test_check_dev_server_reports_wrong_project(tmp_path):
    """A valid identity for another static workspace should be reported clearly."""
    expected = DevServerInfo.from_static_files_dir('dist', cwd=tmp_path / 'expected')
    actual = DevServerInfo.from_static_files_dir('dist', cwd=tmp_path / 'actual')
    respx.get(f'{expected.origin}{DEV_SERVER_INFO_PATH}').mock(
        return_value=Response(200, json={'info': actual.encode()})
    )

    mismatch = await check_dev_server(expected)

    assert mismatch is not None
    assert mismatch.reason == 'wrong-server'
    assert mismatch.actual == actual
    assert str(tmp_path / 'expected') in mismatch.format_message()
    assert str(tmp_path / 'actual') in mismatch.format_message()


@pytest.mark.anyio
@pytest.mark.parametrize(
    'response',
    [
        Response(404),
        Response(200, json={'info': 'not-base64'}),
        Response(200, json={'unexpected': 'shape'}),
    ],
)
@respx.mock
async def test_check_dev_server_unifies_missing_and_invalid_servers(tmp_path, response: Response):
    """Old, non-Dara, and malformed development servers should share one mismatch flow."""
    expected = DevServerInfo.from_static_files_dir('dist', cwd=tmp_path)
    respx.get(f'{expected.origin}{DEV_SERVER_INFO_PATH}').mock(return_value=response)

    mismatch = await check_dev_server(expected)

    assert mismatch is not None
    assert mismatch.reason == 'unidentified-server'
    assert expected.origin in mismatch.format_message()
