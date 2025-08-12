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

from __future__ import annotations

import logging
import os
import signal
import sys
from datetime import datetime
from importlib import import_module
from inspect import iscoroutinefunction
from multiprocessing import get_context
from multiprocessing.context import SpawnProcess
from time import sleep
from typing import Callable, Optional

import anyio

from dara.core.internal.pool.channel import Channel
from dara.core.internal.pool.definitions import (
    WORKER_NAME,
    WorkerParameters,
    WorkerStatus,
)
from dara.core.internal.pool.utils import (
    SubprocessException,
    read_from_shared_memory,
    store_in_shared_memory,
)


class StdoutLogger:
    """A mock stdout which instead puts logs into channel messages"""

    def __init__(self, task_uid: str, channel: Channel):
        self.task_uid = task_uid
        self.channel = channel

    def write(self, msg):
        # Ignore newline logs
        if msg != '\n':
            self.channel.worker_api.log(self.task_uid, msg)

    def flush(self):
        if sys.__stdout__:
            sys.__stdout__.flush()


def execute_function(func: Callable, args: tuple, kwargs: dict):
    """
    Execute a function, handling sync/async and exceptions cleanly

    :param func: function to execute
    :param args: arguments to the function
    :param kwargs: keyword arguments to the function
    """
    try:
        # Handle async functions
        if iscoroutinefunction(func):
            # Use a wrapper to be able to pass in kwargs
            async def _async_wrapper():
                return await func(*args, **kwargs)

            result = anyio.run(_async_wrapper, backend='asyncio')
        else:
            result = func(*args, **kwargs)

        return result
    except BaseException as e:
        # Just return the exception wrapped instead of raising
        return SubprocessException(e)


def _create_send_update(task_uid: str, channel: Channel):
    """Create a __send_update method to inject into the @track_progress-wrapped function"""
    return lambda *args: channel.worker_api.send_progress(task_uid, *args)


def _setup_logger() -> logging.Logger:
    """
    Setup a dev logger which can be used for extra debug logs within the worker
    """
    dev_level = os.environ.get('DARA_DEV_LOG_LEVEL', 'INFO')

    if dev_level == 'NONE':
        dev_level = 'INFO'

    dev_logger = logging.getLogger(f'Worker {os.getpid()}')
    dev_logger.setLevel(dev_level)
    handler = logging.StreamHandler(sys.__stdout__)
    handler.formatter = logging.Formatter('%(name)s: %(message)s')
    dev_logger.addHandler(handler)
    return dev_logger


def worker_loop(worker_params: WorkerParameters, channel: Channel):
    """
    Main worker loop

    :param worker_params: worker parameters
    :param channel: communication channel
    """
    dev_logger = _setup_logger()
    dev_logger.debug('Initializing worker...')

    # Ignore keyboard interrupt (ctrl + C)
    signal.signal(signal.SIGINT, signal.SIG_IGN)

    # Handle SIGTERM
    terminate = False

    def on_sigterm(*args):
        nonlocal terminate
        terminate = True

    signal.signal(signal.SIGTERM, on_sigterm)

    worker_api = channel.worker_api

    # Initialize
    task_module = None
    try:
        task_module = import_module(worker_params['task_module'])
    except BaseException as e:
        worker_api.send_error(task_uid=None, error=e)
        sys.exit(1)
    else:
        worker_api.initialize_worker()
        dev_logger.debug('Worker initialized')

    while True:
        sleep(0.1)

        # Gracefully exit the loop if SIGTERM received
        if terminate:
            break

        # Check for new tasks to pick up
        task = worker_api.get_task()
        if task is None:
            continue

        # Task received - remove graceful sigterm handler so terminate will stop the task in-progress
        signal.signal(signal.SIGTERM, signal.SIG_DFL)

        # Acknowledge receiving a task
        task_uid = task['task_uid']
        worker_api.acknowledge(task_uid)
        dev_logger.debug(f'Worker picked up task {task_uid}')

        # Redirect logs via the channel
        stdout_logger = StdoutLogger(task_uid, channel)
        sys.stdout = stdout_logger  # type: ignore

        try:
            payload_pointer = task['payload']
            payload = read_from_shared_memory(payload_pointer)

            func = getattr(task_module, payload['function_name'])
            kwargs = payload['kwargs']

            # If func is decorated with @track_progress, inject updater method
            wrapped_by = getattr(func, '__wrapped_by__', None)
            if wrapped_by is not None and wrapped_by.__name__ == 'track_progress':
                kwargs = {**kwargs, '__send_update': _create_send_update(task_uid, channel)}

            result = execute_function(func, payload['args'], kwargs)

            result_pointer = store_in_shared_memory(result)
            worker_api.send_result(task_uid, result_pointer)
        except BaseException as e:
            worker_api.send_error(task_uid=task_uid, error=e)
        finally:
            # Task finished - restore graceful sigterm handler
            signal.signal(signal.SIGTERM, on_sigterm)


class WorkerProcess:
    process: SpawnProcess

    status: WorkerStatus

    task_uid: Optional[str] = None
    """Current task UID being processed by the worker"""

    channel: Channel

    updated_at: datetime
    """When the worker status has last been updated"""

    def __init__(self, worker_parameters: WorkerParameters, channel: Channel):
        self._start_process(worker_parameters, channel)
        self.update_status(WorkerStatus.CREATED)
        self.channel = channel

    def _start_process(self, worker_params: WorkerParameters, channel: Channel):
        ctx = get_context('spawn')
        self.process = ctx.Process(target=worker_loop, args=(worker_params, channel), name=WORKER_NAME)
        self.process.start()

    def update_status(self, worker_status: WorkerStatus, task_uid: Optional[str] = None):
        self.status = worker_status
        self.updated_at = datetime.now()
        self.task_uid = task_uid

    def terminate(self):
        self.process.terminate()
