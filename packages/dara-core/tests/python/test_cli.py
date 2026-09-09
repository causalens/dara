"""Command posture is explicit and independent of legacy environment switches."""

import json
import os
from unittest.mock import patch

import pytest

from click.testing import CliRunner
from dara.core.cli import cli
from dara.core.js_tooling.models import ProjectError

pytestmark = pytest.mark.usefixtures('migration_analyzer')


@pytest.fixture(autouse=True)
def isolated_environment():
    """Keep command environment assignments local to each invocation."""
    with patch.dict(os.environ):
        yield


def test_dev_supervises_from_project_root(tmp_path, monkeypatch):
    """The frontend and backend share the selected project and explicit serving options."""
    (tmp_path / 'pyproject.toml').write_text('[tool.dara]\nconfig = "example.main:config"\n')
    monkeypatch.chdir(tmp_path)
    with patch('dara.core.cli.check_toolchain'), patch('dara.core.cli.supervise') as supervise:
        result = CliRunner().invoke(cli, ['dev', '--port', '3100', '--disable-metrics'])
    assert result.exception is None
    root, reference, serving = supervise.call_args.args
    assert root == tmp_path.resolve()
    assert reference == 'example.main:config'
    assert serving['port'] == 3100
    # The dev proxy serves project files, so it stays on loopback unless --host widens it.
    assert serving['host'] == '127.0.0.1'
    assert os.environ['DARA_COMMAND'] == 'dev'
    assert os.environ['DARA_LIVE_RELOAD'] == 'TRUE'


def test_backend_only_needs_no_javascript_toolchain(monkeypatch):
    """Backend debugging is an explicit operation even without installed frontend tools."""
    monkeypatch.setenv('PATH', '')
    with patch('dara.core.cli.supervise') as supervise:
        result = CliRunner().invoke(cli, ['dev', '--backend-only', '--no-reload', '--disable-metrics'])
    assert result.exception is None
    assert supervise.call_args.kwargs['backend_only']
    assert supervise.call_args.kwargs['no_reload']
    assert os.environ['DARA_LIVE_RELOAD'] == 'FALSE'


def test_start_uses_deployment_posture_without_tools(monkeypatch):
    """Serving an artifact does not probe Node, spawn Vite, or enable a reload loop."""
    monkeypatch.setenv('PATH', '')
    monkeypatch.setenv('DARA_HMR_MODE', 'TRUE')
    with patch('dara.core.cli.uvicorn.run') as run:
        result = CliRunner().invoke(cli, ['start', '--port', '3100', '--disable-metrics'])
    assert result.exception is None
    assert run.call_args.kwargs['port'] == 3100
    assert run.call_args.kwargs['host'] == '0.0.0.0'  # nosec B104
    assert 'reload' not in run.call_args.kwargs
    assert os.environ['DARA_COMMAND'] == 'start'
    assert os.environ['DARA_LIVE_RELOAD'] == 'FALSE'


@pytest.mark.parametrize('option', ['--enable-hmr', '--skip-jsbuild', '--reload', '--production', '--dev-port'])
def test_start_rejects_legacy_switches(option):
    """Removed flags must fail instead of silently changing deployment behavior."""
    result = CliRunner().invoke(cli, ['start', option])
    assert result.exit_code != 0
    assert f'{option} was removed:' in result.output
    assert 'dara ' in result.output


def _missing(binary, **kwargs):
    raise ProjectError(f'toolchain.{binary}', f'{binary} is required on PATH', f'install {binary}')


def test_check_reports_every_independent_failure():
    """Missing tools and a broken configuration are all reported by one check run."""

    def broken(config):
        raise ImportError('No module named example')

    with patch('dara.core.cli.check_binary', _missing), patch('dara.core.cli._manifest', broken):
        result = CliRunner().invoke(cli, ['check', '--json'])
    assert result.exit_code == 1
    codes = [d['code'] for d in json.loads(result.stdout)]
    assert codes == ['toolchain.node', 'toolchain.pnpm', 'project.import']


def test_check_skips_the_plugin_when_its_prerequisites_failed(tmp_path, monkeypatch):
    """Dependency drift and a missing toolchain are both reported; the plugin needs both and is skipped."""
    monkeypatch.chdir(tmp_path)
    manifest = type('Manifest', (), {'out_dir': str(tmp_path / 'dist')})()
    with (
        patch('dara.core.cli.check_binary', _missing),
        patch('dara.core.cli._manifest', lambda config: (tmp_path, manifest)),
        patch('dara.core.cli.dependency_plan', lambda root, manifest: {tmp_path / 'package.json': '{}'}),
        patch('dara.core.cli.run_plugin') as plugin,
    ):
        result = CliRunner().invoke(cli, ['check', '--json'])
    assert result.exit_code == 1
    assert [d['code'] for d in json.loads(result.stdout)] == ['toolchain.node', 'toolchain.pnpm', 'dependency.drift']
    plugin.assert_not_called()


def test_check_reports_a_consistent_project():
    """A passing run reports readiness with empty fixes and exits successfully."""
    manifest = type('Manifest', (), {'out_dir': 'missing-dist'})()
    with (
        patch('dara.core.cli.check_binary', lambda binary, **kwargs: '1.0.0'),
        patch('dara.core.cli._manifest', lambda config: (None, manifest)),
        patch('dara.core.cli.dependency_plan', lambda root, manifest: {}),
        patch('dara.core.cli.lockfile_agrees', lambda root: True),
        patch('dara.core.cli.run_plugin', lambda *args: type('Result', (), {'stdout': '{"runtime": "node 24"}'})()),
    ):
        result = CliRunner().invoke(cli, ['check', '--json'])
    assert result.exit_code == 0, result.output
    diagnostics = json.loads(result.stdout)
    assert [d['code'] for d in diagnostics] == ['toolchain.ready', 'project.ready']
    assert all(d['fix'] == '' for d in diagnostics)


@pytest.mark.parametrize(('value', 'expected'), [('500', 500), ('', None), ('many', None)])
def test_start_honours_the_request_limit_variable(monkeypatch, value, expected):
    """LIMIT_MAX_REQUESTS recycles the server after that many requests, as in Dara 1.x."""
    monkeypatch.setenv('LIMIT_MAX_REQUESTS', value)
    with patch('dara.core.cli.uvicorn.run') as run:
        result = CliRunner().invoke(cli, ['start', '--disable-metrics'])
    assert result.exception is None
    assert run.call_args.kwargs.get('limit_max_requests') == expected
