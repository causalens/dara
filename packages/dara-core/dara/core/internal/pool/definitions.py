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

from datetime import datetime
from enum import Enum
from typing import Any, Optional, Union

from anyio import Event
from typing_extensions import TypedDict, TypeGuard

from dara.core.internal.pool.utils import SharedMemoryPointer, SubprocessException

WORKER_NAME = 'task_pool_worker'


class WorkerParameters(TypedDict):
    task_module: str
    # TODO: max_jobs


class PoolStatus(Enum):
    CREATED = 0
    """ Initial state """

    RUNNING = 1
    """ Active state """

    CLOSED = 2
    """ Closed, pool not accepting new jobs but still handling existing ones """

    STOPPED = 3
    """ Completely stopped, all workers shut down """

    ERROR = 4
    """ Error state"""


class WorkerStatus(Enum):
    CREATED = 0
    """ Initial state """

    IDLE = 1
    """ Worker initialized and waiting for jobs"""

    WORKING = 2
    """ Worker executing a job"""


class TaskPayload(TypedDict):
    function_name: str
    args: tuple
    kwargs: dict


class TaskDefinition:
    """
    Describes a task submitted to the pool
    """

    uid: str
    event: Event
    result: Any
    payload: TaskPayload
    worker_id: Optional[int] = None
    started_at: Optional[datetime] = None
    """TODO: can be used for task timeout or metrics/visibility"""

    def __init__(
        self,
        uid: str,
        payload: TaskPayload,
        worker_id: Optional[int] = None,
        started_at: Optional[datetime] = None,
    ):
        self.uid = uid
        self.payload = payload
        self.worker_id = worker_id
        self.started_at = started_at
        self.event = Event()

    def __await__(self):
        """Await the underlying event, then return or raise the result"""
        yield from self.event.wait().__await__()
        if isinstance(self.result, BaseException):
            raise self.result
        return self.result


# POOL -> WORKER queue messages


class WorkerTask(TypedDict):
    """Sent to workers as a definition of a task to do"""

    task_uid: str
    payload: SharedMemoryPointer
    """Pointer to shared memory storing TaskPayload"""


# WORKER -> POOL messages

Initialization = int
"""Worker_pid, sent when a worker is initialized and ready to take tasks"""


class Acknowledgement(TypedDict):
    """Sent when a worker accepts a task"""

    task_uid: str
    worker_pid: int


class Result(TypedDict):
    """Task result sent when a worker finishes processing a task"""

    task_uid: str
    result: SharedMemoryPointer
    """Pointer to shared memory storing result"""


class Problem(TypedDict):
    """Sent when a worker encounters an issue processing a task"""

    task_uid: Optional[str]
    error: SubprocessException


class Log(TypedDict):
    """Sent when a task emits a stdout message"""

    task_uid: Optional[str]
    log: str


class Progress(TypedDict):
    """Task progress update message"""

    task_uid: str
    progress: float
    message: str


WorkerMessage = Union[Acknowledgement, Result, Problem, Initialization, Log, Progress]
"""Union of possible messages sent from worker processes"""


def is_acknowledgement(worker_msg: WorkerMessage) -> TypeGuard[Acknowledgement]:
    return isinstance(worker_msg, dict) and 'worker_pid' in worker_msg and 'task_uid' in worker_msg


def is_result(worker_msg: WorkerMessage) -> TypeGuard[Result]:
    return isinstance(worker_msg, dict) and 'result' in worker_msg and 'task_uid' in worker_msg


def is_problem(worker_msg: WorkerMessage) -> TypeGuard[Problem]:
    return isinstance(worker_msg, dict) and 'error' in worker_msg and 'task_uid' in worker_msg


def is_initialization(worker_msg: WorkerMessage) -> TypeGuard[Initialization]:
    return isinstance(worker_msg, int)


def is_log(worker_msg: WorkerMessage) -> TypeGuard[Log]:
    return isinstance(worker_msg, dict) and 'log' in worker_msg and 'task_uid' in worker_msg


def is_progress(worker_msg: WorkerMessage) -> TypeGuard[Progress]:
    return (
        isinstance(worker_msg, dict)
        and 'progress' in worker_msg
        and 'task_uid' in worker_msg
        and 'message' in worker_msg
    )
