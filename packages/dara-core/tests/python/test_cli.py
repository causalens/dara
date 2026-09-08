"""Command posture is explicit and independent of legacy environment switches."""

import os
from unittest.mock import patch

import pytest

from click.testing import CliRunner
from dara.core.cli import cli


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
