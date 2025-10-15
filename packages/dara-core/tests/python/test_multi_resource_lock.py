import asyncio

import anyio
import pytest

from dara.core.internal.multi_resource_lock import MultiResourceLock

pytestmark = pytest.mark.anyio


async def test_basic_lock_functionality():
    """Test basic functionality of locks."""
    lock = MultiResourceLock()
    resource_name = 'test_resource'

    # Should be able to acquire and release normally
    async with lock.acquire(resource_name):
        assert lock.is_locked(resource_name)

    # Should be released after context exit
    assert not lock.is_locked(resource_name)


async def test_same_task_recursive_acquisition_fails():
    """Test that the same task trying to acquire the same resource recursively fails."""
    lock = MultiResourceLock()
    resource_name = 'recursive_resource'

    async with lock.acquire(resource_name):
        # This should raise RuntimeError from the underlying anyio.Lock
        with pytest.raises(RuntimeError) as exc_info:
            async with lock.acquire(resource_name):
                pass

        assert 'already held' in str(exc_info.value).lower()


async def test_different_resources_can_be_acquired_simultaneously():
    """Test that different resources can be locked simultaneously without interference."""
    lock = MultiResourceLock()

    async with lock.acquire('resource_1'), lock.acquire('resource_2'):
        assert lock.is_locked('resource_1')
        assert lock.is_locked('resource_2')


async def test_concurrent_access_to_same_resource():
    """Test that concurrent tasks cannot access the same resource simultaneously."""
    lock = MultiResourceLock()
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
    lock = MultiResourceLock()
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


async def test_exception_handling_during_lock_acquisition():
    """Test that exceptions during lock acquisition don't leave locks in inconsistent state."""
    lock = MultiResourceLock()
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

    # Should be able to acquire the lock again
    async with lock.acquire(resource_name):
        assert lock.is_locked(resource_name)


async def test_multiple_waiters_on_same_resource():
    """Test that multiple tasks can wait for the same resource and are served in order."""
    lock = MultiResourceLock()
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


async def test_parallel_different_resources():
    """
    Critical Test Case: Parallel tasks acquiring different resources.
    This should work fine and all tasks should be able to acquire their respective locks.
    """
    lock = MultiResourceLock()

    results = []

    async def task_with_resource(resource_name: str):
        async with lock.acquire(resource_name):
            results.append(f'acquired_{resource_name}')
            await anyio.sleep(0.01)  # Simulate some work
            results.append(f'releasing_{resource_name}')

    # Run tasks in parallel with different resources
    async with anyio.create_task_group() as tg:
        tg.start_soon(task_with_resource, 'resource_A')
        tg.start_soon(task_with_resource, 'resource_B')
        tg.start_soon(task_with_resource, 'resource_C')

    # All tasks should have completed successfully
    acquired_count = len([r for r in results if r.startswith('acquired_')])
    released_count = len([r for r in results if r.startswith('releasing_')])

    assert acquired_count == 3, f'Expected 3 acquisitions, got {acquired_count}'
    assert released_count == 3, f'Expected 3 releases, got {released_count}'

    # Check that all resources were acquired
    assert 'acquired_resource_A' in results
    assert 'acquired_resource_B' in results
    assert 'acquired_resource_C' in results


async def test_different_tasks_same_resource_sequential_access():
    """
    Critical Test Case: Different tasks accessing the same resource should work sequentially.
    This tests that different tasks properly respect the lock semantics.
    """
    lock = MultiResourceLock()
    resource_name = 'shared_resource'

    results = []

    async def task_with_resource(task_id: str):
        async with lock.acquire(resource_name):
            results.append(f'{task_id}_acquired')
            await anyio.sleep(0.01)  # Small delay to ensure ordering
            results.append(f'{task_id}_released')

    # Run two tasks sequentially that both try to acquire the same resource
    await task_with_resource('task1')
    await task_with_resource('task2')

    # Both tasks should have completed successfully in order
    assert results == ['task1_acquired', 'task1_released', 'task2_acquired', 'task2_released']
