import os

import pytest


@pytest.fixture(scope='session', autouse=True)
def setup_pool_env():
    """Runs before all tests"""
    os.environ['DARA_POOL_MAX_WORKERS'] = '2'
    yield


@pytest.fixture
def anyio_backend():
    return 'asyncio'
