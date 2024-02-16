from multiprocessing import Value
from unittest.mock import AsyncMock

import pytest
from anyio import sleep
from fastapi.encoders import jsonable_encoder

from dara.core.interactivity.plain_variable import Variable
from dara.core.persistence import BackendStore, InMemoryBackend

pytestmark = pytest.mark.anyio


async def test_creating_plain_variable_inits_store():
    var = Variable(default=123, store=BackendStore(backend=InMemoryBackend(), uid='my_var'))
    assert isinstance(var.store, BackendStore)

    await sleep(0.5)   # Wait for the store to be initialized

    # Check store has the value written to upon creation
    assert await var.store.read() == 123

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


async def test_backend_store_default_arguments():
    """
    Test that BackendStore can be constructed without arguments
    """
    store = BackendStore()
    assert isinstance(store.uid, str)
    assert isinstance(store.backend, InMemoryBackend)


async def test_backend_store_serialization():
    """
    Test that BackendStore does not serialize the backend
    """
    store = BackendStore()
    assert 'backend' not in jsonable_encoder(store)


async def test_backend_store_unique_uid():
    # Creating stores without a uid should generate unique uids
    store_1 = BackendStore()
    store_2 = BackendStore()
    assert store_1.uid != store_2.uid
    # Both can be registered
    store_1._register()
    store_2._register()

    # Creating stores with a uid should use the provided uid
    store_3 = BackendStore(uid='my_uid')
    store_4 = BackendStore(uid='my_uid')

    store_3._register()

    # Creating a store with a uid that already exists should raise a ValueError
    with pytest.raises(ValueError):
        store_4._register()

    # Re-registering store with the same uid should raise a ValueError
    with pytest.raises(ValueError):
        store_1._register()


async def test_write_and_read(backend_store):
    # Write a value
    await backend_store.write('test_value')
    # Read the value back
    assert await backend_store.read() == 'test_value', 'The read value should match the written value.'


async def test_delete(backend_store):
    # Write a value, then delete it
    await backend_store.write('test_value')
    await backend_store.delete()
    # Verify the value is deleted
    assert await backend_store.read() is None, 'The value should be None after deletion.'


async def test_init_with_default(backend_store):
    # Simulate the initialization with a default value
    class MockVariable:
        default = 'default_value'

    await backend_store.init(MockVariable())
    # Verify the store now contains the default value
    assert (
        await backend_store.read() == 'default_value'
    ), 'The store should be initialized with the default value if it was empty.'


async def test_notify_on_write(backend_store, mock_ws_mgr):
    # Write a value and check if _notify was called
    await backend_store.write('test_value')

    mock_ws_mgr.broadcast.assert_called_once_with({'store_uid': backend_store.uid, 'value': 'test_value'})


async def test_notify_on_delete(backend_store, mock_ws_mgr):
    # Delete the value and check if _notify was called with None
    await backend_store.write('test_value', notify=False)  # Ensure there's something to delete
    await backend_store.delete()

    # Need to await to yield to the loop to process the task
    mock_ws_mgr.broadcast.assert_called_once_with({'store_uid': backend_store.uid, 'value': None})


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
