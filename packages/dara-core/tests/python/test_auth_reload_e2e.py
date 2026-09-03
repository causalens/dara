import os
import signal
import socket
import subprocess
import sys
import time
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

import httpx
import pytest

SESSION_TOKEN_COOKIE_NAME = 'dara_session_token'


@dataclass(frozen=True)
class BackendMode:
    name: str
    config_backend: str
    use_cli_reload: bool
    preserves_session: bool


BACKEND_MODES = [
    BackendMode(
        name='explicit-memory',
        config_backend='memory',
        use_cli_reload=False,
        preserves_session=False,
    ),
    BackendMode(
        name='explicit-file',
        config_backend='file',
        use_cli_reload=False,
        preserves_session=True,
    ),
    BackendMode(
        name='reload-auto',
        config_backend='auto',
        use_cli_reload=True,
        preserves_session=True,
    ),
]


def _get_available_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


def _cookie_header(session_token: str) -> dict[str, str]:
    return {'Cookie': f'{SESSION_TOKEN_COOKIE_NAME}={session_token}'}


def _create_app(app_root: Path, backend: str):
    app_package = app_root / 'reload_app'
    app_package.mkdir(parents=True)
    (app_package / '__init__.py').write_text('', encoding='utf-8')
    backend_lines = {
        'auto': [],
        'file': ['config.auth_session_backend = FileAuthSessionBackend()'],
        'memory': ['config.auth_session_backend = InMemoryAuthSessionBackend()'],
    }[backend]
    (app_package / 'main.py').write_text(
        '\n'.join(
            [
                'from dara.core.auth import BasicAuthConfig, FileAuthSessionBackend, InMemoryAuthSessionBackend',
                'from dara.core.configuration import ConfigurationBuilder',
                '',
                'config = ConfigurationBuilder()',
                *backend_lines,
                "config.add_auth(BasicAuthConfig(username='user', password='pass'))",
                '',
            ]
        ),
        encoding='utf-8',
    )


def _build_server_env(app_root: Path, session_path: Path, home_path: Path) -> dict[str, str]:
    env = os.environ.copy()

    for key in (
        'DARA_TEST_FLAG',
        'JWT_SECRET',
        'DARA_DOCKER_MODE',
        'DARA_PRODUCTION_MODE',
        'DARA_HMR_MODE',
        'DARA_LIVE_RELOAD',
        'DARA_CONFIG_PATH',
        'DARA_AUTH_SESSION_FILE_PATH',
    ):
        env.pop(key, None)

    package_root = Path(__file__).resolve().parents[2]
    python_path = os.pathsep.join(
        [
            str(app_root),
            str(package_root),
            env.get('PYTHONPATH', ''),
        ]
    )

    env.update(
        {
            'DARA_AUTH_SESSION_FILE_PATH': str(session_path),
            'DARA_DISABLE_METRICS': 'TRUE',
            'DARA_DEBUG_LOG_LEVEL': 'NONE',
            'DARA_DEV_LOG_LEVEL': 'NONE',
            'HOME': str(home_path),
            'XDG_CACHE_HOME': str(home_path / '.cache'),
            'PYTHONPATH': python_path,
        }
    )
    return env


def _read_process_output(process: subprocess.Popen[str]) -> str:
    if process.stdout is None:
        return ''

    try:
        output, _ = process.communicate(timeout=2)
    except subprocess.TimeoutExpired:
        return ''

    return output


def _wait_for_server(process: subprocess.Popen[str], base_url: str):
    deadline = time.monotonic() + 30
    last_error: Exception | None = None

    while time.monotonic() < deadline:
        if process.poll() is not None:
            output = _read_process_output(process)
            raise RuntimeError(f'Uvicorn exited before startup completed with code {process.returncode}:\n{output}')

        try:
            response = httpx.get(f'{base_url}/status', timeout=0.5)
            if response.status_code == 200:
                return
        except httpx.HTTPError as e:
            last_error = e

        time.sleep(0.1)

    raise TimeoutError(f'Uvicorn did not become ready in time: {last_error}')


@contextmanager
def _run_server(app_root: Path, port: int, env: dict[str, str], *, use_cli_reload: bool) -> Iterator[str]:
    if use_cli_reload:
        command = [
            sys.executable,
            '-c',
            'from dara.core.cli import cli; cli()',
            'start',
            '--reload',
            '--host',
            '127.0.0.1',
            '--port',
            str(port),
            '--config',
            'reload_app.main:config',
            '--disable-metrics',
            '--skip-jsbuild',
            '--debug',
            'NONE',
            '--log',
            'NONE',
        ]
    else:
        env = {**env, 'DARA_CONFIG_PATH': 'reload_app.main:config'}
        command = [
            sys.executable,
            '-m',
            'uvicorn',
            'dara.core.main:start',
            '--factory',
            '--host',
            '127.0.0.1',
            '--port',
            str(port),
            '--lifespan',
            'on',
            '--log-level',
            'warning',
            '--no-access-log',
        ]

    process = subprocess.Popen(  # nosec B603
        command,
        cwd=app_root,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        start_new_session=True,
        text=True,
    )
    base_url = f'http://127.0.0.1:{port}'

    try:
        _wait_for_server(process, base_url)
        yield base_url
    finally:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=10)


def _login(base_url: str) -> str:
    with httpx.Client(base_url=base_url, timeout=5) as client:
        response = client.post('/api/auth/session', json={'username': 'user', 'password': 'pass'})

        assert response.status_code == 200
        assert response.json() == {'success': True}
        return response.cookies[SESSION_TOKEN_COOKIE_NAME]


def _verify_session(base_url: str, session_token: str) -> int:
    with httpx.Client(base_url=base_url, timeout=5) as client:
        response = client.post(
            '/api/auth/verify-session',
            headers=_cookie_header(session_token),
        )
        return response.status_code


def _revoke_session(base_url: str, session_token: str):
    with httpx.Client(base_url=base_url, timeout=5) as client:
        response = client.post(
            '/api/auth/revoke-session',
            headers=_cookie_header(session_token),
        )
        assert response.status_code == 200
        assert response.json() == {'success': True}


@pytest.mark.parametrize('mode', BACKEND_MODES, ids=[mode.name for mode in BACKEND_MODES])
def test_restart_preserves_browser_auth_session_by_backend_mode(tmp_path: Path, mode: BackendMode):
    app_root = tmp_path / 'app'
    session_path = tmp_path / 'auth-sessions'
    home_path = tmp_path / 'home'
    session_path.mkdir()
    home_path.mkdir()
    _create_app(app_root, mode.config_backend)

    port = _get_available_port()
    env = _build_server_env(app_root, session_path, home_path)

    with _run_server(app_root, port, env, use_cli_reload=mode.use_cli_reload) as base_url:
        session_token = _login(base_url)
        assert _verify_session(base_url, session_token) == 200

    with _run_server(app_root, port, env, use_cli_reload=mode.use_cli_reload) as base_url:
        restart_status = _verify_session(base_url, session_token)

        if not mode.preserves_session:
            assert restart_status == 401
            return

        assert restart_status == 200
        _revoke_session(base_url, session_token)

    with _run_server(app_root, port, env, use_cli_reload=mode.use_cli_reload) as base_url:
        assert _verify_session(base_url, session_token) == 401
