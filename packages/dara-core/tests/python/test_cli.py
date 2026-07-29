import os
from unittest.mock import MagicMock, patch

from click.testing import CliRunner
from dara.core.cli import cli
from dara.core.configuration import ConfigurationBuilder
from dara.core.js_tooling.dev_server import DevServerInfo


def test_dev_uses_configured_static_files_dir():
    """The dev server should run from the static directory declared by the application config."""
    config = ConfigurationBuilder()
    config.static_files_dir = 'custom-static'
    vite_process = MagicMock()
    vite_process.__enter__.return_value = vite_process
    vite_process.stdout = []

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
