# This file contains some dummy tasks that can be run in tests and pass the task validation logic
import os
import time

import anyio
from opentelemetry import trace
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


def telemetry_context_task():
    """Return trace and process identity visible inside a task worker."""
    span = trace.get_current_span()
    span_context = span.get_span_context()
    parent = getattr(span, 'parent', None)
    provider = trace.get_tracer_provider()
    resource = getattr(provider, 'resource', None)
    resource_attributes = getattr(resource, 'attributes', {})
    return {
        'trace_id': format(span_context.trace_id, '032x'),
        'span_id': format(span_context.span_id, '016x'),
        'parent_span_id': format(parent.span_id, '016x') if parent is not None else None,
        'span_name': getattr(span, 'name', None),
        'process_pid': os.getpid(),
        'resource_process_pid': resource_attributes.get('process.pid'),
        'process_type': resource_attributes.get('dara.process.type'),
    }


def telemetry_failure_task():
    """Fail immediately for task telemetry tests."""
    raise RuntimeError('expected telemetry task failure')


def telemetry_slow_task():
    """Remain active until cancelled by a task telemetry test."""
    time.sleep(10)


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


# Tasks for testing error and cancellation propagation in chains
async def slow_task_a(value):
    """Task A that takes some time - used as dependency for B and C"""
    await anyio.sleep(0.5)
    return f'A_result_{value}'


async def failing_task_a(value):
    """Task A that fails after some time - used to test error propagation"""
    await anyio.sleep(0.2)
    raise Exception(f'Task A failed with value {value}')


async def very_slow_task_a(value):
    """Task A that takes a long time - used for cancellation testing"""
    await anyio.sleep(10)  # Long enough to be cancelled
    return f'A_result_{value}'


def task_b(a_result):
    """Task B that depends on A"""
    return f'B_processed_{a_result}'


def task_c(a_result):
    """Task C that depends on A"""
    return f'C_processed_{a_result}'
