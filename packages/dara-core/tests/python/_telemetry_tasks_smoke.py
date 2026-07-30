"""End-to-end smoke test for task and subprocess telemetry."""

import contextlib
import json
import os
import tempfile
from pathlib import Path
from typing import cast
from unittest.mock import MagicMock

import anyio
from async_asgi_testclient import TestClient
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from dara.core import telemetry
from dara.core.auth import BasicAuthConfig
from dara.core.configuration import ConfigurationBuilder
from dara.core.http import get
from dara.core.internal.pool import TaskPool
from dara.core.internal.registries import utils_registry
from dara.core.internal.scheduler import ScheduledJob
from dara.core.internal.tasks import Task, TaskManager
from dara.core.main import _start_application

from tests.python.scheduled_jobs import record_telemetry_context
from tests.python.tasks import telemetry_context_task, telemetry_failure_task, telemetry_slow_task


def _mock_task_metrics() -> None:
    """Replace task and pool instruments so their bounded dimensions can be asserted."""
    for name in (
        '_TASK_ACTIVE',
        '_TASK_DURATION',
        '_TASK_EXECUTIONS',
        '_TASK_OPERATION_ACTIVE',
        '_TASK_OPERATION_DURATION',
        '_TASK_OPERATIONS',
        '_WORKER_COUNT',
        '_WORKER_BUSY',
        '_TASK_QUEUE_DEPTH',
    ):
        setattr(telemetry, name, MagicMock())


async def _wait_for_worker(task_id: str) -> None:
    """Wait until the pool acknowledges a task so cancellation covers active work."""
    pool: TaskPool = utils_registry.get('TaskPool')
    with anyio.fail_after(5):
        while task_id not in pool.tasks or pool.tasks[task_id].worker_id is None:
            await anyio.sleep(0.01)


async def main() -> None:
    """Exercise task and scheduled-job propagation through a real Dara application."""
    builder = ConfigurationBuilder()

    @get(url='/telemetry-tasks')
    async def telemetry_tasks():
        task_manager: TaskManager = utils_registry.get('TaskManager')

        successful_task = Task(telemetry_context_task, task_id='telemetry-success')
        successful_pending = task_manager.register_task(successful_task)
        await task_manager.run_task(successful_task)
        successful_result = await successful_pending.run()

        failed_task = Task(telemetry_failure_task, task_id='telemetry-failure')
        failed_pending = task_manager.register_task(failed_task)
        await task_manager.run_task(failed_task)
        with contextlib.suppress(BaseException):
            await failed_pending.run()

        cancelled_task = Task(telemetry_slow_task, task_id='telemetry-cancelled')
        cancelled_pending = task_manager.register_task(cancelled_task)
        await task_manager.run_task(cancelled_task)
        await _wait_for_worker(cancelled_task.task_id)
        await task_manager.cancel_task(cancelled_task.task_id)

        return {
            'successful': successful_result,
            'failed': failed_pending.error is not None,
            'cancelled': cancelled_pending.error is not None,
        }

    builder.add_endpoint(telemetry_tasks)
    auth = BasicAuthConfig(username='test', password='test')
    config = builder._to_configuration()
    config.auth_config = auth
    config.task_module = 'tests.python.tasks'
    app = _start_application(config)

    span_exporter = InMemorySpanExporter()
    cast(TracerProvider, trace.get_tracer_provider()).add_span_processor(SimpleSpanProcessor(span_exporter))
    _mock_task_metrics()

    with tempfile.TemporaryDirectory() as temporary_directory:
        scheduled_result_path = Path(temporary_directory) / 'scheduled-result.json'
        tracer = trace.get_tracer('dara.telemetry-test')
        with tracer.start_as_current_span('telemetry.scheduled.parent') as scheduled_parent:
            scheduled_parent_context = scheduled_parent.get_span_context()
            scheduled_process = ScheduledJob(interval=0, run_once=True).do(
                record_telemetry_context,
                [str(scheduled_result_path)],
            )

        scheduled_process.join(10)
        assert scheduled_process.exitcode == 0
        scheduled_process.close()
        scheduled_result = json.loads(scheduled_result_path.read_text(encoding='utf-8'))

        assert scheduled_result['trace_id'] != format(scheduled_parent_context.trace_id, '032x')
        assert scheduled_result['parent_span_id'] is None
        assert scheduled_result['linked_trace_id'] == format(scheduled_parent_context.trace_id, '032x')
        assert scheduled_result['linked_span_id'] == format(scheduled_parent_context.span_id, '016x')
        assert scheduled_result['span_name'] == 'dara.scheduled_job.run'
        assert scheduled_result['process_pid'] != os.getpid()
        assert scheduled_result['resource_process_pid'] == scheduled_result['process_pid']
        assert scheduled_result['process_type'] == 'scheduled_job'
        assert scheduled_result['process_boot_id']

    async with TestClient(app) as client:
        login = await client.post('/api/auth/session', json={'username': 'test', 'password': 'test'})
        assert login.status_code == 200, login.text

        response = await client.get('/api/telemetry-tasks')
        assert response.status_code == 200, response.text
        response_data = response.json()
        assert response_data['failed'] is True
        assert response_data['cancelled'] is True

    spans = span_exporter.get_finished_spans()
    startup_span = next(span for span in spans if span.name == 'dara.application.startup')
    shutdown_span = next(span for span in spans if span.name == 'dara.application.shutdown')
    assert startup_span.context is not None
    assert shutdown_span.context is not None
    task_pool_start = next(span for span in spans if span.name == 'dara.application.task_pool.start')
    task_pool_stop = next(span for span in spans if span.name == 'dara.application.task_pool.stop')
    assert task_pool_start.parent is not None
    assert task_pool_start.parent.span_id == startup_span.context.span_id
    assert task_pool_stop.parent is not None
    assert task_pool_stop.parent.span_id == shutdown_span.context.span_id
    assert task_pool_start.attributes is not None
    assert task_pool_stop.attributes is not None
    assert task_pool_start.attributes['dara.internal.name'] == 'tests.python.tasks'
    assert task_pool_stop.attributes['dara.internal.name'] == 'tests.python.tasks'

    task_http_span = next(span for span in spans if span.name == 'GET /api/telemetry-tasks')
    assert task_http_span.context is not None

    schedule_spans = [span for span in spans if span.name == 'dara.task.schedule']
    assert len(schedule_spans) == 3
    for span in schedule_spans:
        assert span.parent is not None
        assert span.parent.span_id == task_http_span.context.span_id

    task_spans = [span for span in spans if span.name == 'dara.task.run']
    assert len(task_spans) == 3
    assert {span.attributes.get('dara.outcome') for span in task_spans if span.attributes} == {
        'success',
        'error',
        'cancelled',
    }
    assert {span.parent.span_id for span in task_spans if span.parent is not None} == {
        span.context.span_id for span in schedule_spans if span.context is not None
    }

    successful_span = next(
        span
        for span in task_spans
        if span.attributes is not None and span.attributes.get('dara.task.name') == 'telemetry_context_task'
    )
    assert successful_span.context is not None
    successful_dispatch_span = next(
        span
        for span in spans
        if span.name == 'dara.task.dispatch'
        and span.parent is not None
        and span.parent.span_id == successful_span.context.span_id
    )
    assert successful_dispatch_span.context is not None
    task_result = response_data['successful']
    assert task_result['trace_id'] == format(successful_span.context.trace_id, '032x')
    assert task_result['parent_span_id']
    assert task_result['span_name'] == 'dara.task.execute'
    assert task_result['process_pid'] != os.getpid()
    assert task_result['resource_process_pid'] == task_result['process_pid']
    assert task_result['process_type'] == 'task_worker'
    assert task_result['process_boot_id']
    assert task_result['process_boot_id'] != scheduled_result['process_boot_id']

    result_decode_span = next(
        span
        for span in spans
        if span.name == 'dara.task.result_decode'
        and span.attributes is not None
        and span.attributes.get('dara.task.name') == 'telemetry_context_task'
    )
    assert len(result_decode_span.links) == 1
    result_link = result_decode_span.links[0]
    assert result_link.context.trace_id == successful_span.context.trace_id
    assert result_link.attributes is not None
    assert result_link.attributes['dara.task.relationship'] == 'result_delivery'

    cancel_span = next(span for span in spans if span.name == 'dara.task.cancel')
    assert cancel_span.attributes is not None
    assert cancel_span.attributes['dara.outcome'] == 'success'

    task_metric_attributes = [
        call.args[1] for call in cast(MagicMock, telemetry._TASK_DURATION).record.call_args_list if len(call.args) > 1
    ]
    assert {attributes['dara.outcome'] for attributes in task_metric_attributes} == {
        'success',
        'error',
        'cancelled',
    }
    assert all('task_id' not in attributes for attributes in task_metric_attributes)

    assert sum(call.args[0] for call in cast(MagicMock, telemetry._TASK_QUEUE_DEPTH).add.call_args_list) == 0
    assert sum(call.args[0] for call in cast(MagicMock, telemetry._WORKER_BUSY).add.call_args_list) == 0
    assert sum(call.args[0] for call in cast(MagicMock, telemetry._WORKER_COUNT).add.call_args_list) == 0

    for span in spans:
        attributes = repr(span.attributes)
        assert 'telemetry-success' not in attributes
        assert 'telemetry-failure' not in attributes
        assert 'telemetry-cancelled' not in attributes


if __name__ == '__main__':
    anyio.run(main)
