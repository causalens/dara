"""
Copyright 2023 Impulse Innovations Limited


Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
"""

import atexit
from collections.abc import Coroutine
from contextlib import contextmanager
from datetime import datetime
from multiprocessing import active_children
from typing import Any, Callable, Dict, Optional, Union, cast

import anyio
from anyio.abc import TaskGroup

from dara.core.internal.pool.channel import Channel
from dara.core.internal.pool.definitions import (
    WORKER_NAME,
    PoolStatus,
    TaskDefinition,
    TaskPayload,
    WorkerParameters,
    WorkerStatus,
    is_acknowledgement,
    is_initialization,
    is_log,
    is_problem,
    is_progress,
    is_result,
)
from dara.core.internal.pool.utils import (
    SubprocessException,
    read_from_shared_memory,
    stop_process,
    stop_process_async,
    wait_while,
)
from dara.core.internal.pool.worker import WorkerProcess
from dara.core.logging import dev_logger


class TaskPool:
    """Custom Pool implementation exposing asynchronous APIs for submitting jobs to worker processes"""

    task_group: TaskGroup
    status: PoolStatus
    max_workers: int
    worker_timeout: float
    """Number of seconds worker is allowed to be idle before it is killed, if there are too many workers alive"""

    worker_parameters: WorkerParameters
    workers: Dict[int, WorkerProcess] = {}
    tasks: Dict[str, TaskDefinition] = {}

    def __init__(
        self, task_group: TaskGroup, worker_parameters: WorkerParameters, max_workers: int, worker_timeout: float = 5
    ):
        self.task_group = task_group
        self.status = PoolStatus.CREATED
        self.loop_stopped = anyio.Event()
        self.max_workers = max_workers
        self.worker_parameters = worker_parameters
        self.worker_timeout = worker_timeout

        self._channel = Channel()
        self._progress_subscribers: Dict[str, Callable[[float, str], Coroutine]] = {}

    @property
    def running_tasks(self):
        """
        Get tasks which are currently running.
        """
        # Task is running if it has a worker assigned to it
        return [t for t in self.tasks.values() if t.worker_id is not None]

    @property
    def desired_workers(self):
        """
        Get the desired number of workers based on the current workload
        """
        return min(len(self.running_tasks) + 1, self.max_workers)

    async def start(self, timeout: float = 5):
        """
        Starts the pool and its workers
        """
        if self.status == PoolStatus.CREATED:
            self.task_group.start_soon(self._core_loop)

            # Wait for pool to start and all workers to be ready to receive tasks
            try:
                await wait_while(
                    lambda: self.status != PoolStatus.RUNNING
                    or len(self.workers) != self.desired_workers
                    or not all(w.status == WorkerStatus.IDLE for w in self.workers.values()),
                    timeout=timeout,
                )
            except TimeoutError as e:
                raise RuntimeError('Failed to start pool') from e
        else:
            raise RuntimeError('Pool already started')

    def submit(
        self, task_uid: str, function_name: str, args: Union[tuple, None] = None, kwargs: Union[dict, None] = None
    ) -> TaskDefinition:
        """
        Submit a new task to the pool

        :param task_uid: unique identifier of the task
        :param function_name: name of the function within configured task module to run
        :param args: list of arguments to pass to the function
        :param kwargs: dict of kwargs to pass to the function
        """
        if args is None:
            args = ()
        if kwargs is None:
            kwargs = {}
        self._check_pool_state()

        # Create a task definition to keep track of its progress
        new_task = TaskDefinition(
            uid=task_uid,
            payload=TaskPayload(function_name=function_name, args=args, kwargs=kwargs),
        )
        self.tasks[task_uid] = new_task

        # Dispatch to workers
        try:
            self._channel.pool_api.dispatch(new_task)
        except BaseException as e:
            # Dispatching could fail due to e.g. pickling issues - resolve the future with the exception raised
            self._update_task(new_task, e)
            self.tasks.pop(task_uid)

        return new_task

    async def cancel(self, task_uid: str):
        """
        Cancel a task

        :param task_uid: uid of the task to cancel
        """
        # Already cancelled
        if task_uid not in self.tasks:
            return

        task = self.tasks.pop(task_uid)
        if not task.event.is_set():
            task.result = anyio.get_cancelled_exc_class()()
            task.event.set()

        # Task in progress, stop the worker
        if task.worker_id is not None:
            worker = self.workers.pop(task.worker_id)
            await stop_process_async(worker.process)

    @contextmanager
    def on_progress(self, task_uid: str, handler: Callable[[float, str], Coroutine]):
        """
        Subscribe to progress updates for a given task

        :param task_uid: uid of the task to subscribe to updates for
        :param handler: handler to call whenever there is a progress update
        """
        self._progress_subscribers[task_uid] = handler
        yield
        self._progress_subscribers.pop(task_uid)

    def close(self):
        """
        Prevents any more tasks from being submitted to the pool.

        Does not terminate the workers.
        """
        self.status = PoolStatus.CLOSED

    async def stop(self):
        """
        Immediately stops the pool from handling the workers and terminates the workers.

        Waits for the workers to finish.
        """
        self.status = PoolStatus.STOPPED
        await self.loop_stopped.wait()
        await self._terminate_workers()

    async def join(self, timeout: Optional[float] = None):
        """
        Join the pool and wait for workers to complete

        If pool is not closed, closes the pool first.
        If pool is not stopped, stops the pool first.

        :param timeout: optional time to wait for existing tasks to complete
        """
        if self.status == PoolStatus.CREATED:
            raise RuntimeError('TaskPool has not been started, cannot join')

        # Pool still running, stop from accepting new jobs first
        if self.status == PoolStatus.RUNNING:
            self.close()

        # Pool closed, wait for it to stop first
        if self.status == PoolStatus.CLOSED:
            # Wait for existing tasks to finish
            await self._wait_queue_depletion(timeout)

            # Wait for workers and loop to stop
            await self.stop()

        # Otherwise pool is stopped/errored; join workers
        await self._join_workers()

    async def _join_workers(self):
        """
        Wait until all workers are dead
        """
        workers = list(self.workers.values())
        for worker in workers:
            if worker.process.pid is None:
                continue
            await wait_while(worker.process.is_alive)

    async def _terminate_workers(self):
        """
        Terminate worker processes and wait for them to finish
        """
        workers = list(self.workers.values())
        for worker in workers:
            if worker.process.pid is None:
                continue

            try:
                self.workers.pop(worker.process.pid)
                await stop_process_async(worker.process)
            except BaseException as e:
                # Failed to stop, probably already killed
                dev_logger.warning(
                    'Failed to stop worker while cleaning up', {'worker_pid': worker.process.pid, 'error': e}
                )

    async def __aenter__(self):
        """
        Enable TaskPool to be used with an `async with` block

        Implicitly starts the pool and waits for it to be running
        """
        await self.start()
        return self

    async def __aexit__(self, exc_t, exc_v, exc_tb):
        """
        Enable TaskPool to be used with an `async with` block

        Implicitly stops the pool and waits for it to be completed
        """
        await self.stop()

    def _update_task(self, task: TaskDefinition, result: Any):
        """
        Update a given task status with the given result

        :param task: task to update
        :param result: result to update the task with
        """
        if isinstance(result, SubprocessException):
            task.result = result.unwrap()
            task.event.set()
        else:
            task.result = result
            task.event.set()

    def _create_workers(self):
        """
        Creates workers up to the desired worker number
        """
        desired_worker_num = self.desired_workers

        for _ in range(desired_worker_num - len(self.workers)):
            new_worker = WorkerProcess(self.worker_parameters, self._channel)
            assert new_worker.process.pid is not None, 'Worker failed to create process'
            self.workers[new_worker.process.pid] = new_worker

    def _cleanup_worker(self, worker: WorkerProcess):
        """
        Cleanup a worker.

        Looks for associated tasks and updates them if necessary.

        :param worker: worker to cleanup
        """

        running_tasks = self.running_tasks
        associated_tasks = [t for t in running_tasks if t.worker_id == worker.process.pid]

        # Mark task as completed with the error
        for task in associated_tasks:
            if not task.event.is_set():
                self._update_task(task, Exception('Task failed due to unexpected worker failure'))
                self.tasks.pop(task.uid)

        if worker.process.pid:
            self.workers.pop(worker.process.pid, 0)

    def _stop_worker(self, pid: int, force=False):
        """
        Stop a worker with the specified pid

        Terminates the worker gracefully and cleans it up

        :param pid: pid of the worker to stop
        :param force: whether to force stop the worker, ignoring its status
        """
        worker = self.workers[pid]

        if not force and worker.status == WorkerStatus.WORKING:
            raise RuntimeError(f'Attempting to stop a running worker {pid}')

        # Terminate the process gracefully
        worker.terminate()
        self._cleanup_worker(worker)

    def _handle_dead_workers(self):
        """
        Check if any of the workers are dead

        Cleans up the dead ones
        """
        dead_workers = [w for w in self.workers.values() if not w.process.is_alive()]

        for worker in dead_workers:
            self._cleanup_worker(worker)

    def _handle_orphaned_workers(self):
        """
        Check if any of the workers are orphaned, i.e. the task they are working on is no longer running.
        This can happen if the task is cancelled before a worker had the time to acknowledge it.
        """
        orphaned_workers = [
            w
            for w in self.workers.values()
            if w.status == WorkerStatus.WORKING and w.task_uid is not None and self.tasks.get(w.task_uid) is None
        ]

        for worker in orphaned_workers:
            if worker.process.pid:
                worker.terminate()
                self.task_group.start_soon(stop_process_async, worker.process)
                self.workers.pop(worker.process.pid)

    def _handle_excess_workers(self):
        """
        Clean up excess workers.

        Stops idle workers which have been last updated over `self.worker_timeout` seconds ago as long
        as there are more alive workers than desired.
        """
        num_workers = len(self.workers)
        desired_worker_num = self.desired_workers

        # Clean up workers if we have too many
        time_now = datetime.now()
        pids = list(self.workers.keys())
        for pid in pids:
            # If we reach the number of desired workers, stop killing timed out workers
            if num_workers <= desired_worker_num:
                break

            worker = self.workers[pid]

            # If worker is idle, check the time and clean up if timeout passed
            if worker.status == WorkerStatus.IDLE:
                time_passed = time_now - worker.updated_at

                if time_passed.total_seconds() > self.worker_timeout:
                    self._stop_worker(pid)
                    num_workers -= 1

    def _check_pool_state(self):
        """
        Pool state check ran whenever a job is submitted
        """
        if self.status == PoolStatus.CREATED:
            raise RuntimeError('TaskPool has not been started')

        if self.loop_stopped.is_set():
            self.status = PoolStatus.ERROR

        if self.status == PoolStatus.ERROR:
            raise RuntimeError('Unexpected error within TaskPool')

        if self.status != PoolStatus.RUNNING:
            raise RuntimeError('The Pool is not active')

    async def _process_next_worker_message(self):
        """
        Processes the next message from a worker if there is one available
        """
        worker_msg = self._channel.pool_api.get_worker_message()

        # No message available at this time, don't block and just return
        if worker_msg is None:
            return

        if is_initialization(worker_msg):
            self.workers[worker_msg].update_status(WorkerStatus.IDLE, task_uid=None)
        elif is_acknowledgement(worker_msg):
            task = self.tasks.get(worker_msg['task_uid'])

            if task:
                task.worker_id = worker_msg['worker_pid']
                task.started_at = datetime.now()

                self.workers[worker_msg['worker_pid']].update_status(
                    WorkerStatus.WORKING, task_uid=worker_msg['task_uid']
                )
        elif is_result(worker_msg):
            task_uid = worker_msg['task_uid']

            if task_uid not in self.tasks:
                return

            task = self.tasks.pop(task_uid)

            if task.event.is_set():
                return

            result = worker_msg['result']

            try:
                result = read_from_shared_memory(result)
            except BaseException as e:
                self._update_task(task, e)
            else:
                self._update_task(task, result)
                assert task.worker_id is not None
                self.workers[task.worker_id].update_status(WorkerStatus.IDLE, task_uid=None)
        elif is_problem(worker_msg):
            # If the problem is to do with the task
            if worker_msg['task_uid']:
                task_uid = worker_msg['task_uid']

                if task_uid not in self.tasks:
                    return

                task = self.tasks.pop(worker_msg['task_uid'])

                if task.event.is_set():
                    return

                self._update_task(task, worker_msg['error'])
            else:
                # Otherwise something went wrong with the worker itself
                # just log the error, the worker will be cleaned up in the next loop iteration
                # Logger does not accept BaseException so we have to cast it
                dev_logger.error(
                    'Something went wrong with a worker process', cast(Exception, worker_msg['error'].unwrap())
                )
        elif is_log(worker_msg):
            dev_logger.info(f'Task: {worker_msg["task_uid"]}', {'logs': worker_msg['log']})
        elif is_progress(worker_msg) and worker_msg['task_uid'] in self._progress_subscribers:
            await self._progress_subscribers[worker_msg['task_uid']](worker_msg['progress'], worker_msg['message'])

    async def _wait_queue_depletion(self, timeout: Optional[float] = None):
        """
        Wait until all tasks have been marked as completed

        :param timeout: optional time to wait until queue is depleted
        """
        try:
            await wait_while(
                condition=lambda: self.status in (PoolStatus.CLOSED, PoolStatus.RUNNING) and len(self.tasks) > 0,
                timeout=timeout,
            )
        except TimeoutError as e:
            raise TimeoutError('Tasks are still being executed') from e

    async def _core_loop(self):
        """
        Main loop of the pool

        Manages workers and tasks
        """
        self.status = PoolStatus.RUNNING

        try:
            while self.status not in (PoolStatus.ERROR, PoolStatus.STOPPED):
                await anyio.sleep(0.1)

                try:
                    self._handle_excess_workers()
                    self._handle_orphaned_workers()
                    self._handle_dead_workers()
                    self._create_workers()
                    await self._process_next_worker_message()
                except Exception as e:
                    dev_logger.error('Error in task pool', e)
        finally:
            self.loop_stopped.set()


def shutdown():
    """Shut down leftover child processes"""
    for subprocess in active_children():
        if subprocess.name == WORKER_NAME:
            stop_process(subprocess)


atexit.register(shutdown)
