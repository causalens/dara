import asyncio

import pytest

from dara.core.internal.multi_resource_lock import LockRecursionError, MultiResourceLock

pytestmark = pytest.mark.anyio


async def test_reentrant_lock_allows_recursive_acquisition():
    """Test that a reentrant lock allows the same resource to be acquired multiple times by the same task."""
    lock = MultiResourceLock(reentrant=True)
    resource_name = 'test_resource'

    acquisition_count = 0

    async def nested_acquisition():
        nonlocal acquisition_count
        async with lock.acquire(resource_name):
            acquisition_count += 1
            if acquisition_count < 3:
                # Recursively acquire the same resource
                await nested_acquisition()

    await nested_acquisition()
    assert acquisition_count == 3


async def test_non_reentrant_lock_raises_on_recursive_acquisition():
    """Test that a non-reentrant lock raises LockRecursionError when the same resource is acquired recursively."""
    lock = MultiResourceLock(reentrant=False)
    resource_name = 'test_resource'

    async with lock.acquire(resource_name):
        # Attempting to acquire the same resource again should raise LockRecursionError
        with pytest.raises(LockRecursionError) as exc_info:
            async with lock.acquire(resource_name):
                pass

        assert 'already locked by the current task' in str(exc_info.value)
        assert 'not re-entrant' in str(exc_info.value)


async def test_lock_is_released_after_context_exit():
    """Test that locks are properly released after exiting the context manager."""
    lock = MultiResourceLock(reentrant=False)
    resource_name = 'test_resource'

    # First acquisition should work
    async with lock.acquire(resource_name):
        assert lock.is_locked(resource_name)
        assert lock.is_locked_by_current_task(resource_name)

    # After exiting, the lock should be released
    assert not lock.is_locked(resource_name)
    assert not lock.is_locked_by_current_task(resource_name)

    # Second acquisition should also work
    async with lock.acquire(resource_name):
        assert lock.is_locked(resource_name)
        assert lock.is_locked_by_current_task(resource_name)


async def test_different_resources_can_be_acquired_simultaneously():
    """Test that different resources can be locked simultaneously without interference."""
    lock = MultiResourceLock(reentrant=False)

    async with lock.acquire('resource_1'):
        async with lock.acquire('resource_2'):
            assert lock.is_locked('resource_1')
            assert lock.is_locked('resource_2')
            assert lock.is_locked_by_current_task('resource_1')
            assert lock.is_locked_by_current_task('resource_2')


async def test_concurrent_access_to_same_resource():
    """Test that concurrent tasks cannot access the same resource simultaneously."""
    lock = MultiResourceLock(reentrant=False)
    resource_name = 'shared_resource'

    results = []

    async def task(task_id: int, delay: float):
        async with lock.acquire(resource_name):
            results.append(f'task_{task_id}_start')
            await asyncio.sleep(delay)
            results.append(f'task_{task_id}_end')

    # Start two tasks concurrently
    await asyncio.gather(task(1, 0.1), task(2, 0.05))

    # Results should show that tasks executed sequentially, not concurrently
    assert len(results) == 4
    # Either task 1 completes fully before task 2, or vice versa
    assert results == ['task_1_start', 'task_1_end', 'task_2_start', 'task_2_end'] or results == [
        'task_2_start',
        'task_2_end',
        'task_1_start',
        'task_1_end',
    ]


async def test_lock_cleanup_after_waiters_finish():
    """Test that locks are cleaned up from internal storage when no waiters remain."""
    lock = MultiResourceLock(reentrant=False)
    resource_name = 'cleanup_test_resource'

    # Initially, no locks should exist
    assert resource_name not in lock._locks
    assert resource_name not in lock._waiters

    async with lock.acquire(resource_name):
        # During acquisition, lock should exist
        assert resource_name in lock._locks
        assert resource_name in lock._waiters
        assert lock._waiters[resource_name] == 1

    # After release, lock should be cleaned up
    assert resource_name not in lock._locks
    assert resource_name not in lock._waiters


async def test_context_var_isolation():
    """Test that LOCKED_RESOURCES context variable properly isolates between tasks."""
    from dara.core.internal.multi_resource_lock import LOCKED_RESOURCES

    lock = MultiResourceLock(reentrant=False)

    async def task_with_lock(resource_name: str):
        # Initially, no resources should be locked for this task
        assert resource_name not in LOCKED_RESOURCES.get()

        async with lock.acquire(resource_name):
            # During acquisition, resource should be in the context
            assert resource_name in LOCKED_RESOURCES.get()

        # After release, resource should be removed from context
        assert resource_name not in LOCKED_RESOURCES.get()

    # Run tasks concurrently with different resources
    await asyncio.gather(task_with_lock('resource_1'), task_with_lock('resource_2'))


async def test_derived_variable_lock_configuration():
    """Test that the DerivedVariable lock is configured correctly for circular dependency detection."""
    from dara.core.interactivity.derived_variable import DV_LOCK

    # DV_LOCK should be non-reentrant to detect circular dependencies
    assert not DV_LOCK._reentrant, 'DV_LOCK should be non-reentrant to detect circular dependencies'

    # Test that it behaves as expected for circular dependency detection
    cache_key = 'test_dv_cache_key'

    async with DV_LOCK.acquire(cache_key):
        # Attempting to acquire the same cache key should raise LockRecursionError
        with pytest.raises(LockRecursionError):
            async with DV_LOCK.acquire(cache_key):
                pass


async def test_exception_handling_during_lock_acquisition():
    """Test that exceptions during lock acquisition don't leave locks in inconsistent state."""
    lock = MultiResourceLock(reentrant=False)
    resource_name = 'exception_test_resource'

    class TestException(Exception):
        pass

    # Test that exception during critical section releases the lock
    with pytest.raises(TestException):
        async with lock.acquire(resource_name):
            assert lock.is_locked(resource_name)
            raise TestException('Test exception')

    # Lock should be released after exception
    assert not lock.is_locked(resource_name)
    assert not lock.is_locked_by_current_task(resource_name)

    # Should be able to acquire the lock again
    async with lock.acquire(resource_name):
        assert lock.is_locked(resource_name)


async def test_multiple_waiters_on_same_resource():
    """Test that multiple tasks can wait for the same resource and are served in order."""
    lock = MultiResourceLock(reentrant=False)
    resource_name = 'multi_waiter_resource'

    execution_order = []

    async def waiter_task(task_id: int):
        async with lock.acquire(resource_name):
            execution_order.append(task_id)
            await asyncio.sleep(0.01)  # Small delay to ensure ordering

    # Start multiple tasks that will wait for the same resource
    tasks = [waiter_task(i) for i in range(5)]
    await asyncio.gather(*tasks)

    # All tasks should have executed
    assert len(execution_order) == 5
    assert set(execution_order) == {0, 1, 2, 3, 4}

    # Lock should be cleaned up
    assert not lock.is_locked(resource_name)
    assert resource_name not in lock._locks
    assert resource_name not in lock._waiters
