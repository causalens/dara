import inspect
import json
import tempfile
from typing import Any, Awaitable, Callable, Dict, Set
from unittest.mock import AsyncMock, call

import pytest
from anyio import sleep
from fastapi.encoders import jsonable_encoder
from pydantic import Field, ValidationError

from dara.core.auth.definitions import USER, UserData
from dara.core.interactivity.plain_variable import Variable
from dara.core.internal.websocket import WS_CHANNEL
from dara.core.persistence import (
    BackendStore,
    FileBackend,
    InMemoryBackend,
    PersistenceBackend,
)

from tests.python.utils import wait_assert, wait_for

pytestmark = pytest.mark.anyio

USER_1 = UserData(
    identity_id='user_1',
    identity_name='user_1',
    identity_email='user1@example.com',
)

USER_2 = UserData(identity_id='user_2', identity_name='user_2', identity_email='user2@example.com')


async def maybe_await(value):
    if inspect.iscoroutine(value):
        return await value
    return value


@pytest.fixture
def in_memory_backend():
    return InMemoryBackend()


@pytest.fixture
def file_backend():
    with tempfile.TemporaryDirectory() as tmpdir:
        yield FileBackend(path=tmpdir + '/test.json')


@pytest.fixture
def backend_store(in_memory_backend):
    return BackendStore(backend=in_memory_backend, uid='test_store')


@pytest.fixture
def user_backend_store(in_memory_backend):
    return BackendStore(backend=in_memory_backend, uid='test_store', scope='user')


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


async def test_creating_plain_variable_inits_store():
    var = Variable(default=123, store=BackendStore(backend=InMemoryBackend(), uid='my_var'))
    assert isinstance(var.store, BackendStore)

    await sleep(0.5)   # Wait for the store to be initialized

    # Check that when reading the value, the default is respected
    assert await var.store.read() == 123

    # Verify store is put into registry
    from dara.core.internal.registries import backend_store_registry

    entry = backend_store_registry.get('my_var')
    assert entry.uid == 'my_var'
    assert entry.store == var.store


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


async def test_write_and_read(backend_store):
    # Write a value
    await backend_store.write('test_value')
    # Read the value back
    assert await backend_store.read() == 'test_value', 'The read value should match the written value.'


async def test_user_scope_data_separation(user_backend_store):
    USER.set(USER_1)

    # Write a value as user1
    await user_backend_store.write('test_value')

    # Read the value back as user1
    assert await user_backend_store.read() == 'test_value', 'The read value should match the written value.'

    USER.set(USER_2)

    # Read the value back as user2
    assert await user_backend_store.read() is None, 'The value should be None for user2.'

    # Write a different value as user2
    await user_backend_store.write('test_value_2')
    assert await user_backend_store.read() == 'test_value_2', 'The read value should match the written value.'

    USER.set(USER_1)

    # Read the value back as user1
    assert await user_backend_store.read() == 'test_value', 'The read value should match the written value.'

    USER.set(None)

    # Read/write/delete the value back as no user, should raise
    with pytest.raises(ValueError):
        await user_backend_store.read()

    with pytest.raises(ValueError):
        await user_backend_store.write('test_value')

    with pytest.raises(ValueError):
        await user_backend_store.delete()

    # Test we can get all values without being a specific user
    all_values = await user_backend_store.get_all()
    assert all_values[USER_1.identity_id] == 'test_value'
    assert all_values[USER_2.identity_id] == 'test_value_2'


async def test_user_scope_notifications(user_backend_store, mock_ws_mgr):
    # Setup connections for user1 and user2
    from dara.core.internal.registries import sessions_registry, websocket_registry

    sessions_registry.set(USER_1.identity_id, {'session1', 'session2'})
    websocket_registry.set('session1', {'channel1'})
    websocket_registry.set('session2', {'channel2'})

    sessions_registry.set(USER_2.identity_id, {'session3', 'session4'})
    websocket_registry.set('session3', {'channel3'})
    websocket_registry.set('session4', {'channel4'})

    USER.set(USER_1)

    # Write a value as user1
    await user_backend_store.write('test_value', notify=True)

    # Verify the value was sent to user1 channels
    assert mock_ws_mgr.send_message_to_user.call_count == 1
    mock_ws_mgr.send_message_to_user.assert_has_calls(
        [call(USER_1.identity_id, {'store_uid': user_backend_store.uid, 'value': 'test_value'}, ignore_channel=None)]
    )

    USER.set(USER_2)

    # Write a value as user2
    await user_backend_store.write('test_value_2', notify=True)

    # Verify the value was sent to user2 channels
    assert mock_ws_mgr.send_message_to_user.call_count == 2
    mock_ws_mgr.send_message_to_user.assert_has_calls(
        [call(USER_2.identity_id, {'store_uid': user_backend_store.uid, 'value': 'test_value_2'}, ignore_channel=None)],
        any_order=True,
    )

    # test that if we're under a WS_CHANNEL scope, we don't notify the same originating channel
    WS_CHANNEL.set('channel3')
    await user_backend_store.write('test_value_3', notify=True)
    assert mock_ws_mgr.send_message_to_user.call_count == 3
    mock_ws_mgr.send_message_to_user.assert_has_calls(
        [
            call(
                USER_2.identity_id,
                {'store_uid': user_backend_store.uid, 'value': 'test_value_3'},
                ignore_channel='channel3',
            )
        ],
        any_order=True,
    )


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


async def test_init_with_default_user(user_backend_store):
    USER.set(USER_1)
    # Simulate the initialization with a default value
    class MockVariable:
        default = 'default_value'

    await user_backend_store.init(MockVariable())
    # Verify the store now contains the default value
    assert (
        await user_backend_store.read() == 'default_value'
    ), 'The store should be initialized with the default value if it was empty.'


async def test_notify_on_write(backend_store, mock_ws_mgr):
    # Write a value and check if _notify was called
    await backend_store.write('test_value')

    mock_ws_mgr.broadcast.assert_called_once_with(
        {'store_uid': backend_store.uid, 'value': 'test_value'}, ignore_channel=None
    )


async def test_notify_on_delete(backend_store, mock_ws_mgr):
    # Delete the value and check if _notify was called with None
    await backend_store.write('test_value', notify=False)  # Ensure there's something to delete
    await backend_store.delete()

    # Need to await to yield to the loop to process the task
    mock_ws_mgr.broadcast.assert_called_once_with({'store_uid': backend_store.uid, 'value': None}, ignore_channel=None)


@pytest.mark.parametrize('backend_name', [('in_memory_backend'), ('file_backend')])
async def test_backend(backend_name, request):
    """
    Standard backend test, parametrized to run across all implementations
    """
    backend = request.getfixturevalue(backend_name)

    # Test writing to the backend
    await maybe_await(backend.write('key1', 'value1'))
    # Test reading back the value
    assert await maybe_await(backend.read('key1')) == 'value1', 'The read value should match the written value.'

    # Write another value to the backend
    await maybe_await(backend.write('key2', 'value2'))
    # Test deletion
    await maybe_await(backend.delete('key2'))
    # Test the value is no longer available
    assert await maybe_await(backend.read('key2')) is None, 'The value should be None after deletion.'
    # Test reading a key that doesn't exist
    assert await maybe_await(backend.read('nonexistent_key')) is None, 'Reading a nonexistent key should return None.'


async def test_file_backend_requires_json():
    """
    Test that FileBackend requires a JSON-serializable value
    """
    with pytest.raises(ValidationError):
        FileBackend(path='foo.bar')

    FileBackend(path='foo.json')


async def test_file_backend_existing_value_not_overwritten():
    """
    Test that FileBackend does not overwrite existing values if a file already exists
    """
    with tempfile.NamedTemporaryFile(suffix='.json', delete=True) as tmpfile:
        init_data = {'global': 'value1'}
        tmpfile.write(json.dumps({'global': 'value1'}).encode('utf-8'))
        tmpfile.flush()

        # sanity check that the file contains the expected value
        with open(tmpfile.name, 'r') as f:
            assert json.load(f) == init_data

        backend = FileBackend(path=tmpfile.name)
        variable = Variable(default='default_value', store=BackendStore(backend=backend, uid='my_var'))
        assert isinstance(variable.store, BackendStore)

        # read value, ensure it's as existed in the file rather than default
        assert await variable.store.read() == 'value1'


async def test_file_backend_user_scope_existing_value_not_overwritten():
    """
    Test that FileBackend does not overwrite existing values if a file already exists for user values
    """
    with tempfile.NamedTemporaryFile(suffix='.json', delete=True) as tmpfile:
        USER.set(USER_1)
        init_data = {USER_1.identity_id: 'value1'}
        tmpfile.write(json.dumps(init_data).encode('utf-8'))
        tmpfile.flush()

        # sanity check that the file contains the expected value
        with open(tmpfile.name, 'r') as f:
            assert json.load(f) == init_data

        backend = FileBackend(path=tmpfile.name)
        variable = Variable(default='default_value', store=BackendStore(backend=backend, uid='my_var', scope='user'))
        assert isinstance(variable.store, BackendStore)

        # read value, ensure it's as existed in the file rather than default
        assert await variable.store.read() == 'value1'


class CustomBackend(PersistenceBackend):
    """
    Custom backend implementation that supports subscriptions
    """

    data: Dict[str, Any] = Field(default_factory=dict)
    subscribers: list[Callable[[str, Any], Awaitable[None]]] = Field(default_factory=list, exclude=True)

    async def has(self, key: str) -> bool:
        return key in self.data

    async def write(self, key: str, value: Any):
        self.data[key] = value
        # Notify subscribers
        for callback in self.subscribers:
            await callback(key, value)

    async def read(self, key: str):
        return self.data.get(key)

    async def delete(self, key: str):
        if key in self.data:
            del self.data[key]
            # Notify subscribers with None value
            for callback in self.subscribers:
                await callback(key, None)

    async def get_all(self):
        return self.data.copy()

    async def subscribe(self, on_value: Callable[[str, Any], Awaitable[None]]):
        """
        Subscribe to changes in the backend
        """
        # Subscribe to all keys
        self.subscribers.append(on_value)

    async def trigger_external_change(self, key: str, value: Any):
        """
        Simulate an external change to the data
        """
        self.data[key] = value
        for callback in self.subscribers:
            await callback(key, value)


@pytest.fixture
def custom_backend():
    return CustomBackend()


async def test_backend_subscribe_global(custom_backend, mock_ws_mgr):
    """
    Test that BackendStore can subscribe to changes in a global-scoped backend
    """
    # Create a store with the custom backend
    store = BackendStore(backend=custom_backend, uid='test_store')

    # Initialize the store with a variable
    Variable(default='default_value', store=store)

    # Verify the store now contains the default value
    await wait_for(store.read)
    assert await store.read() == 'default_value', 'The store should be initialized with the default value.'

    # Simulate an external change to the data
    await custom_backend.trigger_external_change('global', 'external_value')

    # Verify the notification was sent
    mock_ws_mgr.broadcast.assert_called_with({'store_uid': store.uid, 'value': 'external_value'}, ignore_channel=None)


async def test_backend_subscribe_user(custom_backend, mock_ws_mgr: AsyncMock):
    """
    Test that BackendStore can subscribe to changes in a user-scoped backend
    """
    USER.set(USER_1)

    # Create a store with the custom backend
    store = BackendStore(backend=custom_backend, uid='test_store', scope='user')

    # Initialize the store with a variable
    Variable(default='default_value', store=store)

    # Verify the store now contains the default value
    await wait_for(store.read)
    assert await store.read() == 'default_value'

    mock_ws_mgr.send_message_to_user.reset_mock()

    # Simulate an external change to the data for USER_1
    await custom_backend.trigger_external_change(USER_1.identity_id, 'external_value_1')

    # Verify the notification was sent to USER_1
    mock_ws_mgr.send_message_to_user.assert_called_with(
        USER_1.identity_id, {'store_uid': store.uid, 'value': 'external_value_1'}, ignore_channel=None
    )
    assert mock_ws_mgr.send_message_to_user.call_count == 1

    # Change to USER_2
    USER.set(USER_2)

    # Reset mock to clear previous calls
    mock_ws_mgr.send_message_to_user.reset_mock()

    # Simulate an external change to the data for USER_2
    await custom_backend.trigger_external_change(USER_2.identity_id, 'external_value_2')

    # Verify the notification was sent to USER_2
    mock_ws_mgr.send_message_to_user.assert_called_with(
        USER_2.identity_id, {'store_uid': store.uid, 'value': 'external_value_2'}, ignore_channel=None
    )
    assert mock_ws_mgr.send_message_to_user.call_count == 1


async def test_backend_subscribe_multiple_stores(custom_backend, mock_ws_mgr):
    """
    Test that multiple stores can subscribe to the same backend
    """
    # Create two stores with the same backend
    store1 = BackendStore(backend=custom_backend, uid='test_store_1')
    store2 = BackendStore(backend=custom_backend, uid='test_store_2')

    # Initialize both stores
    Variable(default='default_value', store=store1)
    Variable(default='default_value', store=store2)
    await wait_for(store1.read)
    await wait_for(store2.read)

    # Reset mock to clear initialization calls
    mock_ws_mgr.broadcast.reset_mock()

    # Simulate an external change to the data
    await custom_backend.trigger_external_change('global', 'external_value')

    # Verify both stores received notifications
    assert mock_ws_mgr.broadcast.call_count == 2
    mock_ws_mgr.broadcast.assert_any_call({'store_uid': store1.uid, 'value': 'external_value'}, ignore_channel=None)
    mock_ws_mgr.broadcast.assert_any_call({'store_uid': store2.uid, 'value': 'external_value'}, ignore_channel=None)
