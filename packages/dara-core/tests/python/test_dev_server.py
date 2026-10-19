import base64
import json

import pytest
import respx
from httpx import Response
from pydantic import ValidationError

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


@pytest.mark.parametrize(
    'public_origin', ['http://vite.feature.example.test:7777', 'https://vite.feature.example.test']
)
def test_proxy_settings_keep_public_and_local_endpoints_separate(monkeypatch, public_origin):
    """Proxy TLS and browser ports must not change the HTTP listener or backend probe."""
    monkeypatch.setenv('VITE_SERVER_ORIGIN', public_origin)
    monkeypatch.setenv('VITE_SERVER_PORT', '3100')
    monkeypatch.setenv('VITE_SERVER_BIND_HOST', '127.0.0.1')
    monkeypatch.setenv('VITE_SERVER_ALLOWED_ORIGINS', '["https://ui.feature.example.test"]')
    settings = DevServerSettings()

    assert settings.origin == public_origin
    assert settings.local_origin == 'http://127.0.0.1:3100'
    environment = settings.as_environment()
    assert environment['VITE_SERVER_ORIGIN'] == public_origin
    assert environment['VITE_SERVER_PORT'] == '3100'
    assert environment['VITE_SERVER_BIND_HOST'] == '127.0.0.1'
    assert json.loads(environment['VITE_SERVER_ALLOWED_ORIGINS']) == ['https://ui.feature.example.test']


@pytest.mark.parametrize('bind_host, probe_host', [('0.0.0.0', '127.0.0.1'), ('::', '[::1]'), ('::1', '[::1]')])
def test_backend_probes_connectable_bind_address(bind_host, probe_host):
    """Wildcard listeners and IPv6 addresses need a connectable, correctly bracketed probe URL."""
    settings = DevServerSettings(bind_host=bind_host, port=3100, public_origin='https://vite.example.test')
    assert settings.local_origin == f'http://{probe_host}:3100'


def test_legacy_origin_remains_the_probe_target():
    """Existing host and protocol settings keep working without an explicit proxy origin."""
    settings = DevServerSettings(host='existing.example.test', protocol='https', port=3100)
    assert settings.local_origin == settings.origin == 'https://existing.example.test:3100'


def test_proxy_settings_load_from_project_env_with_process_overrides(monkeypatch, tmp_path):
    """Project files and process managers share the same proxy settings and precedence."""
    monkeypatch.chdir(tmp_path)
    (tmp_path / '.env').write_text(
        'VITE_SERVER_ORIGIN=https://vite.project.example.test\n'
        'VITE_SERVER_BIND_HOST=127.0.0.1\n'
        'VITE_SERVER_ALLOWED_ORIGINS=["https://ui.project.example.test"]\n'
    )
    assert DevServerSettings().origin == 'https://vite.project.example.test'
    monkeypatch.setenv('VITE_SERVER_ORIGIN', 'https://vite.override.example.test')
    settings = DevServerSettings()
    assert settings.origin == 'https://vite.override.example.test'
    assert settings.bind_host == '127.0.0.1'
    assert json.loads(settings.as_environment()['VITE_SERVER_ALLOWED_ORIGINS']) == ['https://ui.project.example.test']


@pytest.mark.parametrize(
    'origin',
    [
        'ftp://vite.test',
        'https://vite.test/path',
        'https://user:pass@vite.test',
        'https://vite.test?query=1',
        'https://vite.test#fragment',
    ],
)
@pytest.mark.parametrize('field', ['public_origin', 'allowed_origins'])
def test_proxy_settings_reject_non_origins(field, origin):
    """Only exact HTTP origins may enter browser URL and CORS configuration."""
    value = [origin] if field == 'allowed_origins' else origin
    with pytest.raises(ValidationError):
        DevServerSettings(**{field: value})


@pytest.mark.anyio
@respx.mock
async def test_handshake_bypasses_public_proxy(tmp_path):
    """The backend should not depend on public DNS or the proxy's TLS certificate for identity checks."""
    settings = DevServerSettings(public_origin='https://vite.feature.example.test', port=3100)
    expected = DevServerInfo.from_static_files_dir('dist', cwd=tmp_path, settings=settings)
    route = respx.get(f'http://localhost:3100{DEV_SERVER_INFO_PATH}').mock(
        return_value=Response(200, json={'info': expected.encode()})
    )

    assert await check_dev_server(expected, origin=settings.local_origin) is None
    assert route.called
