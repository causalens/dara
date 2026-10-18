import os
from unittest.mock import MagicMock, patch

import pytest

from click.testing import CliRunner
from dara.core.cli import cli
from dara.core.configuration import ConfigurationBuilder
from dara.core.js_tooling.dev_server import DevServerInfo, DevServerSettings


def test_dev_uses_configured_static_files_dir():
    """The dev server should run from the static directory declared by the application config."""
    config = ConfigurationBuilder()
    config.static_files_dir = 'custom-static'
    vite_process = MagicMock()
    vite_process.__enter__.return_value = vite_process
    vite_process.stdout = []
    vite_process.wait.return_value = 0

    with (
        patch('dara.core.cli.JsConfig.from_file', return_value=None),
        patch('dara.core.cli.import_config', return_value=(MagicMock(), config)) as import_config,
        patch('dara.core.cli.os.chdir') as chdir,
        patch('dara.core.cli.subprocess.Popen', return_value=vite_process) as popen,
    ):
        result = CliRunner().invoke(cli, ['dev', '--config', 'app.main:config', '--port', '3100'])

    assert result.exception is None
    import_config.assert_called_once_with('app.main:config')
    chdir.assert_called_once_with('custom-static')
    vite_env = popen.call_args.kwargs['env']
    assert vite_env['VITE_SERVER_PORT'] == '3100'
    assert DevServerInfo.decode(vite_env['VITE_DARA_DEV_SERVER_INFO']).origin == 'http://localhost:3100'


def test_dev_infers_default_config_path():
    """The dev command should infer the same conventional config path as the start command."""
    config = ConfigurationBuilder()
    vite_process = MagicMock()
    vite_process.__enter__.return_value = vite_process
    vite_process.stdout = []
    vite_process.wait.return_value = 0

    with (
        patch('dara.core.cli.JsConfig.from_file', return_value=None),
        patch('dara.core.cli.os.getcwd', return_value='/workspace/my-app'),
        patch('dara.core.cli.import_config', return_value=(MagicMock(), config)) as import_config,
        patch('dara.core.cli.os.chdir'),
        patch('dara.core.cli.subprocess.Popen', return_value=vite_process),
    ):
        result = CliRunner().invoke(cli, ['dev'])

    assert result.exception is None
    import_config.assert_called_once_with('my_app.main:config')


def test_start_sets_development_server_port():
    """The backend should use the development port supplied on the start command."""
    configured_ports = []

    def capture_development_port(*_args, **_kwargs):
        configured_ports.append(os.environ.get('VITE_SERVER_PORT'))

    with (
        patch.dict(os.environ),
        patch('dara.core.cli.uvicorn.run', side_effect=capture_development_port),
    ):
        result = CliRunner().invoke(
            cli,
            ['start', '--enable-hmr', '--dev-port', '3100', '--skip-jsbuild', '--disable-metrics'],
        )

    assert result.exception is None
    assert configured_ports == ['3100']


def test_start_rejects_development_port_outside_hmr():
    """A development port should not be accepted when the backend is not in development mode."""
    result = CliRunner().invoke(cli, ['start', '--dev-port', '3100'])

    assert result.exit_code != 0
    assert '--dev-port requires --enable-hmr' in result.output


@pytest.fixture(autouse=True)
def isolate_server_configuration(monkeypatch, tmp_path):
    """Keep CLI invocations independent of developer settings and earlier invocations."""
    monkeypatch.chdir(tmp_path)
    for variable in (
        'DARA_PORT',
        'DARA_HOST',
        'DARA_METRICS_PORT',
        'DARA_DISABLE_METRICS',
        'VITE_SERVER_PORT',
        'VITE_SERVER_HOST',
        'VITE_SERVER_PROTOCOL',
    ):
        monkeypatch.delenv(variable, raising=False)
    # start writes these variables for the backend subprocess.
    with patch.dict(os.environ):
        yield


@pytest.mark.parametrize('source', ['env-file', 'environment', 'cli'])
def test_start_server_configuration_precedence(monkeypatch, tmp_path, source):
    """CLI options override environment variables, which override project .env defaults."""
    (tmp_path / '.env').write_text('DARA_PORT=8100\nDARA_METRICS_PORT=10100\nDARA_HOST=127.0.0.1\n')
    expected_port, expected_metrics, expected_host = 8100, '10100', '127.0.0.1'
    args = ['start', '--skip-jsbuild']
    if source in {'environment', 'cli'}:
        monkeypatch.setenv('DARA_PORT', '8200')
        monkeypatch.setenv('DARA_METRICS_PORT', '10200')
        monkeypatch.setenv('DARA_HOST', '127.0.0.2')
        expected_port, expected_metrics, expected_host = 8200, '10200', '127.0.0.2'
    if source == 'cli':
        args += ['--port', '8300', '--metrics-port', '10300', '--host', '127.0.0.3']
        expected_port, expected_metrics, expected_host = 8300, '10300', '127.0.0.3'

    with (
        patch('dara.core.cli.uvicorn.run') as run,
        patch('dara.core.cli.find_available_port') as find_port,
    ):
        result = CliRunner().invoke(cli, args)

    assert result.exception is None
    assert run.call_args.kwargs['port'] == expected_port
    assert run.call_args.kwargs['host'] == expected_host
    assert os.environ['DARA_METRICS_PORT'] == expected_metrics
    find_port.assert_not_called()


def test_start_still_selects_available_ports():
    """Without overrides both backend and metrics retain automatic port selection."""
    with (
        patch('dara.core.cli.uvicorn.run') as run,
        patch('dara.core.cli.find_available_port', side_effect=[8001, 10001]) as find_port,
    ):
        result = CliRunner().invoke(cli, ['start', '--skip-jsbuild'])

    assert result.exception is None
    assert run.call_args.kwargs['port'] == 8001
    assert os.environ['DARA_METRICS_PORT'] == '10001'
    assert find_port.call_count == 2


@pytest.mark.parametrize('source', ['env-file', 'environment', 'cli'])
@pytest.mark.parametrize('disabled', [True, False])
def test_start_metrics_can_be_disabled(monkeypatch, tmp_path, source, disabled):
    """Metrics opt-out works from project defaults, the environment, and the CLI."""
    args = ['start', '--port', '8100', '--skip-jsbuild']
    if source == 'env-file':
        (tmp_path / '.env').write_text(f'DARA_DISABLE_METRICS={disabled}\n')
    elif source == 'environment':
        (tmp_path / '.env').write_text(f'DARA_DISABLE_METRICS={not disabled}\n')
        monkeypatch.setenv('DARA_DISABLE_METRICS', str(disabled))
    elif disabled:
        monkeypatch.setenv('DARA_DISABLE_METRICS', 'false')
        args.append('--disable-metrics')

    with (
        patch('dara.core.cli.uvicorn.run'),
        patch('dara.core.cli.find_available_port', return_value=10100) as find_port,
    ):
        result = CliRunner().invoke(cli, args)

    assert result.exception is None
    assert os.environ['DARA_DISABLE_METRICS'] == ('TRUE' if disabled else 'FALSE')
    assert find_port.call_count == (0 if disabled else 1)


@pytest.mark.parametrize('variable, option', [('DARA_PORT', '--port'), ('DARA_METRICS_PORT', '--metrics-port')])
@pytest.mark.parametrize('value', ['0', '65536', 'invalid'])
@pytest.mark.parametrize('source', ['env-file', 'environment', 'cli'])
def test_start_rejects_invalid_ports(monkeypatch, tmp_path, variable, option, value, source):
    """Port overrides are parsed before launching any server, regardless of their source."""
    args = ['start']
    if source == 'env-file':
        (tmp_path / '.env').write_text(f'{variable}={value}\n')
    elif source == 'environment':
        monkeypatch.setenv(variable, value)
    else:
        args += [option, value]

    with patch('dara.core.cli.uvicorn.run') as run:
        result = CliRunner().invoke(cli, args)

    assert result.exit_code == 2
    assert option in result.output
    run.assert_not_called()


def test_worktrees_resolve_independent_server_ports(tmp_path, monkeypatch):
    """Each worktree's two commands agree on Vite while using separate backend and metrics ports."""
    for name, backend_port, metrics_port, vite_port in [('one', 8100, 10100, 3100), ('two', 8200, 10200, 3200)]:
        project = tmp_path / name
        project.mkdir()
        (project / '.env').write_text(
            f'DARA_PORT={backend_port}\nDARA_METRICS_PORT={metrics_port}\nVITE_SERVER_PORT={vite_port}\n'
        )
        monkeypatch.chdir(project)
        config = ConfigurationBuilder()
        process = MagicMock()
        process.__enter__.return_value = process
        process.stdout = []
        process.wait.return_value = 0
        with (
            patch.dict(os.environ),
            patch('dara.core.cli.uvicorn.run') as run,
            patch('dara.core.cli.JsConfig.from_file', return_value=None),
            patch('dara.core.cli.import_config', return_value=(MagicMock(), config)),
            patch('dara.core.cli.os.chdir'),
            patch('dara.core.cli.subprocess.Popen', return_value=process) as popen,
        ):
            start = CliRunner().invoke(cli, ['start', '--enable-hmr', '--skip-jsbuild'])
            assert start.exception is None
            assert run.call_args.kwargs['port'] == backend_port
            assert os.environ['DARA_METRICS_PORT'] == str(metrics_port)
            backend_origin = DevServerSettings().origin
            dev = CliRunner().invoke(cli, ['dev'])
            assert dev.exception is None
            vite_env = popen.call_args.kwargs['env']
            assert vite_env['VITE_SERVER_PORT'] == str(vite_port)
            assert DevServerInfo.decode(vite_env['VITE_DARA_DEV_SERVER_INFO']).origin == backend_origin


def test_dev_reports_vite_failure():
    """A Vite startup failure, including a busy strict port, must fail dara dev too."""
    process = MagicMock()
    process.__enter__.return_value = process
    process.stdout = [b'Port 3100 is already in use\n']
    process.wait.return_value = 1
    with (
        patch('dara.core.cli.JsConfig.from_file', return_value=None),
        patch('dara.core.cli.import_config', return_value=(MagicMock(), ConfigurationBuilder())),
        patch('dara.core.cli.os.chdir'),
        patch('dara.core.cli.subprocess.Popen', return_value=process),
    ):
        result = CliRunner().invoke(cli, ['dev', '--port', '3100'])

    assert result.exit_code == 1
    assert 'Port 3100 is already in use' in result.output
