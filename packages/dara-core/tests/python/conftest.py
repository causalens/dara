import os
from pathlib import Path

import pytest


@pytest.fixture(scope='session', autouse=True)
def setup_pool_env():
    """Runs before all tests"""
    os.environ['DARA_POOL_MAX_WORKERS'] = '2'
    yield


@pytest.fixture
def anyio_backend():
    return 'asyncio'


@pytest.fixture
def migration_analyzer(monkeypatch):
    """Exercise the real built Node analyzer while keeping migration fixtures independent of npm."""
    package = Path(__file__).resolve().parents[3] / 'vite-plugin'
    executable = package / 'dist/cli.js'
    assert executable.is_file(), 'Build @darajs/vite-plugin before running migration integration tests'
    monkeypatch.setattr(
        'dara.core.js_tooling.migration_analyzer.analyzer_command',
        lambda root, version: ['node', str(executable), 'analyze-migration'],
    )
    return package
