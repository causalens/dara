from unittest.mock import patch

import anyio
import pytest
from anyio import create_task_group, get_cancelled_exc_class
from fastapi.encoders import jsonable_encoder

from dara.core.base_definitions import Cache
from dara.core.internal.cache_store import CacheStore
from dara.core.internal.pool import TaskPool
from dara.core.internal.tasks import CachedRegistryEntry, MetaTask, Task, TaskManager
from dara.core.internal.websocket import WebsocketManager

from tests.python.tasks import (
    calc_task,
    failing_task_a,
    task_b,
    task_c,
    track_task,
    very_slow_task_a,
)

pytestmark = pytest.mark.anyio


@pytest.fixture(autouse=True)
async def setup_pool():
    from dara.core.internal.registries import utils_registry

    await utils_registry.get('Store').clear()

    async with (
        create_task_group() as tg,
        TaskPool(task_group=tg, worker_parameters={'task_module': 'tests.python.tasks'}, max_workers=2) as pool,
    ):
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
        pending_task = task_manager.register_task(task)
        await store.set(reg_entry, key='uid', value=pending_task)
        await task_manager.run_task(task, return_channel)

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

        pending_task = task_manager.register_task(task)
        await task_manager.run_task(task, return_channel)
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

        pending_task = task_manager.register_task(task)
        await task_manager.run_task(task, return_channel)
        assert handler.receive_stream.statistics().current_buffer_used == 0

        # Yield to let the task start
        await anyio.sleep(0.1)

        # Cancel the task
        await task_manager.cancel_task(task.task_id)

        with pytest.raises(BaseException) as e:
            await pending_task.run()

        assert isinstance(e.value, get_cancelled_exc_class())

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
        pending_task = task_manager.register_task(task)
        await store.set(reg_entry, key='cache_key', value=pending_task)
        await task_manager.run_task(task, return_channel)
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
        with pytest.raises(BaseException) as e:
            await pending_task.run()

        assert isinstance(e.value, get_cancelled_exc_class())

        # Now the task should be canceled
        assert jsonable_encoder((await handler.receive_stream.receive()).message) == {
            'status': 'CANCELED',
            'task_id': 'uid',
        }

        # Check that now the pending task should be removed
        assert await store.get(reg_entry, 'cache_key') is None


@patch('dara.core.base_definitions.uuid.uuid4', side_effect=['task_a', 'task_b', 'task_c'])
async def test_task_chain_error_propagation(_uid):
    """
    Test that when we have task chains A->B and A->C where A is shared,
    if A fails, both B and C receive error notifications correctly.
    """
    async with create_task_group() as tg:
        store = CacheStore()
        ws_mgr = WebsocketManager()
        task_manager = TaskManager(tg, ws_mgr, store)

        # Setup handlers for different channels
        channel_b = 'channel_b'
        channel_c = 'channel_c'
        handler_b = ws_mgr.create_handler(channel_b)
        handler_c = ws_mgr.create_handler(channel_c)

        # Create shared task A that will fail
        task_a = Task(failing_task_a, ['test_value'], cache_key='task_a')

        # Register task A first to get the PendingTask
        pending_task_a = task_manager.register_task(task_a)

        # Create MetaTasks B and C that both depend on the same task A
        # The first one gets the original task, the second gets the PendingTask
        meta_task_b = MetaTask(task_b, [task_a], cache_key='task_b')
        meta_task_c = MetaTask(task_c, [pending_task_a], cache_key='task_c')

        # Register and run the MetaTasks
        pending_task_b = task_manager.register_task(meta_task_b)
        pending_task_c = task_manager.register_task(meta_task_c)

        # Start both task chains
        await task_manager.run_task(meta_task_b, channel_b)
        await task_manager.run_task(meta_task_c, channel_c)

        # Wait for tasks to execute and fail
        for i in range(10):  # Wait up to 1 second
            await anyio.sleep(0.1)

            # If both tasks are done and we have messages, break early
            if (
                pending_task_b.event.is_set()
                and pending_task_c.event.is_set()
                and handler_b.receive_stream.statistics().current_buffer_used > 0
                and handler_c.receive_stream.statistics().current_buffer_used > 0
            ):
                break

        # Collect all messages from both channels
        messages_b = []
        messages_c = []

        while handler_b.receive_stream.statistics().current_buffer_used > 0:
            msg = await handler_b.receive_stream.receive()
            messages_b.append(jsonable_encoder(msg.message))

        while handler_c.receive_stream.statistics().current_buffer_used > 0:
            msg = await handler_c.receive_stream.receive()
            messages_c.append(jsonable_encoder(msg.message))

        # Find error messages
        error_msg_b = next((msg for msg in messages_b if msg.get('status') == 'ERROR'), None)
        error_msg_c = next((msg for msg in messages_c if msg.get('status') == 'ERROR'), None)

        assert error_msg_b is not None, f'No error message found for B. Messages: {messages_b}'
        assert error_msg_c is not None, f'No error message found for C. Messages: {messages_c}'
        assert error_msg_b['task_id'] == 'task_b'
        assert error_msg_c['task_id'] == 'task_c'


@patch('dara.core.base_definitions.uuid.uuid4', side_effect=['task_a', 'task_b', 'task_c'])
async def test_task_chain_cancellation_propagation(_uid):
    """
    Test that when we have task chains A->B and A->C where A is shared,
    if we cancel one chain (e.g., B), the other chain (C) also gets cancelled
    because they share the same dependency A.
    """
    async with create_task_group() as tg:
        store = CacheStore()
        ws_mgr = WebsocketManager()
        task_manager = TaskManager(tg, ws_mgr, store)

        # Setup handlers for different channels
        channel_b = 'channel_b'
        channel_c = 'channel_c'
        handler_b = ws_mgr.create_handler(channel_b)
        handler_c = ws_mgr.create_handler(channel_c)

        # Create task A that takes a long time
        task_a = Task(very_slow_task_a, ['test_value'], cache_key='task_a')
        pending_task_a = task_manager.register_task(task_a)

        # Create MetaTasks B and C that depend on A
        meta_task_b = MetaTask(task_b, [task_a], cache_key='task_b')
        meta_task_c = MetaTask(task_c, [pending_task_a], cache_key='task_c')

        # Register and run the MetaTasks
        pending_task_b = task_manager.register_task(meta_task_b)
        pending_task_c = task_manager.register_task(meta_task_c)

        # Start both task chains
        await task_manager.run_task(meta_task_b, channel_b)
        await task_manager.run_task(meta_task_c, channel_c)

        # Let tasks start running
        await anyio.sleep(0.1)

        # Cancel task B (which should also cancel shared dependency A and consequently C)
        await task_manager.cancel_task('task_b')

        # Wait a bit for cancellation to propagate
        await anyio.sleep(0.2)

        # Check that both channels received cancellation notifications
        messages_b = []
        messages_c = []

        # Collect messages from both channels
        while handler_b.receive_stream.statistics().current_buffer_used > 0:
            msg = await handler_b.receive_stream.receive()
            messages_b.append(msg.message)

        while handler_c.receive_stream.statistics().current_buffer_used > 0:
            msg = await handler_c.receive_stream.receive()
            messages_c.append(msg.message)

        # Verify cancellation messages were sent - depending on the ordering of events,
        # it could end up being a cancel or an error
        cancel_msg_b = next((msg for msg in messages_b if getattr(msg, 'status', None) in {'CANCELED', 'ERROR'}), None)
        cancel_msg_c = next((msg for msg in messages_c if getattr(msg, 'status', None) in {'CANCELED', 'ERROR'}), None)

        assert pending_task_b.event.is_set()
        assert pending_task_c.event.is_set()

        assert cancel_msg_b is not None, f'No cancellation message found for B. Messages: {messages_b}'
        assert cancel_msg_c is not None, f'No cancellation message found for C. Messages: {messages_c}'
        assert cancel_msg_b.task_id == 'task_b'
        assert cancel_msg_c.task_id == 'task_c'
