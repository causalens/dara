from unittest.mock import AsyncMock

import pytest
from tests.python.utils import wait_for

from dara.core.interactivity.plain_variable import Variable
from dara.core.persistence import BackendStore, InMemoryBackend

pytestmark = pytest.mark.anyio


def test_creating_plain_variable_inits_store():
    var = Variable(default=123, store=BackendStore(backend=InMemoryBackend(), uid='my_var'))
    assert isinstance(var.store, BackendStore)
    # Check store has the value written to upon creation
    assert var.store.read() == var.default

    # Verify store is put into registry
    from dara.core.internal.registries import backend_store_registry

    entry = backend_store_registry.get('my_var')
    assert entry.uid == 'my_var'
    assert entry.store == var.store


@pytest.fixture
def in_memory_backend():
    return InMemoryBackend()


@pytest.fixture
def backend_store(in_memory_backend):
    return BackendStore(backend=in_memory_backend, uid='test_store')


@pytest.fixture(autouse=True)
def mock_ws_mgr():
    from dara.core.internal.registries import utils_registry
    from dara.core.internal.websocket import WebsocketManager

    try:
        original_mgr = utils_registry.get('WebsocketManager')
    except KeyError:
        original_mgr = None

    try:
        mgr_mock = AsyncMock()
        utils_registry.set('WebsocketManager', mgr_mock)
        yield mgr_mock
    finally:
        utils_registry.set('WebsocketManager', original_mgr)


@pytest.fixture(autouse=True)
def cleanup_store_registry():
    from dara.core.internal.registries import backend_store_registry

    yield
    backend_store_registry.replace({})


async def test_write_and_read(backend_store):
    # Write a value
    backend_store.write('test_value')
    # Read the value back
    assert backend_store.read() == 'test_value', 'The read value should match the written value.'


async def test_delete(backend_store):
    # Write a value, then delete it
    backend_store.write('test_value')
    backend_store.delete()
    # Verify the value is deleted
    assert backend_store.read() is None, 'The value should be None after deletion.'


async def test_init_with_default(backend_store):
    # Simulate the initialization with a default value
    class MockVariable:
        default = 'default_value'

    backend_store.init(MockVariable())
    # Verify the store now contains the default value
    assert (
        backend_store.read() == 'default_value'
    ), 'The store should be initialized with the default value if it was empty.'


async def test_notify_on_write(backend_store, mock_ws_mgr):
    # Write a value and check if _notify was called
    backend_store.write('test_value')

    # Need to await to yield to the loop to process the task
    await wait_for(
        lambda: mock_ws_mgr.broadcast.assert_called_once_with({'store_uid': backend_store.uid, 'value': 'test_value'})
    )


async def test_notify_on_delete(backend_store, mock_ws_mgr):
    # Delete the value and check if _notify was called with None
    backend_store.write('test_value', notify=False)  # Ensure there's something to delete
    backend_store.delete()

    # Need to await to yield to the loop to process the task
    await wait_for(
        lambda: mock_ws_mgr.broadcast.assert_called_once_with({'store_uid': backend_store.uid, 'value': None})
    )


def test_memory_backend(in_memory_backend):
    # Test writing to the backend
    in_memory_backend.write('key1', 'value1')
    # Test reading back the value
    assert in_memory_backend.read('key1') == 'value1', 'The read value should match the written value.'

    # Write another value to the backend
    in_memory_backend.write('key2', 'value2')
    # Test deletion
    in_memory_backend.delete('key2')
    # Test the value is no longer available
    assert in_memory_backend.read('key2') is None, 'The value should be None after deletion.'
    # Test reading a key that doesn't exist
    assert in_memory_backend.read('nonexistent_key') is None, 'Reading a nonexistent key should return None.'
