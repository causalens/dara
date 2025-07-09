from multiprocessing import active_children
from typing import Any, Optional

import pytest
from anyio import create_task_group

from dara.core.internal.pool import TaskPool
from dara.core.internal.pool.channel import Channel
from dara.core.internal.pool.definitions import (
    PoolStatus,
    SubprocessException,
    TaskDefinition,
    TaskPayload,
    WorkerParameters,
    WorkerStatus,
    is_acknowledgement,
    is_log,
    is_problem,
    is_progress,
    is_result,
)
from dara.core.internal.pool.task_pool import shutdown
from dara.core.internal.pool.utils import read_from_shared_memory, stop_process_async
from dara.core.internal.pool.worker import WorkerProcess

from tests.python.utils import sleep_for, wait_assert, wait_for

pytestmark = [pytest.mark.anyio, pytest.mark.xdist_group(name='pool')]

WORKER_PARAMS: WorkerParameters = {'task_module': 'tests.python.tasks'}


def assert_task_acknowledged(channel: Channel, task_uid: str, worker_pid: int):
    acknowledgement = channel.pool_api.get_worker_message()
    assert acknowledgement is not None
    assert is_acknowledgement(acknowledgement)
    assert acknowledgement['worker_pid'] == worker_pid
    assert acknowledgement['task_uid'] == task_uid
    return True


def get_task_result(channel: Channel, task_uid: str):
    result_msg = channel.pool_api.get_worker_message()
    assert result_msg is not None
    assert is_result(result_msg)

    assert result_msg['task_uid'] == task_uid

    assert isinstance(result_msg['result'], tuple)
    return read_from_shared_memory(result_msg['result'])


def assert_task_result(channel: Channel, task_uid: str, expected_result: Any):
    result = get_task_result(channel, task_uid)
    assert result == expected_result
    return True


def assert_task_error(channel: Channel, task_uid: Optional[str]):
    error_msg = channel.pool_api.get_worker_message()
    assert error_msg is not None
    assert is_problem(error_msg)
    assert isinstance(error_msg['error'], SubprocessException)
    assert error_msg['task_uid'] == task_uid
    return True


def assert_workers_started(pool: TaskPool, n_workers: int):
    assert len(pool.workers) == n_workers
    for worker in pool.workers.values():
        assert worker.status == WorkerStatus.IDLE

    assert len(active_children()) == n_workers
    return True


async def cleanup_worker(worker: WorkerProcess):
    await stop_process_async(worker.process, timeout=5)
    assert not worker.process.is_alive()


@pytest.fixture(autouse=True)
def ensure_cleanup():
    yield
    # Make sure after each tests there are no processes leftover, this is a safety check not an actual test assertion
    assert len(active_children()) == 0


@pytest.fixture(scope='module', autouse=True)
def cleanup_module():
    yield
    # Cleanup leftover processes after all tests just in case
    shutdown()


async def test_worker_initializes_and_shuts_down():
    channel = Channel()
    worker = WorkerProcess(WORKER_PARAMS, channel)
    assert worker.status == WorkerStatus.CREATED

    # Worker sent a message with its pid
    await wait_assert(lambda: channel.pool_api.get_worker_message() == worker.process.pid, timeout=4)

    await cleanup_worker(worker)


async def test_worker_sends_error_on_preload_fail():
    channel = Channel()
    worker = WorkerProcess({'task_module': 'foo.bar'}, channel)
    assert worker.status == WorkerStatus.CREATED

    # exception happened before any task is accepted so task_uid is none and worker exits itself
    await wait_assert(lambda: assert_task_error(channel, None), timeout=4)
    await wait_assert(lambda: not worker.process.is_alive(), timeout=2)


async def test_worker_sends_error_on_invalid_task():
    channel = Channel()
    worker = WorkerProcess(WORKER_PARAMS, channel)
    await wait_assert(lambda: channel.pool_api.get_worker_message() == worker.process.pid, timeout=4)

    task_def = TaskDefinition(
        uid='test',
        payload=TaskPayload(function_name='foo_bar_does_not_exist', args=(), kwargs={}),
    )
    channel.pool_api.dispatch(task_def)

    # Acknowledgement received
    await wait_assert(lambda: assert_task_acknowledged(channel, task_def.uid, worker.process.pid), timeout=1)

    # Error with the task, but not thrown within task code
    await wait_assert(lambda: assert_task_error(channel, task_def.uid), timeout=2)
    await cleanup_worker(worker)


async def test_stop_worker():
    """
    Test that a specific worker shuts down when channel.stop_worker is called
    """
    channel = Channel()
    worker = WorkerProcess(WORKER_PARAMS, channel)
    worker_2 = WorkerProcess(WORKER_PARAMS, channel)

    msg_1 = await wait_for(channel.pool_api.get_worker_message, timeout=3)
    msg_2 = await wait_for(channel.pool_api.get_worker_message, timeout=3)
    assert {msg_1, msg_2} == {
        worker.process.pid,
        worker_2.process.pid,
    }

    worker.terminate()

    # Only the worker requested to be stopped is stopped
    await wait_assert(lambda: not worker.process.is_alive() and worker_2.process.is_alive(), timeout=3)

    await cleanup_worker(worker_2)


async def test_worker_sync_task_success():
    """
    Test the happy path for a sync task - the task is acknowledged and result sent back
    Also testing args
    """
    channel = Channel()
    worker = WorkerProcess(WORKER_PARAMS, channel)
    await wait_assert(lambda: channel.pool_api.get_worker_message() == worker.process.pid, timeout=2)

    task_def = TaskDefinition(
        uid='test',
        payload=TaskPayload(function_name='add', args=(1, 2), kwargs={}),
    )
    channel.pool_api.dispatch(task_def)
    await wait_assert(lambda: assert_task_acknowledged(channel, task_def.uid, worker.process.pid), timeout=3)
    await wait_assert(lambda: assert_task_result(channel, task_def.uid, 3), timeout=3)
    await cleanup_worker(worker)


async def test_worker_emits_logs():
    """
    Test that the worker emits logs via the channel
    """
    channel = Channel()
    worker = WorkerProcess(WORKER_PARAMS, channel)
    await wait_assert(lambda: channel.pool_api.get_worker_message() == worker.process.pid, timeout=2)

    task_def = TaskDefinition(
        uid='test',
        payload=TaskPayload(function_name='log_task', args=(1,), kwargs={}),
    )
    channel.pool_api.dispatch(task_def)

    # There should be 3 messages - 1 acknowledgement, log, result each; order not deterministing because of the log
    logs_found = 0
    ack_found = 0
    res_found = 0

    for _ in range(3):
        msg = await wait_for(lambda: channel.pool_api.get_worker_message(), timeout=3)
        assert msg is not None

        if is_log(msg):
            assert msg['log'] == 'TEST_LOG'
            logs_found += 1

        if is_acknowledgement(msg):
            assert msg['worker_pid'] == worker.process.pid
            assert msg['task_uid'] == task_def.uid
            ack_found += 1

        if is_result(msg):
            assert msg['task_uid'] == task_def.uid
            res_found += 1

    assert logs_found == 1
    assert ack_found == 1
    assert res_found == 1
    await cleanup_worker(worker)


async def test_worker_emits_progress():
    """
    Test that the worker emits progress messages
    """
    channel = Channel()
    worker = WorkerProcess(WORKER_PARAMS, channel)
    await wait_assert(lambda: channel.pool_api.get_worker_message() == worker.process.pid, timeout=2)

    task_def = TaskDefinition(
        uid='test',
        payload=TaskPayload(function_name='track_task', args=(), kwargs={}),
    )
    channel.pool_api.dispatch(task_def)

    await wait_assert(lambda: assert_task_acknowledged(channel, task_def.uid, worker.process.pid), timeout=3)

    # There should be 5 progress updates
    for i in range(1, 6):
        progress_update = await wait_for(channel.pool_api.get_worker_message, timeout=2)
        assert progress_update is not None
        assert is_progress(progress_update)
        assert progress_update['progress'] == (i / 5) * 100
        assert progress_update['message'] == f'Track1 step {i}'

    await wait_assert(lambda: assert_task_result(channel, task_def.uid, 'result'), timeout=3)
    await cleanup_worker(worker)


async def test_worker_async_task_success():
    """
    Test the happy path for an async task - the task is acknowledged and result sent back
    Also testing kwargs
    """
    channel = Channel()
    worker = WorkerProcess(WORKER_PARAMS, channel)
    await wait_assert(lambda: channel.pool_api.get_worker_message() == worker.process.pid, timeout=2)

    task_def = TaskDefinition(
        uid='test',
        payload=TaskPayload(function_name='async_add', args=(), kwargs={'x': 1, 'y': 2}),
    )
    channel.pool_api.dispatch(task_def)
    await wait_assert(lambda: assert_task_acknowledged(channel, task_def.uid, worker.process.pid), timeout=1)
    await wait_assert(lambda: assert_task_result(channel, task_def.uid, 3), timeout=3)
    await cleanup_worker(worker)


async def test_worker_task_exception():
    channel = Channel()
    worker = WorkerProcess(WORKER_PARAMS, channel)
    await wait_assert(lambda: channel.pool_api.get_worker_message() == worker.process.pid, timeout=2)

    task_def = TaskDefinition(
        uid='test',
        payload=TaskPayload(function_name='exception_task', args=(), kwargs={}),
    )
    channel.pool_api.dispatch(task_def)

    # Acknowledgement received
    await wait_assert(lambda: assert_task_acknowledged(channel, task_def.uid, worker.process.pid), timeout=3)

    # Error trying to run the task
    exc = get_task_result(channel, task_def.uid)
    assert str(exc.unwrap()) == 'test exception'  # exception thrown within the task

    # Worker should not quit after an exception within the worker itself
    assert len(active_children()) == 1
    assert worker.process.is_alive()

    await cleanup_worker(worker)


async def test_worker_multiple_tasks():
    """Test that a worker can execute multiple tasks without exiting"""
    channel = Channel()
    worker = WorkerProcess(WORKER_PARAMS, channel)
    await wait_assert(lambda: channel.pool_api.get_worker_message() == worker.process.pid, timeout=2)
    initial_pid = worker.process.pid

    # TASK 1
    task_def = TaskDefinition(
        uid='test_1',
        payload=TaskPayload(function_name='add', args=(1, 2), kwargs={}),
    )
    channel.pool_api.dispatch(task_def)
    await wait_assert(lambda: assert_task_acknowledged(channel, task_def.uid, worker.process.pid), timeout=3)
    await wait_assert(lambda: assert_task_result(channel, task_def.uid, 3), timeout=3)

    # TASK 2
    assert channel.pool_api.get_worker_message() is None  # no new messages, errors for now
    assert worker.process.pid == initial_pid
    assert len(active_children()) == 1

    task_def_2 = TaskDefinition(
        uid='test_2',
        payload=TaskPayload(function_name='add', args=(1, 2), kwargs={}),
    )
    channel.pool_api.dispatch(task_def_2)
    await wait_assert(lambda: assert_task_acknowledged(channel, task_def_2.uid, worker.process.pid), timeout=3)
    await wait_assert(lambda: assert_task_result(channel, task_def_2.uid, 3), timeout=3)
    assert worker.process.pid == initial_pid
    assert len(active_children()) == 1

    await cleanup_worker(worker)


async def test_pool_creates_n_workers():
    async with create_task_group() as tg:
        async with TaskPool(task_group=tg, max_workers=2, worker_parameters=WORKER_PARAMS) as pool:
            # Only one created due to dynamic spawn
            assert_workers_started(pool, 1)


async def test_pool_cannot_start_twice():
    # with block starts the pool implicitly
    async with create_task_group() as tg:
        async with TaskPool(task_group=tg, max_workers=2, worker_parameters=WORKER_PARAMS) as pool:
            with pytest.raises(RuntimeError) as e:
                await pool.start()

            assert e.match('already started')


async def test_pool_sync_task_success():
    async with create_task_group() as tg:
        async with TaskPool(task_group=tg, max_workers=2, worker_parameters=WORKER_PARAMS) as pool:
            await wait_assert(lambda: assert_workers_started(pool, 1), timeout=3)

            task = pool.submit('test', 'add', (1, 2))
            assert not task.event.is_set()
            assert len(pool.tasks) == 1

            # Task assigned to worker after a little bit
            await wait_assert(lambda: task.worker_id is not None and task.started_at is not None, timeout=3)

            result = await task
            assert result == 3

            assert len(pool.tasks) == 0

        # Pool should be cleaned up correctly
        assert len(active_children()) == 0
        assert pool.status == PoolStatus.STOPPED


async def test_pool_async_task_success():
    async with create_task_group() as tg:
        async with TaskPool(task_group=tg, max_workers=2, worker_parameters=WORKER_PARAMS) as pool:
            await wait_assert(lambda: assert_workers_started(pool, 1), timeout=3)

            task = pool.submit('test', 'async_add', (1, 2))
            assert not task.event.is_set()
            assert len(pool.tasks) == 1

            # Task assigned to worker after a little bit
            await wait_assert(lambda: task.worker_id is not None and task.started_at is not None, timeout=3)

            result = await task
            assert result == 3

            assert len(pool.tasks) == 0

    # Pool should be cleaned up correctly
    assert len(active_children()) == 0
    assert pool.status == PoolStatus.STOPPED


async def test_pool_task_large_dataset():
    async with create_task_group() as tg:
        async with TaskPool(task_group=tg, max_workers=2, worker_parameters=WORKER_PARAMS) as pool:
            await wait_assert(lambda: assert_workers_started(pool, 1), timeout=3)

            input_data = 'a' * 1098 * 1024 * 10  # 10MB
            task = pool.submit('test', 'identity_task', (input_data,))
            result = await task
            assert result == input_data


async def test_pool_queues_task_when_no_worker_available():
    async with create_task_group() as tg:
        async with TaskPool(task_group=tg, max_workers=1, worker_parameters=WORKER_PARAMS) as pool:
            assert_workers_started(pool, 1)

            # add delay so we can inspect the in-progress state
            task_1 = pool.submit('test_uid_1', 'add', (1, 2), {'delay': 2})
            task_2 = pool.submit('test_uid_2', 'add', (1, 3), {'delay': 2})
            assert len(pool.tasks) == 2
            assert not task_1.event.is_set()
            assert not task_2.event.is_set()

            # First task started, second still queued
            await wait_assert(lambda: task_1.worker_id is not None and task_2.worker_id is None, timeout=2)

            # Once task_1 finishes, task_2 should be started
            result_1 = await task_1
            assert result_1 == 3
            await sleep_for(1)
            assert len(pool.tasks) == 1
            assert task_2.worker_id is not None

            result_2 = await task_2
            assert result_2 == 4

            assert len(pool.tasks) == 0


async def test_pool_emits_progress_messages():
    async with create_task_group() as tg:
        async with TaskPool(task_group=tg, max_workers=2, worker_parameters=WORKER_PARAMS) as pool:
            await wait_assert(lambda: assert_workers_started(pool, 1), timeout=3)

            msgs = []

            async def handler(*args):
                msgs.append(args)

            with pool.on_progress('test_uid', handler):
                assert len(pool._progress_subscribers) == 1
                task = pool.submit('test_uid', 'track_task')
                result = await task
                assert result == 'result'

                assert len(msgs) == 5
                for i in range(1, 6):
                    assert msgs[i - 1] == (float(i * 20), f'Track1 step {i}')

            assert len(pool._progress_subscribers) == 0


async def test_pool_sync_task_exception():
    async with create_task_group() as tg:
        async with TaskPool(task_group=tg, max_workers=2, worker_parameters=WORKER_PARAMS) as pool:
            await wait_assert(lambda: assert_workers_started(pool, 1), timeout=3)

            task = pool.submit('test_uid', 'exception_task')
            assert not task.event.is_set()
            assert len(pool.tasks) == 1

            # Task assigned to worker after a little bit
            await wait_assert(lambda: task.worker_id is not None and task.started_at is not None, timeout=3)

            with pytest.raises(Exception) as e:
                await task

            # Make sure the original exception is raised
            assert e.match('test exception')
            assert len(pool.tasks) == 0

    # Pool should be cleaned up correctly
    assert len(active_children()) == 0
    assert pool.status == PoolStatus.STOPPED


async def test_pool_submit_not_running():
    async with create_task_group() as tg:
        pool = TaskPool(task_group=tg, max_workers=2, worker_parameters=WORKER_PARAMS)

        with pytest.raises(RuntimeError) as e:
            pool.submit('test', 'add', (1, 2))

        assert e.match('has not been started')


async def test_pool_submit_non_picklable_input():
    async with create_task_group() as tg:
        async with TaskPool(task_group=tg, max_workers=2, worker_parameters=WORKER_PARAMS) as pool:
            task = pool.submit('test_uid', 'add', (1, lambda x: x))

            with pytest.raises(Exception) as e:
                await task

            assert e.match("Can't pickle local object")


async def test_pool_submit_non_picklable_result():
    async with create_task_group() as tg:
        async with TaskPool(task_group=tg, max_workers=2, worker_parameters=WORKER_PARAMS) as pool:
            task = pool.submit('test_uid', 'unpicklable_result_task', (1,))

            with pytest.raises(Exception) as e:
                await task

            assert e.match("Can't pickle local object")


async def test_pool_join_not_running():
    async with create_task_group() as tg:
        pool = TaskPool(task_group=tg, max_workers=2, worker_parameters=WORKER_PARAMS)

        with pytest.raises(RuntimeError) as e:
            await pool.join()

        assert e.match('has not been started')


async def test_pool_join_running_stops_pool():
    async with create_task_group() as tg:
        pool = TaskPool(task_group=tg, max_workers=2, worker_parameters=WORKER_PARAMS)
        await pool.start()
        assert pool.status == PoolStatus.RUNNING

        await pool.join()

        assert pool.status == PoolStatus.STOPPED
        assert len(active_children()) == 0


async def test_pool_join_waits_for_tasks():
    async with create_task_group() as tg:
        pool = TaskPool(task_group=tg, max_workers=2, worker_parameters=WORKER_PARAMS)
        await pool.start()
        assert pool.status == PoolStatus.RUNNING

        # Start a task with delay
        task = pool.submit('test_uid', 'add', (1, 2), {'delay': 2})
        # Make sure task has started
        await sleep_for(1)
        assert task.worker_id is not None

        # Close and join pool
        pool.close()
        await pool.join(timeout=5)

        # Processes finished at this point
        assert len(pool.workers) == 0
        assert len(active_children()) == 0

        # Make sure task was still processed and completed
        assert await task == 3


async def test_pool_sets_exception_when_worker_crashes():
    """Test that a task is given an exception in case a worker crashes"""
    async with create_task_group() as tg:
        async with TaskPool(task_group=tg, max_workers=2, worker_parameters=WORKER_PARAMS) as pool:
            await wait_assert(lambda: assert_workers_started(pool, 1), timeout=3)

            worker_pids = {w.process.pid for w in pool.workers.values()}
            assert len(worker_pids) == 1

            task = pool.submit('test_uid', 'add', (1, 2), {'delay': 2})
            # Make sure task has started
            await sleep_for(1)
            assert task.worker_id is not None

            # Kill the process directly
            pool.workers[task.worker_id].process.kill()

            with pytest.raises(Exception) as e:
                await task

            assert e.match('failed due to unexpected worker failure')

            new_worker_pids = {w.process.pid for w in pool.workers.values()}

            # New worker should be created as a replacement
            assert len(new_worker_pids) == 1
            assert new_worker_pids.pop() != worker_pids.pop()


async def test_pool_cancel():
    """Test that a task is can be cancelled and the worker is replaced by a new one"""
    async with create_task_group() as tg:
        async with TaskPool(task_group=tg, max_workers=2, worker_parameters=WORKER_PARAMS) as pool:
            await wait_assert(lambda: assert_workers_started(pool, 1), timeout=3)

            worker_pids = {w.process.pid for w in pool.workers.values()}
            assert len(worker_pids) == 1

            task = pool.submit('test_uid', 'add', (1, 2), {'delay': 2})
            # Make sure task has started
            await sleep_for(1)
            assert task.worker_id is not None

            await pool.cancel('test_uid')

            with pytest.raises(BaseException):
                await task

            await sleep_for(2)
            new_worker_pids = {w.process.pid for w in pool.workers.values()}

            # New worker should be created as a replacement
            assert len(new_worker_pids) == 1
            assert new_worker_pids.pop() != worker_pids.pop()


async def test_dynamic_worker_spawn():
    """
    Test dynamic worker spawning:
    - initial number of workers == 2
    - number of workers scales up as number of jobs processed increases up to maximum
    - excess workers shut down after a timeout
    """
    async with create_task_group() as tg:
        async with TaskPool(task_group=tg, max_workers=4, worker_parameters=WORKER_PARAMS, worker_timeout=2) as pool:
            # Only 2 spawned initially even though 4 workers are max
            worker_pids = {w.process.pid for w in pool.workers.values()}
            assert pool.desired_workers == 1
            assert len(worker_pids) == 1

            # Fire off a task
            task_1 = pool.submit('test_uid', 'add', (1, 2), {'delay': 2})
            await wait_assert(lambda: task_1.worker_id is not None, timeout=2)

            # A new worker should be started, up to 2 total
            await wait_assert(lambda: len(pool.workers) == 2, timeout=1)

            # Fire off a task again
            task_2 = pool.submit('test_uid2', 'add', (2, 3), {'delay': 2})
            await wait_assert(lambda: task_2.worker_id is not None, timeout=2)

            # A new worker should be started, up to 3 total
            await wait_assert(lambda: len(pool.workers) == 3, timeout=1)

            # Excess workers should be stopped gradually
            assert await task_1 == 3
            await wait_assert(lambda: len(pool.workers) == 2, timeout=3)

            assert await task_2 == 5
            await wait_assert(lambda: len(pool.workers) == 1, timeout=3)

            # Check that after those two were killed more are able to be spawned
            task_3 = pool.submit('test_uid3', 'add', (2, 4), {'delay': 1})
            await wait_assert(lambda: task_3.worker_id is not None, timeout=2)
            assert await task_3 == 6
