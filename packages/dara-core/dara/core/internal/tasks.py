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

import contextlib
import inspect
import math
from collections.abc import Awaitable
from typing import Any, Callable, Dict, List, Optional, Set, Union, overload

from anyio import (
    BrokenResourceError,
    CancelScope,
    ClosedResourceError,
    create_memory_object_stream,
    create_task_group,
    get_cancelled_exc_class,
    move_on_after,
)
from anyio.abc import TaskGroup
from anyio.streams.memory import MemoryObjectSendStream
from exceptiongroup import ExceptionGroup, catch
from pydantic import ConfigDict

from dara.core.base_definitions import (
    BaseTask,
    CachedRegistryEntry,
    LruCachePolicy,
    PendingTask,
    TaskError,
    TaskMessage,
    TaskProgressUpdate,
    TaskResult,
)
from dara.core.internal.cache_store import CacheStore
from dara.core.internal.devtools import get_error_for_channel
from dara.core.internal.pandas_utils import remove_index
from dara.core.internal.pool import TaskPool
from dara.core.internal.utils import exception_group_contains, run_user_handler
from dara.core.internal.websocket import WebsocketManager
from dara.core.logging import dev_logger, eng_logger
from dara.core.metrics import RUNTIME_METRICS_TRACKER


class Task(BaseTask):
    """
    The task class represents a task to be executed in a subprocess,
    and provides an API for executing the task in an async or synchronous fashion.

    Methods for reading from the subprocess and writing to it are also provided.
    """

    model_config = ConfigDict(use_enum_values=True)

    def __init__(
        self,
        func: Callable,
        args: Union[List[Any], None] = None,
        kwargs: Union[Dict[str, Any], None] = None,
        reg_entry: Optional[CachedRegistryEntry] = None,
        notify_channels: Optional[List[str]] = None,
        cache_key: Optional[str] = None,
        task_id: Optional[str] = None,
        on_progress: Optional[Callable[[TaskProgressUpdate], Union[None, Awaitable[None]]]] = None,
    ):
        """
        :param func: The function to execute within the process
        :param reg_entry: The associated registry entry for this task
        :param args: The arguments to pass to that function
        :param kwargs: The keyword arguments to pass to that function
        :param notify_channels: If this task is run in a TaskManager instance these channels will also be notified on
                                completion
        :param cache_key: Optional cache key if there is a PendingTask in the store associated with this task
        :param task_id: Optional task_id to set for the task - otherwise the task generates its id automatically
        """
        self._func_name = self._verify_function(func)
        self._args = args if args is not None else []
        self._kwargs = kwargs if kwargs is not None else {}
        self.notify_channels = notify_channels if notify_channels is not None else []
        self.cache_key = cache_key
        self.reg_entry = reg_entry
        self.on_progress = on_progress

        super().__init__(task_id)

    def _verify_function(self, func: Callable) -> str:
        """
        Helper to verify that the passed function is correctly located in a tasks.py file and that we can import it via
        a string import. Will raise an error if there is an issue with the function passed. The return is a tuple of the
        module name and the function name.

        :param func: the function for the task to execute
        """
        if not callable(func):
            raise ValueError(f'Attempted to create a task with a function that is not a function: {func}')

        mod = inspect.getmodule(func)
        if mod is None:
            raise ValueError(
                "Attempted to create a task with a function that cannot be imported directly, lambda's are not allowed"
            )

        name = mod.__name__
        if not name.endswith('.tasks'):
            raise ValueError(
                'The task passed is not defined in a tasks.py file. We enforce this rule to keep tasks separate from '
                'other code and discourage any bad practices that could lead to issues in the future'
            )

        return func.__name__

    async def run(self, send_stream: Optional[MemoryObjectSendStream[TaskMessage]] = None) -> Any:
        """
        Run the task asynchronously, and await its' end.

        :param send_stream: The stream to send messages to the task manager on
        """
        # Get a histogram for given task to track its runtime
        # If task_id has underscores, strip the last part of it as it's in the format of {var_name}_TaskType_{uid}
        clean_task_name = '_'.join(self.task_id.split('_')[:-1]) if '_' in self.task_id else self.task_id
        histogram = RUNTIME_METRICS_TRACKER.get_task_histogram(clean_task_name)

        from dara.core.internal.registries import utils_registry

        pool: TaskPool = utils_registry.get('TaskPool')

        with histogram.time():

            async def on_progress(progress: float, msg: str):
                if send_stream is not None:
                    with contextlib.suppress(ClosedResourceError):
                        await send_stream.send(TaskProgressUpdate(task_id=self.task_id, progress=progress, message=msg))

            async def on_result(result: Any):
                if send_stream is not None:
                    with contextlib.suppress(ClosedResourceError):
                        await send_stream.send(
                            TaskResult(
                                task_id=self.task_id,
                                result=result,
                                cache_key=self.cache_key,
                                reg_entry=self.reg_entry,
                            )
                        )

            async def on_error(exc: BaseException):
                if send_stream is not None:
                    with contextlib.suppress(ClosedResourceError):
                        await send_stream.send(
                            TaskError(
                                task_id=self.task_id, error=exc, cache_key=self.cache_key, reg_entry=self.reg_entry
                            )
                        )

            with pool.on_progress(self.task_id, on_progress):
                pool_task_def = pool.submit(self.task_id, self._func_name, args=tuple(self._args), kwargs=self._kwargs)

                try:
                    result = await pool_task_def
                except BaseException as e:
                    # Task returned an exception
                    await on_error(e)
                    raise

                # Send result up
                await on_result(result)

                return result

    async def cancel(self):
        """
        Cancel the task.
        """
        from dara.core.internal.registries import utils_registry

        pool: TaskPool = utils_registry.get('TaskPool')
        await pool.cancel(self.task_id)


class MetaTask(BaseTask):
    """
    A MetaTask represents a task that is dependant on the results of a number of other tasks. It exposes an async
    wrapper around the other tasks, waits for them to complete and then applies the process_result function to the
    results.
    """

    def __init__(
        self,
        process_result: Callable[..., Any],
        args: Optional[List[Any]] = None,
        kwargs: Optional[Dict[str, Any]] = None,
        reg_entry: Optional[CachedRegistryEntry] = None,
        notify_channels: Optional[List[str]] = None,
        process_as_task: bool = False,
        cache_key: Optional[str] = None,
        task_id: Optional[str] = None,
    ):
        """
        :param process result: A function to process the result of the other tasks
        :param reg_entry: The associated registry entry for this task
        :param args: The arguments to pass to that function
        :param kwargs: The keyword arguments to pass to that function
        :param notify_channels: If this task is run in a TaskManager instance these channels will also be notified on
                                completion
        :param process_as_task: Whether to run the process_result function as a task or not, defaults to False
        :param cache_key: Optional cache key if there is a registry entry to store results for the task in
        :param task_id: Optional task_id to set for the task - otherwise the task generates its id automatically
        """
        self.args = args if args is not None else []
        self.process_result = process_result
        self.kwargs = kwargs if kwargs is not None else {}
        self.notify_channels = notify_channels if notify_channels is not None else []
        self.process_as_task = process_as_task
        self.cancel_scope: Optional[CancelScope] = None
        self.cache_key = cache_key
        self.reg_entry = reg_entry

        super().__init__(task_id)

    async def run(self, send_stream: Optional[MemoryObjectSendStream[TaskMessage]] = None):
        """
        Run any tasks found in the arguments to completion, collect the results and then call the process result
        function as a further task with a resultant arguments

        :param send_stream: The stream to send messages to the task manager on
        """
        self.cancel_scope = CancelScope()

        try:
            with self.cancel_scope:
                tasks: List[BaseTask] = []

                # Collect up the tasks that need to be run and kick them off without awaiting them.
                tasks.extend(x for x in self.args if isinstance(x, BaseTask))
                tasks.extend(x for x in self.kwargs.values() if isinstance(x, BaseTask))

                eng_logger.info(f'MetaTask {self.task_id} running sub-tasks', {'task_ids': [x.task_id for x in tasks]})

                # Wait for all tasks to complete
                results: Dict[str, Any] = {}

                async def _run_and_capture_result(task: BaseTask):
                    """
                    Run a task and capture the result
                    """
                    nonlocal results
                    result = await task.run(send_stream)
                    results[task.task_id] = result

                def handle_exception(err: ExceptionGroup):
                    with contextlib.suppress(ClosedResourceError, BrokenResourceError):
                        if send_stream is not None:
                            send_stream.send_nowait(
                                TaskError(
                                    task_id=self.task_id, error=err, cache_key=self.cache_key, reg_entry=self.reg_entry
                                )
                            )
                    raise err

                if len(tasks) > 0:
                    with catch(
                        {
                            BaseException: handle_exception,  # type: ignore
                            get_cancelled_exc_class(): handle_exception,
                        }
                    ):
                        async with create_task_group() as tg:
                            for task in tasks:
                                tg.start_soon(_run_and_capture_result, task)

                        # In testing somehow sometimes cancellations aren't bubbled up, this ensures that's the case
                        if tg.cancel_scope.cancel_called:
                            raise get_cancelled_exc_class()('MetaTask caught cancellation')

                eng_logger.debug(f'MetaTask {self.task_id}', 'completed sub-tasks', results)

                # Order the results in the same order as the tasks list
                result_values = [results[task.task_id] for task in tasks]

                args = []
                kwargs = {}

                # Rebuild the args and kwargs with the results of the underlying tasks
                # Here the task results could be DataFrames so make sure we clean the internal __index__ col from them
                # before passing into the task function
                for arg in self.args:
                    if isinstance(arg, BaseTask):
                        args.append(remove_index(result_values.pop(0)))
                    else:
                        args.append(arg)

                for k, val in self.kwargs.items():
                    if isinstance(val, BaseTask):
                        kwargs[k] = remove_index(result_values.pop(0))
                    else:
                        kwargs[k] = val

                eng_logger.debug(f'MetaTask {self.task_id}', 'processing result', {'args': args, 'kwargs': kwargs})

                # Run the process result function with the completed set of args and kwargs
                if self.process_as_task:
                    eng_logger.debug(f'MetaTask {self.task_id}', 'processing result as Task')

                    task = Task(
                        self.process_result,
                        args,
                        kwargs,
                        # Pass through cache_key so the processing task correctly updates the cache store entry
                        reg_entry=self.reg_entry,
                        cache_key=self.cache_key,
                        task_id=self.task_id,
                    )
                    res = await task.run(send_stream)

                    eng_logger.info(f'MetaTask {self.task_id} returning result', {'result': res})

                    return res

                try:
                    res = await run_user_handler(self.process_result, args, kwargs)

                    # Send MetaTask result - it could be that there is a nested structure
                    # of MetaTasks so we need to make sure intermediate results are also sent
                    if send_stream is not None:
                        await send_stream.send(
                            TaskResult(
                                task_id=self.task_id, result=res, cache_key=self.cache_key, reg_entry=self.reg_entry
                            )
                        )
                except BaseException as e:
                    # Recover from error - update the pending value to prevent subsequent requests getting stuck
                    if send_stream is not None:
                        await send_stream.send(
                            TaskError(task_id=self.task_id, error=e, cache_key=self.cache_key, reg_entry=self.reg_entry)
                        )
                    raise

                eng_logger.info(f'MetaTask {self.task_id} returning result', {'result': res})

                return res
        finally:
            self.cancel_scope = None

    async def cancel(self):
        """
        Cancel the tasks underneath
        """
        if self.cancel_scope is not None:
            self.cancel_scope.cancel()


class TaskManagerError(ValueError):
    pass


class TaskManager:
    """
    TaskManager is responsible for running tasks and managing their pending state. It is also responsible for
    communicating the state of tasks to the client via the WebsocketManager.

    Every task created gets registered with the TaskManager and is tracked by the TaskManager
    as a PendingTask.

    This allows the task to be retrieved by the cache_key from the store.

    When a task is completed, it is removed from the tasks dict and the store entry is updated with the result.

    When a task is cancelled, it is removed from the tasks dict and the store entry is updated with None.
    """

    def __init__(self, task_group: TaskGroup, ws_manager: WebsocketManager, store: CacheStore):
        self.tasks: Dict[str, PendingTask] = {}
        self.task_group = task_group
        self.ws_manager = ws_manager
        self.store = store

    def register_task(self, task: BaseTask) -> PendingTask:
        """
        Register a task. This will ensure the task it tracked and notifications are routed correctly.
        """
        pending_task = PendingTask(task.task_id, task)
        self.tasks[task.task_id] = pending_task
        return pending_task

    @overload
    async def run_task(self, task: PendingTask, ws_channel: Optional[str] = None) -> Any: ...

    @overload
    async def run_task(self, task: BaseTask, ws_channel: Optional[str] = None) -> PendingTask: ...

    async def run_task(self, task: BaseTask, ws_channel: Optional[str] = None):
        """
        Run a task and store it in the tasks dict

        :param task: Task to run
        :param ws_channel: Websocket channel to send task updates to
        """
        # If the task given is a PendingTask,
        # append the websocket channel to the task
        if isinstance(task, PendingTask):
            if task.task_id in self.tasks:
                # Increment subscriber count for this component request
                self.tasks[task.task_id].add_subscriber()
                if ws_channel is not None:
                    self.tasks[task.task_id].notify_channels.append(ws_channel)
                return self.tasks[task.task_id]

            assert task.task_def.reg_entry is not None, 'PendingTask must have a registry entry'

            # Otherwise if the task is not in the tasks dict, it already finished
            # and we can return the result
            return (
                await self.store.get(task.task_def.reg_entry, task.task_def.cache_key)
                if task.task_def.cache_key is not None
                else self.get_result(task.task_id)
            )

        # Otherwise, we should already have a pending task for this task
        pending_task = self.tasks[task.task_id]
        if ws_channel is not None:
            pending_task.notify_channels.append(ws_channel)

        # Run the task in the background
        self.task_group.start_soon(self._run_task_and_notify, task)

        return pending_task

    async def _cancel_tasks(self, task_ids: List[str], notify: bool = True):
        """
        Cancel a list of tasks

        :param task_ids: The list of task IDs to cancel
        :param notify: Whether to send cancellation notifications
        """
        with CancelScope(shield=True):
            # Cancel all tasks in the hierarchy
            for task_id_to_cancel in task_ids:
                if task_id_to_cancel in self.tasks:
                    pending_task = self.tasks[task_id_to_cancel]

                    # Notify channels that this specific task was cancelled
                    if notify:
                        await self._send_notification_for_pending_task(
                            pending_task=pending_task,
                            messages=[{'status': 'CANCELED', 'task_id': task_id_to_cancel}],
                        )

                    if not pending_task.event.is_set():
                        # Cancel the actual task
                        await pending_task.cancel()

                        # Remove from cache if it has cache settings
                        if pending_task.task_def.cache_key is not None and pending_task.task_def.reg_entry is not None:
                            await self.store.delete(
                                pending_task.task_def.reg_entry, key=pending_task.task_def.cache_key
                            )

                    # Remove from running tasks
                    self.tasks.pop(task_id_to_cancel, None)

                    dev_logger.info('Task cancelled', {'task_id': task_id_to_cancel})

    async def _cancel_task_hierarchy(self, task: BaseTask, notify: bool = True):
        """
        Recursively cancel all tasks in a task hierarchy

        :param task: The root task to cancel (and its children)
        :param notify: Whether to send cancellation notifications
        """
        all_task_ids = self._collect_all_task_ids_in_hierarchy(task)
        await self._cancel_tasks(list(all_task_ids), notify)

    async def cancel_task(self, task_id: str, notify: bool = True):
        """
        Cancel a running task by its id. If the task has child tasks (MetaTask),
        all child tasks will also be cancelled.

        :param task_id: the id of the task
        :param notify: whether to notify, true by default
        """
        eng_logger.debug(f'Attempting to cancel task {task_id}')
        task = self.tasks.get(task_id, None)

        if task is not None:
            # Check the subscriber count. If more than 1 subscriber
            # then cancel one of the subscriptions, but do not cancel the underlying task.
            if task.subscribers > 1:
                task.remove_subscriber()
                return

            # Cancel the entire task hierarchy (including child tasks)
            await self._cancel_task_hierarchy(task.task_def, notify)

        else:
            raise TaskManagerError('Could not find a task with the passed id to cancel.')

    async def cancel_all_tasks(self):
        """
        Cancel all the currently running tasks, useful for cleaning up on app shutdown
        """
        keys = list(self.tasks.keys())
        for task_id in keys:
            try:
                await self.cancel_task(task_id, notify=False)
            except Exception as e:
                eng_logger.error(f'Failed to close down task with id: {task_id}', e)

    async def get_result(self, task_id: str):
        """
        Fetch the result of a task by its id

        :param task_id: the id of the task to fetch
        """
        # the result is not deleted, the results are kept in an LRU cache
        # which will clean up older entries
        return await self.store.get(TaskResultEntry, key=task_id)

    async def set_result(self, task_id: str, value: Any):
        """
        Set the result of a task by its id
        """
        return await self.store.set(TaskResultEntry, key=task_id, value=value)

    def _collect_all_task_ids_in_hierarchy(self, task: BaseTask) -> Set[str]:
        """
        Recursively collect all task IDs in the task hierarchy

        :param task: The root task to start collecting from
        :return: Set of all task IDs in the hierarchy
        """
        task_ids = {task.task_id}

        if isinstance(task, MetaTask):
            # Collect from args
            for arg in task.args:
                if isinstance(arg, BaseTask):
                    task_ids.update(self._collect_all_task_ids_in_hierarchy(arg))

            # Collect from kwargs
            for value in task.kwargs.values():
                if isinstance(value, BaseTask):
                    task_ids.update(self._collect_all_task_ids_in_hierarchy(value))

        return task_ids

    async def _multicast_notification(self, task_id: str, messages: List[dict]):
        """
        Send notifications to all task IDs that are related to a given task

        :param task: the task the notifications are related to
        :param messages: List of message dictionaries to send to all related tasks
        """
        # prevent cancellation, we need the notifications to be sent
        with CancelScope(shield=True):
            # Find all PendingTasks that have the message_task_id in their hierarchy
            tasks_to_notify = set()

            for pending_task in self.tasks.values():
                # Check if the message_task_id is in this PendingTask's hierarchy
                task_ids_in_hierarchy = self._collect_all_task_ids_in_hierarchy(pending_task.task_def)
                if task_id in task_ids_in_hierarchy:
                    tasks_to_notify.add(pending_task.task_id)

            # Send notifications for all affected PendingTasks in parallel
            if tasks_to_notify:
                async with create_task_group() as task_tg:
                    for pending_task_id in tasks_to_notify:
                        if pending_task_id not in self.tasks:
                            continue
                        pending_task = self.tasks[pending_task_id]
                        task_tg.start_soon(self._send_notification_for_pending_task, pending_task, messages)

    async def _send_notification_for_pending_task(self, pending_task: PendingTask, messages: List[dict]):
        """
        Send notifications for a specific PendingTask

        :param pending_task: The PendingTask to send notifications for
        :param messages: The messages to send
        """
        # Collect channels for this PendingTask
        channels_to_notify = set(pending_task.notify_channels)
        channels_to_notify.update(pending_task.task_def.notify_channels)

        if not channels_to_notify:
            return

        # Send to all channels for this PendingTask in parallel
        async def _send_to_channel(channel: str):
            async with create_task_group() as channel_tg:
                for message in messages:
                    # Create message with this PendingTask's task_id (if message has task_id)
                    message_for_task = {**message, 'task_id': pending_task.task_id} if 'task_id' in message else message
                    channel_tg.start_soon(self.ws_manager.send_message, channel, message_for_task)

        async with create_task_group() as channel_tg:
            for channel in channels_to_notify:
                channel_tg.start_soon(_send_to_channel, channel)

    async def _run_task_and_notify(self, task: BaseTask):
        """
        Run the task to completion and notify the client of progress and completion

        :param task: the task to run
        :param ws_channel: the channel to send messages to
        """
        cancel_scope = CancelScope()

        pending_task = self.tasks[task.task_id]

        pending_task.cancel_scope = cancel_scope

        with cancel_scope:
            eng_logger.info(f'TaskManager running task {task.task_id}')

            # Create a memory object stream to capture messages from the tasks
            send_stream, receive_stream = create_memory_object_stream[TaskMessage](math.inf)

            async def handle_messages():
                async with receive_stream:
                    async for message in receive_stream:
                        if isinstance(message, TaskProgressUpdate):
                            # Send progress notifications to related tasks
                            progress_message = {
                                'task_id': message.task_id,  # Will be updated per task ID in multicast
                                'status': 'PROGRESS',
                                'progress': message.progress,
                                'message': message.message,
                            }
                            await self._multicast_notification(message.task_id, [progress_message])
                            if isinstance(task, Task) and task.on_progress:
                                await run_user_handler(task.on_progress, args=(message,))
                        elif isinstance(message, TaskResult):
                            # Handle dual coordination patterns:
                            # 1. Direct-coordinated tasks: resolve via active_tasks registry
                            if message.task_id in self.tasks:
                                self.tasks[message.task_id].resolve(message.result)

                            # 2. Cache-coordinated tasks: resolve via cache store (CacheStore.set handles PendingTask resolution)
                            if (
                                message.cache_key is not None
                                and message.reg_entry is not None
                                and message.reg_entry.cache is not None
                            ):
                                await self.store.set(message.reg_entry, key=message.cache_key, value=message.result)

                            # Set final result
                            await self.set_result(message.task_id, message.result)

                            # Notify all PendingTasks that depend on this specific task
                            await self._multicast_notification(
                                task_id=message.task_id,
                                messages=[{'result': message.result, 'status': 'COMPLETE', 'task_id': message.task_id}],
                            )

                            # Remove the task from the registered tasks - it finished running
                            self.tasks.pop(message.task_id, None)
                        elif isinstance(message, TaskError):
                            # Fail the pending task related to the error
                            if message.task_id in self.tasks:
                                self.tasks[message.task_id].fail(message.error)

                            # If the task has a cache key, set cached value to None
                            # This makes it so that the next request will recalculate the value rather than keep failing
                            if (
                                message.cache_key is not None
                                and message.reg_entry is not None
                                and message.reg_entry.cache is not None
                            ):
                                await self.store.delete(message.reg_entry, key=message.cache_key)

                            # Notify all PendingTasks that depend on this specific task
                            error = get_error_for_channel(message.error)
                            await self._multicast_notification(
                                task_id=message.task_id,
                                messages=[
                                    {'status': 'ERROR', 'task_id': message.task_id, 'error': error['error']},
                                    error,
                                ],
                            )

                            # Remove the task from the registered tasks - it finished running
                            self.tasks.pop(message.task_id, None)

            task_error: Optional[ExceptionGroup] = None

            # ExceptionGroup handler can't be async so we just mark the task as errored
            # and run the async handler in the finally block
            def handle_exception(err: ExceptionGroup):
                nonlocal task_error
                task_error = err

            try:
                with catch({BaseException: handle_exception}):  # type: ignore
                    async with create_task_group() as tg:
                        # Handle incoming messages in parallel
                        tg.start_soon(handle_messages)

                        # Handle tasks that return other tasks
                        async with send_stream:
                            result = task
                            while isinstance(result, BaseTask):
                                result = await task.run(send_stream)

                            # Notify any channels that need to be notified about the whole task being completed
                            await send_stream.send(
                                TaskResult(
                                    task_id=task.task_id,
                                    result=result,
                                    cache_key=task.cache_key,
                                    reg_entry=task.reg_entry,
                                )
                            )
                            eng_logger.info(f'TaskManager finished task {task.task_id}', {'result': result})
            finally:
                with CancelScope(shield=True):
                    # pyright: ignore[reportUnreachable]
                    if task_error is not None:
                        err = task_error
                        # Mark pending task as failed
                        pending_task.fail(err)

                        await self.set_result(task.task_id, {'error': str(err)})

                        # If the task has a cache key, set cached value to None
                        # This makes it so that the next request will recalculate the value rather than keep failing
                        if (
                            task.cache_key is not None
                            and task.reg_entry is not None
                            and task.reg_entry.cache is not None
                        ):
                            await self.store.delete(task.reg_entry, key=task.cache_key)

                        # If this is a cancellation, ensure all tasks in the hierarchy are cancelled
                        if exception_group_contains(err_type=get_cancelled_exc_class(), group=err):
                            dev_logger.info('Task cancelled', {'task_id': task.task_id})

                            # Cancel any remaining tasks in the hierarchy that might still be running
                            await self._cancel_task_hierarchy(task, notify=True)
                        else:
                            dev_logger.error('Task failed', err, {'task_id': task.task_id})

                            error = get_error_for_channel(err)
                            message = {'status': 'ERROR', 'task_id': task.task_id, 'error': error['error']}
                            # Notify about this task failing, and a server broadcast error
                            await self._send_notification_for_pending_task(
                                pending_task=pending_task,
                                messages=[message, error],
                            )
                            # notify related tasks
                            await self._multicast_notification(
                                task_id=task.task_id,
                                messages=[message],
                            )

                    # Remove the task from the running tasks
                    self.tasks.pop(task.task_id, None)

                # Make sure streams are closed
                with move_on_after(3, shield=True):
                    await send_stream.aclose()
                    await receive_stream.aclose()


TaskResultEntry = CachedRegistryEntry(uid='task-results', cache=LruCachePolicy(max_size=256))
"""
Global registry entry for task results.
This is global because task ids are unique and accessed one time only so it's effectively a one-time use random key.
"""
