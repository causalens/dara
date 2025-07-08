from unittest.mock import patch

import anyio
import pytest
from anyio import create_task_group
from fastapi.encoders import jsonable_encoder

from dara.core.base_definitions import Cache
from dara.core.internal.cache_store import CacheStore
from dara.core.internal.pool import TaskPool
from dara.core.internal.tasks import CachedRegistryEntry, Task, TaskManager
from dara.core.internal.websocket import WebsocketManager

from tests.python.tasks import calc_task, track_task

pytestmark = pytest.mark.anyio


@pytest.fixture(autouse=True)
async def setup_pool():
    from dara.core.internal.registries import utils_registry

    await utils_registry.get('Store').clear()

    async with create_task_group() as tg, TaskPool(
        task_group=tg, worker_parameters={'task_module': 'tests.python.tasks'}, max_workers=2
    ) as pool:
        utils_registry.set('TaskPool', pool)
        yield


async def test_async_creating_task_with_function():
    task = Task(calc_task, [1, 2], cache_key='uid')
    result = await task.run()
    assert result == '3'
    await task.cancel()


@patch('dara.core.base_definitions.uuid.uuid4', return_value='uid')
async def test_task_manager_run_task(_uid):
    """Test that we can run a task via the TaskManager and notify the websocket manager of the result"""
    reg_entry = CachedRegistryEntry(uid='test_uid', cache=Cache.Policy.KeepAll())
    task = Task(calc_task, [1, 2], cache_key='uid', reg_entry=reg_entry)

    async with create_task_group() as tg:
        store = CacheStore()
        ws_mgr = WebsocketManager()
        task_manager = TaskManager(tg, ws_mgr, store)

        # Setup a handler on the ws channel
        return_channel = 'chan'
        handler = ws_mgr.create_handler(return_channel)

        # Kick off the task
        pending_task = await task_manager.run_task(task, return_channel)

        # Task is pending
        assert not pending_task.event.is_set()

        # No messages sent to websocket
        assert handler.receive_stream.statistics().current_buffer_used == 0

        # Stored value is the pending task
        assert await store.get(reg_entry, key='uid') == pending_task

        # Wait for the task to complete
        result = await pending_task.run()

        assert result == '3'
        assert pending_task.event.is_set()

        # Check the result is stored
        assert await task_manager.get_result('uid') == '3'

        # Check the cache entry is also updated
        assert await store.get(reg_entry, key='uid') == '3'

        # Check ws message is received
        ws_msg = await handler.receive_stream.receive()
        assert jsonable_encoder(ws_msg.message) == {'result': '3', 'status': 'COMPLETE', 'task_id': 'uid'}


@patch('dara.core.base_definitions.uuid.uuid4', return_value='uid')
async def test_task_manager_run_task_track_progress(_uid):
    """
    Test that we can run a task on a function wrapped with @track progress
    via the TaskManager and the MessageBus instance receives progress updates
    """
    task = Task(track_task, [], cache_key='uid')

    async with create_task_group() as tg:
        store = CacheStore()
        ws_mgr = WebsocketManager()
        task_manager = TaskManager(tg, ws_mgr, store)

        # Setup a handler on the ws channel
        return_channel = 'chan'
        handler = ws_mgr.create_handler(return_channel)

        pending_task = await task_manager.run_task(task, return_channel)
        assert handler.receive_stream.statistics().current_buffer_used == 0

        result = await pending_task.run()
        assert result == 'result'

        messages_count = handler.receive_stream.statistics().current_buffer_used
        messages = []
        for i in range(messages_count):
            messages.append(jsonable_encoder(handler.receive_stream.receive_nowait().message))

        # at lesat 5 steps + result
        assert len(messages) >= 6

        for i in range(1, 6):
            # Check that the call happened at some point - we're not interested in the order
            assert {
                'progress': (i / 5) * 100,
                'message': f'Track1 step {i}',
                'status': 'PROGRESS',
                'task_id': 'uid',
            } in messages

        # Check that the result is sent
        assert {'result': 'result', 'status': 'COMPLETE', 'task_id': 'uid'} in messages

        # Check fetching the result from the store
        assert await task_manager.get_result('uid') == 'result'


@patch('dara.core.base_definitions.uuid.uuid4', return_value='uid')
async def test_task_manager_cancel_task(_uid):
    """Test that we can cancel a running task via the TaskManager"""
    task = Task(calc_task, [1, 2], cache_key='uid')

    async with create_task_group() as tg:
        store = CacheStore()
        ws_mgr = WebsocketManager()
        task_manager = TaskManager(tg, ws_mgr, store)

        # Setup a handler on the ws channel
        return_channel = 'chan'
        handler = ws_mgr.create_handler(return_channel)

        pending_task = await task_manager.run_task(task, return_channel)
        assert handler.receive_stream.statistics().current_buffer_used == 0

        # Yield to let the task start
        await anyio.sleep(0.1)

        # Cancel the task
        await task_manager.cancel_task(task.task_id)

        with pytest.raises(Exception) as e:
            await pending_task.run()

        assert 'cancel' in str(e.value)

        assert jsonable_encoder((await handler.receive_stream.receive()).message) == {
            'status': 'CANCELED',
            'task_id': 'uid',
        }


@patch('dara.core.base_definitions.uuid.uuid4', return_value='uid')
async def test_task_manager_cancel_task_with_subs(_uid):
    """Test that a task with multiple subscribers does not get cancelled, but that the subscriber count gets reduced"""
    # Task will write back to the store under the cache key
    reg_entry = CachedRegistryEntry(uid='test_uid', cache=Cache.Policy.KeepAll())
    task = Task(calc_task, [1, 2], cache_key='cache_key', reg_entry=reg_entry)

    async with create_task_group() as tg:
        store = CacheStore()
        ws_mgr = WebsocketManager()
        task_manager = TaskManager(tg, ws_mgr, store)

        # Setup a handler on the ws channel
        return_channel = 'chan'
        handler = ws_mgr.create_handler(return_channel)

        # Create a PendingTask with multiple subscribers in the store
        pending_task = await task_manager.run_task(task, return_channel)
        pending_task.add_subscriber()
        assert (await store.get(reg_entry, key='cache_key')).subscribers == 2

        # Yield to let the task start
        await anyio.sleep(0.1)

        # Cancel the task
        await task_manager.cancel_task(task.task_id)

        # Check that the WS wasn't called, but that a subscriber was subtracted
        assert handler.receive_stream.statistics().current_buffer_used == 0
        assert (await store.get(reg_entry, 'cache_key')).subscribers == 1

        # Cancel the task
        await task_manager.cancel_task(task.task_id)
        with pytest.raises(Exception) as e:
            await pending_task.run()

        assert 'cancel' in str(e.value)

        # Now the task should be canceled
        assert jsonable_encoder((await handler.receive_stream.receive()).message) == {
            'status': 'CANCELED',
            'task_id': 'uid',
        }

        # Check that now the pending task should be removed
        assert await store.get(reg_entry, 'cache_key') is None
