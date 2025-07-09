# This file contains some dummy tasks that can be run in tests and pass the task validation logic
import time

import anyio
from pandas import DataFrame

from dara.core.visual.progress_updater import ProgressUpdater, track_progress


# Define a mock function that can be spied on so we can check the caching system
async def calc_task(a, b):
    await anyio.sleep(1)
    return str(int(a) + int(b))


# Define a simple functions for a complex task tree scenario
def root(x):
    return int(x) + 1


def leaf_1(x):
    return int(x) + 2


def leaf_2(x):
    return int(x) + 3


async def async_add(x, y):
    await anyio.sleep(0.2)
    return int(x) + int(y)


def add(x, y, delay=None):
    if delay:
        time.sleep(delay)
    return int(x) + int(y)


def unpicklable_result_task(x):
    return lambda: x


def identity_task(x):
    return x


def log_task(x):
    print('TEST_LOG')
    return x


# Define a mock function that will raise an exception
def exception_task():
    raise Exception('test exception')


async def delay_exception_task():
    await anyio.sleep(5)
    raise Exception('test exception')


# Define a mock function with @track_progress that will send updates
@track_progress
def track_task(updater: ProgressUpdater):
    for i in range(1, 6):
        time.sleep(0.05)
        updater.send_update((i / 5) * 100, f'Track1 step {i}')

    time.sleep(0.05)
    return 'result'


# Define a second mock function with @track_progress that will send updates
@track_progress
def track_task_2(updater: ProgressUpdater):
    for i in range(1, 6):
        time.sleep(0.05)
        updater.send_update((i / 5) * 100, f'Track2 step {i}')

    time.sleep(0.05)
    return 'result2'


@track_progress
def track_longer_task(updater: ProgressUpdater):
    for i in range(1, 6):
        time.sleep(0.5)
        updater.send_update((i / 5) * 100, f'Track1 step {i}')

    time.sleep(0.5)
    return 'result'


# Define a second mock function with @track_progress that will send updates
@track_progress
def track_longer_task_2(updater: ProgressUpdater):
    for i in range(1, 6):
        time.sleep(0.5)
        updater.send_update((i / 5) * 100, f'Track2 step {i}')

    time.sleep(0.5)
    return 'result2'


TEST_DATA = DataFrame(
    {
        'col1': [1, 2, 3, 4, 1],
        'col2': [6, 7, 8, 6, 10],
        'col3': ['a', 'b', 'a', 'd', 'e'],
        'col4': ['f', 'f', 'h', 'i', 'j'],
    }
)


async def data_task(a: int):
    await anyio.sleep(3)
    df = TEST_DATA.copy()
    numeric_cols = [col for col in df if df[col].dtype == 'int64']
    df[numeric_cols] += int(a)
    return df
