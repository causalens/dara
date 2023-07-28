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

import os
from multiprocessing import Queue, get_context
from queue import Empty
from typing import Optional

from dara.core.internal.pool.definitions import (
    Acknowledgement,
    Initialization,
    Log,
    Problem,
    Progress,
    Result,
    SubprocessException,
    TaskDefinition,
    WorkerMessage,
    WorkerTask,
)
from dara.core.internal.pool.utils import SharedMemoryPointer, store_in_shared_memory


class _PoolAPI:
    """
    API for the TaskPool to communicate with the workers
    """

    def __init__(self, task_queue: Queue, out_queue: Queue) -> None:
        self._task_queue = task_queue
        self._out_queue = out_queue

    def dispatch(self, task: TaskDefinition):
        """
        Dispatch a task description message for any worker to pick up

        :param task: task definition to dispatch
        """
        self._task_queue.put(WorkerTask(task_uid=task.uid, payload=store_in_shared_memory(task.payload)))

    def get_worker_message(
        self,
    ) -> Optional[WorkerMessage]:
        """
        Retrieve a worker message if there is one available

        Does not block, returns None if no message available
        """
        try:
            return self._out_queue.get_nowait()
        except Empty:
            return None


class _WorkerAPI:
    """
    API for workers to communicate with the TaskPool
    """

    def __init__(self, task_queue: Queue, out_queue: Queue) -> None:
        self._task_queue = task_queue
        self._out_queue = out_queue

    def initialize_worker(self):
        """
        Confirm a worker has been initialized
        """
        self._out_queue.put(Initialization(os.getpid()))

    def acknowledge(self, task_uid: str):
        """
        Acknowledge a task has been received and accepted

        :param task_uid: uid of the task to acknowledge
        """
        self._out_queue.put(Acknowledgement(task_uid=task_uid, worker_pid=os.getpid()))

    def send_result(self, task_uid: str, result: SharedMemoryPointer):
        """
        Send a result of a given task

        :param task_uid: uid of the task to send result for
        :param result: pointer to shared memory storing the result
        """
        self._out_queue.put(Result(task_uid=task_uid, result=result))

    def send_error(self, task_uid: Optional[str], error: BaseException):
        """
        Send an error back to the pool

        Wraps the error in a SubprocessException to serialize the traceback

        :param task_uid: optional uid of the task to send error for.
            If not specified, the error is a generic one not related to a specific task
        :param error: exception to raise
        """
        self._out_queue.put(Problem(task_uid=task_uid, error=SubprocessException(error)))

    def log(self, task_uid: str, log: str):
        """
        Pass a log message to the pool to put into the logger in the main process

        :param task_uid: uid of the task to send logs for
        :param log: message to log
        """
        self._out_queue.put(Log(task_uid=task_uid, log=log))

    def send_progress(self, task_uid: str, progress: float, message: str):
        """
        Send a progress notification

        :param task_uid: uid of the task to send progress update for
        :param progress: progress from 0-100 to send
        :param message: progress messsage to send
        """
        self._out_queue.put(Progress(task_uid=task_uid, progress=progress, message=message))

    def get_task(self) -> Optional[WorkerTask]:
        """
        Retrieve a task definition from the worker queue if there is one available

        Does not block, returns None if no message available
        """
        try:
            return self._task_queue.get_nowait()
        except Empty:
            return None


class Channel:
    """
    A communication channel allowing bidirectional communication between TaskPool and worker processes via two queues
    """

    def __init__(self):
        ctx = get_context('spawn')
        task_queue = ctx.Queue()
        out_queue = ctx.Queue()

        self.pool_api = _PoolAPI(task_queue, out_queue)
        """The pool API for communicating with worker processes"""
        self.worker_api = _WorkerAPI(task_queue, out_queue)
        """the worker API for communicating with the pool"""
