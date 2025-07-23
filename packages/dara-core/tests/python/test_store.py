import pytest

from dara.core.auth.definitions import SESSION_ID, USER, UserData
from dara.core.base_definitions import CacheType
from dara.core.internal.store import Store

pytestmark = pytest.mark.anyio


async def test_simple_store_behavior():
    """Test that the store works as a simple key value store"""
    store = Store()
    store.set('test', 'value')

    assert store.get('test') == 'value'


async def test_empty_store():
    """Test the empty store method"""
    store = Store()

    store.set('test', 'value')

    store.set('test1', 'value1')

    store.empty_stores()
    assert store.get('test') is None
    assert store.get('test1') is None


async def test_session_store_behavior():
    """Test that the store works with the session variable"""
    store = Store()
    store.set('test', 'value')

    # Now set the same key but only for the current session
    SESSION_ID.set('session_1')
    store.set('test', 'session_value', cache_type=CacheType.SESSION)

    # The original value should be untouched as it's in the global store
    assert store.get('test') == 'value'

    # Fetching from the session store should return the new value
    assert store.get('test', cache_type=CacheType.SESSION) == 'session_value'

    # Changing the session should now make the last call return None
    SESSION_ID.set('session_2')
    assert store.get('test', cache_type=CacheType.SESSION) is None


async def test_user_store_behavior():
    """Test that the store works with the user variable"""
    store = Store()
    store.set('test', 'value')

    # Now set the same key but only for the current user
    USER.set(
        UserData(
            identity_name='test1',
        )
    )
    store.set('test', 'user_value', cache_type=CacheType.USER)

    # The original value should be untouched as it's in the global store
    assert store.get('test') == 'value'

    # Fetching from the user store should return the new value
    assert store.get('test', cache_type=CacheType.USER) == 'user_value'

    # Changing the user should now make the last call return None
    USER.set(
        UserData(
            identity_name='test2',
        )
    )
    assert store.get('test', cache_type=CacheType.USER) is None


async def test_session_list():
    """Test that the store list method"""
    store = Store()
    # Add to global
    store.set('key1', 'value1')
    # Add to session
    SESSION_ID.set('session_1')
    store.set('session_key1', 'session_value1', cache_type=CacheType.SESSION)
    # Check store lists
    assert store.list() == ['key1']
    assert store.list(cache_type=CacheType.SESSION) == ['session_key1']
    # Ensure new session returns empty list
    SESSION_ID.set('session_2')
    assert store.list(cache_type=CacheType.SESSION) == []


async def test_user_list():
    """Test that the store list method works for user"""
    store = Store()
    # Add to global
    store.set('key1', 'value1')
    # Add to user
    USER.set(
        UserData(
            identity_id='001',
            identity_email='test@email.com',
            identity_name='test1',
            groups=[],
        )
    )
    store.set('user_key1', 'user_value1', cache_type=CacheType.USER)
    # Check store lists
    assert store.list() == ['key1']
    assert store.list(cache_type=CacheType.USER) == ['user_key1']
    # Ensure new user returns empty list
    USER.set(
        UserData(
            identity_id='002',
            identity_email='test2@email.com',
            identity_name='test2',
            groups=[],
        )
    )
    assert store.list(cache_type=CacheType.USER) == []
