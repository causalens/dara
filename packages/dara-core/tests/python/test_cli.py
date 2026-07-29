from unittest.mock import MagicMock, patch

from click.testing import CliRunner
from dara.core.cli import cli
from dara.core.configuration import ConfigurationBuilder


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
        patch('dara.core.cli.subprocess.Popen', return_value=vite_process),
    ):
        result = CliRunner().invoke(cli, ['dev', '--config', 'app.main:config'])

    assert result.exception is None
    import_config.assert_called_once_with('app.main:config')
    chdir.assert_called_once_with('custom-static')


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
