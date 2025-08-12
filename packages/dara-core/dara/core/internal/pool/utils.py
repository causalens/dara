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

import copy
import os
import pickle
import signal
import sys
from multiprocessing.process import BaseProcess
from multiprocessing.shared_memory import SharedMemory
from typing import Any, Callable, Optional, Tuple

import anyio
from tblib import Traceback

from dara.core.logging import dev_logger


class SubprocessException:
    """
    Wraps the subprocess' exception.
    This is needed because by default traceback is not serialisable/picklable
    """

    def __init__(self, exc: BaseException):
        self.exception = exc
        self.tb_dict = Traceback(sys.exc_info()[2]).to_dict()

    def unwrap(self):
        """
        Unwrap the exception with the serialised traceback
        """
        tb = Traceback.from_dict(self.tb_dict).as_traceback()
        return self.exception.with_traceback(tb)


SharedMemoryPointer = Tuple[str, int]


class PicklingException(Exception):
    """Wraps any pickling errors so they can be distinguished from other errors"""


def store_in_shared_memory(content: Any) -> SharedMemoryPointer:
    """
    Store content in shared memory

    Returns a tuple of [shared_memory_name, shared_memory_size]

    :param content: content to store in shared memory
    """
    try:
        pickled_args = pickle.dumps(content, protocol=pickle.HIGHEST_PROTOCOL)
        data_size = len(pickled_args)

        shared_mem = SharedMemory(create=True, size=data_size)

        shared_mem.buf[0:data_size] = pickled_args
        shared_mem.close()

        return shared_mem.name, data_size
    except BaseException as e:
        raise PicklingException(*e.args) from e


def read_from_shared_memory(pointer: SharedMemoryPointer) -> Any:
    """
    Read data from a named shared memory of given size

    :param pointer: pointer to shared memory to read from
    """
    try:
        shared_mem_name, data_size = pointer

        # Read from memory
        shared_mem = SharedMemory(name=shared_mem_name)
        data = shared_mem.buf[:data_size]

        # Unpickle and deepcopy
        decoded_payload_shared = pickle.loads(shared_mem.buf)  # nosec B301 # we trust the shared memory pointer passed by the pool
        decoded_payload = copy.deepcopy(decoded_payload_shared)

        # Cleanup
        del data
        del decoded_payload_shared
        shared_mem.close()
        shared_mem.unlink()

        return decoded_payload
    except BaseException as e:
        raise PicklingException(*e.args) from e


async def wait_while(condition: Callable[[], bool], timeout: Optional[float] = None):
    """
    Util to wait until a condition is False or timeout is exceeded

    :param condition: function to call to check
    :param timeout: optional time to wait until a TimeoutError is raised
    """
    with anyio.fail_after(timeout):
        while condition():
            await anyio.sleep(0.05)


async def stop_process_async(process: BaseProcess, timeout: float = 3):
    """
    Attempt to stop a process

    Does not block, waits for the process to terminate for a given number of seconds

    :param process: process to stop
    :param timeout: time to wait until the process is dead
    """
    # no pid so it wasn't even started
    if process.pid is None:
        return

    # Terminate and wait for it to shutdown
    process.terminate()

    try:
        # mimic process.join() in an async way to not block
        await wait_while(process.is_alive, timeout)

        # If it's still alive
        if process.is_alive():
            try:
                os.kill(process.pid, signal.SIGKILL)
                await wait_while(process.is_alive, timeout)
            except OSError as e:
                raise RuntimeError(f'Unable to terminate subprocess with PID {process.pid}') from e

        # If it's still alive raise an exception
        if process.is_alive():
            raise RuntimeError(f'Unable to terminate subprocess with PID {process.pid}')
    except Exception as e:
        dev_logger.error('Error stopping process', e)


def stop_process(process: BaseProcess, timeout: float = 3):
    """
    Attempt to stop a process

    Blocks with process.join()

    :param process: process to stop
    :param timeout: optional time to join the process for
    """
    # no pid so it wasn't even started
    if process.pid is None:
        return

    # Terminate and wait for it to shutdown
    process.terminate()
    process.join(timeout)

    # If it's still alive
    if process.is_alive():
        try:
            os.kill(process.pid, signal.SIGKILL)
            process.join(timeout)
        except OSError as e:
            raise RuntimeError(f'Unable to terminate subprocess with PID {process.pid}') from e

    # If it's still alive raise an exception
    if process.is_alive():
        raise RuntimeError(f'Unable to terminate subprocess with PID {process.pid}')
