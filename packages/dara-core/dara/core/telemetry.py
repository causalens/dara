"""
Copyright 2026 Impulse Innovations Limited


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

import asyncio
import logging
import os
from collections.abc import Iterator, Mapping
from contextlib import AbstractContextManager, contextmanager, suppress
from dataclasses import dataclass, field
from threading import Lock, Thread
from time import perf_counter
from typing import Any
from uuid import uuid4

import logfire
from fastapi import FastAPI, Request, WebSocket
from logfire import AdvancedOptions, MetricsOptions
from logfire.types import ExceptionCallbackHelper
from opentelemetry import context as otel_context
from opentelemetry import metrics, trace
from opentelemetry._logs import LogRecord as OTelLogRecord
from opentelemetry._logs import get_logger_provider
from opentelemetry.context import Context
from opentelemetry.exporter.prometheus import PrometheusMetricReader
from opentelemetry.instrumentation.logging import LoggingInstrumentor
from opentelemetry.instrumentation.logging.handler import LoggingHandler
from opentelemetry.instrumentation.system_metrics import SystemMetricsInstrumentor
from opentelemetry.metrics import CallbackOptions, Counter, Histogram, Observation, UpDownCounter
from opentelemetry.sdk.metrics import Histogram as SDKHistogram
from opentelemetry.sdk.metrics import UpDownCounter as SDKUpDownCounter
from opentelemetry.sdk.metrics.view import (
    DefaultAggregation,
    DropAggregation,
    ExplicitBucketHistogramAggregation,
    View,
)
from opentelemetry.trace import Link, Span, SpanKind, Status, StatusCode
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator
from starlette.types import Scope

from dara.core.internal.settings import get_settings
from dara.core.metrics.registry import DARA_METRICS_REGISTRY

_TRACER = trace.get_tracer('dara.core')
_METER = metrics.get_meter('dara.core')
_TRACE_CONTEXT_PROPAGATOR = TraceContextTextMapPropagator()

_PROCESS_BOOT_ID_PID = os.getpid()
_PROCESS_BOOT_ID = str(uuid4())

_ALLOWED_LOG_EXTRA_ATTRIBUTES = frozenset(
    {
        'event_name',
        'method',
        'operation',
        'outcome',
        'status_code',
    }
)

_DURATION_BUCKETS_SECONDS = (
    0.005,
    0.01,
    0.025,
    0.05,
    0.075,
    0.1,
    0.25,
    0.5,
    0.75,
    1,
    2.5,
    5,
    7.5,
    10,
    30,
    60,
    120,
    300,
    600,
)
_METRIC_VIEWS = (
    View(instrument_name='otel.sdk.*', aggregation=DropAggregation()),
    View(
        instrument_type=SDKHistogram,
        instrument_name='*.duration',
        aggregation=ExplicitBucketHistogramAggregation(boundaries=_DURATION_BUCKETS_SECONDS),
    ),
    View(
        instrument_type=SDKUpDownCounter,
        instrument_name='http.server.active_requests',
        attribute_keys={
            'http.flavor',
            'http.method',
            'http.request.method',
            'http.scheme',
            'url.scheme',
        },
        aggregation=DefaultAggregation(),
    ),
)

_ACTION_ACTIVE: UpDownCounter = _METER.create_up_down_counter(
    'dara.action.active',
    unit='{action}',
    description='Number of Dara actions currently executing',
)
_ACTION_DURATION: Histogram = _METER.create_histogram(
    'dara.action.duration',
    unit='s',
    description='Duration of Dara action execution',
)
_ACTION_EXECUTIONS: Counter = _METER.create_counter(
    'dara.action.executions',
    unit='{action}',
    description='Number of completed Dara action executions',
)
_WEBSOCKET_MESSAGE_ACTIVE: UpDownCounter = _METER.create_up_down_counter(
    'dara.websocket.message.active',
    unit='{message}',
    description='Number of Dara WebSocket message operations currently executing',
)
_WEBSOCKET_MESSAGE_DURATION: Histogram = _METER.create_histogram(
    'dara.websocket.message.duration',
    unit='s',
    description='Duration of Dara WebSocket message operations',
)
_WEBSOCKET_MESSAGE_EXECUTIONS: Counter = _METER.create_counter(
    'dara.websocket.message.executions',
    unit='{message}',
    description='Number of completed Dara WebSocket message operations',
)
_DERIVED_VARIABLE_ACTIVE: UpDownCounter = _METER.create_up_down_counter(
    'dara.derived_variable.active',
    unit='{operation}',
    description='Number of Dara derived-variable resolutions currently executing',
)
_DERIVED_VARIABLE_DURATION: Histogram = _METER.create_histogram(
    'dara.derived_variable.duration',
    unit='s',
    description='Duration of Dara derived-variable resolution',
)
_DERIVED_VARIABLE_EXECUTIONS: Counter = _METER.create_counter(
    'dara.derived_variable.executions',
    unit='{operation}',
    description='Number of completed Dara derived-variable resolutions',
)
_DERIVED_VARIABLE_CACHE_ACCESSES: Counter = _METER.create_counter(
    'dara.derived_variable.cache.accesses',
    unit='{access}',
    description='Number of Dara derived-variable cache accesses',
)
_PY_COMPONENT_ACTIVE: UpDownCounter = _METER.create_up_down_counter(
    'dara.py_component.active',
    unit='{operation}',
    description='Number of Dara Python component renders currently executing',
)
_PY_COMPONENT_DURATION: Histogram = _METER.create_histogram(
    'dara.py_component.duration',
    unit='s',
    description='Duration of Dara Python component rendering',
)
_PY_COMPONENT_EXECUTIONS: Counter = _METER.create_counter(
    'dara.py_component.executions',
    unit='{operation}',
    description='Number of completed Dara Python component renders',
)
_STREAM_ACTIVE: UpDownCounter = _METER.create_up_down_counter(
    'dara.stream.active',
    unit='{stream}',
    description='Number of Dara streams currently executing',
)
_STREAM_DURATION: Histogram = _METER.create_histogram(
    'dara.stream.duration',
    unit='s',
    description='Duration of Dara stream lifecycles',
)
_STREAM_EXECUTIONS: Counter = _METER.create_counter(
    'dara.stream.executions',
    unit='{stream}',
    description='Number of completed Dara stream lifecycles',
)
_STREAM_TIME_TO_FIRST_EVENT: Histogram = _METER.create_histogram(
    'dara.stream.time_to_first_event.duration',
    unit='s',
    description='Duration from stream start until its first event',
)
_STREAM_EVENTS: Counter = _METER.create_counter(
    'dara.stream.events',
    unit='{event}',
    description='Number of events emitted by Dara streams',
)
_STREAM_EVENT_INTERVAL: Histogram = _METER.create_histogram(
    'dara.stream.event.interval.duration',
    unit='s',
    description='Duration between consecutive Dara stream events',
)
_WEBSOCKET_QUEUE_DURATION: Histogram = _METER.create_histogram(
    'dara.websocket.queue.duration',
    unit='s',
    description='Duration an outbound WebSocket message waits before sending',
)
_WEBSOCKET_ROUND_TRIP_DURATION: Histogram = _METER.create_histogram(
    'dara.websocket.round_trip.duration',
    unit='s',
    description='Duration from sending a WebSocket request until its response is received',
)
_UPLOAD_ACTIVE: UpDownCounter = _METER.create_up_down_counter(
    'dara.upload.active',
    unit='{upload}',
    description='Number of Dara uploads currently resolving',
)
_UPLOAD_DURATION: Histogram = _METER.create_histogram(
    'dara.upload.duration',
    unit='s',
    description='Duration of Dara upload resolution',
)
_UPLOAD_EXECUTIONS: Counter = _METER.create_counter(
    'dara.upload.executions',
    unit='{upload}',
    description='Number of completed Dara upload resolutions',
)
_BACKEND_STORE_ACTIVE: UpDownCounter = _METER.create_up_down_counter(
    'dara.backend_store.active',
    unit='{operation}',
    description='Number of Dara backend-store operations currently executing',
)
_BACKEND_STORE_DURATION: Histogram = _METER.create_histogram(
    'dara.backend_store.duration',
    unit='s',
    description='Duration of Dara backend-store operations',
)
_BACKEND_STORE_EXECUTIONS: Counter = _METER.create_counter(
    'dara.backend_store.executions',
    unit='{operation}',
    description='Number of completed Dara backend-store operations',
)
_TASK_ACTIVE: UpDownCounter = _METER.create_up_down_counter(
    'dara.task.active',
    unit='{task}',
    description='Number of Dara task lifecycles currently executing',
)
_TASK_DURATION: Histogram = _METER.create_histogram(
    'dara.task.duration',
    unit='s',
    description='Duration of Dara task lifecycles',
)
_TASK_EXECUTIONS: Counter = _METER.create_counter(
    'dara.task.executions',
    unit='{task}',
    description='Number of completed Dara task lifecycles',
)
_TASK_OPERATION_ACTIVE: UpDownCounter = _METER.create_up_down_counter(
    'dara.task.operation.active',
    unit='{operation}',
    description='Number of Dara task control operations currently executing',
)
_TASK_OPERATION_DURATION: Histogram = _METER.create_histogram(
    'dara.task.operation.duration',
    unit='s',
    description='Duration of Dara task control operations',
)
_TASK_OPERATIONS: Counter = _METER.create_counter(
    'dara.task.operations',
    unit='{operation}',
    description='Number of completed Dara task control operations',
)
_WORKER_TASK_ACTIVE: UpDownCounter = _METER.create_up_down_counter(
    'dara.worker.task.active',
    unit='{task}',
    description='Number of task subprocess executions currently active',
)
_WORKER_TASK_DURATION: Histogram = _METER.create_histogram(
    'dara.worker.task.duration',
    unit='s',
    description='Duration of task subprocess execution',
)
_WORKER_TASK_EXECUTIONS: Counter = _METER.create_counter(
    'dara.worker.task.executions',
    unit='{task}',
    description='Number of completed task subprocess executions',
)
_WORKER_COUNT: UpDownCounter = _METER.create_up_down_counter(
    'dara.worker.count',
    unit='{worker}',
    description='Number of Dara task worker processes',
)
_WORKER_BUSY: UpDownCounter = _METER.create_up_down_counter(
    'dara.worker.busy',
    unit='{worker}',
    description='Number of Dara task worker processes executing a task',
)
_TASK_QUEUE_DEPTH: UpDownCounter = _METER.create_up_down_counter(
    'dara.task.queue.depth',
    unit='{task}',
    description='Number of Dara tasks dispatched but not yet acknowledged by a worker',
)
_TASK_QUEUE_DURATION: Histogram = _METER.create_histogram(
    'dara.task.queue.duration',
    unit='s',
    description='Duration from task dispatch until worker acknowledgement',
)
_SCHEDULED_JOB_ACTIVE: UpDownCounter = _METER.create_up_down_counter(
    'dara.scheduled_job.active',
    unit='{job}',
    description='Number of Dara scheduled jobs currently executing',
)
_SCHEDULED_JOB_DURATION: Histogram = _METER.create_histogram(
    'dara.scheduled_job.duration',
    unit='s',
    description='Duration of Dara scheduled job execution',
)
_SCHEDULED_JOB_EXECUTIONS: Counter = _METER.create_counter(
    'dara.scheduled_job.executions',
    unit='{job}',
    description='Number of completed Dara scheduled job executions',
)
_INTERNAL_OPERATION_ACTIVE: UpDownCounter = _METER.create_up_down_counter(
    'dara.internal.operation.active',
    unit='{operation}',
    description='Number of bounded Dara internal operations currently executing',
)
_INTERNAL_OPERATION_DURATION: Histogram = _METER.create_histogram(
    'dara.internal.operation.duration',
    unit='s',
    description='Duration of bounded Dara internal operations',
)
_INTERNAL_OPERATIONS: Counter = _METER.create_counter(
    'dara.internal.operations',
    unit='{operation}',
    description='Number of completed bounded Dara internal operations',
)


@dataclass
class _CacheMetricValues:
    """Latest numeric cache values used by asynchronous OTEL instruments."""

    store_size_bytes: int = 0
    store_entries: int = 0
    registry_size_bytes: dict[str, int] = field(default_factory=dict)
    registry_entries: dict[str, int] = field(default_factory=dict)
    lock: Lock = field(default_factory=Lock)

    def size_observations(self, _options: CallbackOptions) -> Iterator[Observation]:
        """Observe cache sizes by bounded cache kind and registered registry name."""
        with self.lock:
            store_size_bytes = self.store_size_bytes
            registry_size_bytes = dict(self.registry_size_bytes)

        yield Observation(store_size_bytes, {'dara.cache.kind': 'store'})
        for name, size_bytes in registry_size_bytes.items():
            yield Observation(
                size_bytes,
                {
                    'dara.cache.kind': 'registry',
                    'dara.registry.name': name,
                },
            )
        yield Observation(
            store_size_bytes + sum(registry_size_bytes.values()),
            {'dara.cache.kind': 'total'},
        )

    def entry_observations(self, _options: CallbackOptions) -> Iterator[Observation]:
        """Observe cache entry counts by bounded cache kind and registered registry name."""
        with self.lock:
            store_entries = self.store_entries
            registry_entries = dict(self.registry_entries)

        yield Observation(store_entries, {'dara.cache.kind': 'store'})
        for name, entries in registry_entries.items():
            yield Observation(
                entries,
                {
                    'dara.cache.kind': 'registry',
                    'dara.registry.name': name,
                },
            )
        yield Observation(
            store_entries + sum(registry_entries.values()),
            {'dara.cache.kind': 'total'},
        )


_CACHE_METRIC_VALUES = _CacheMetricValues()
_METER.create_observable_gauge(
    'dara.cache.size',
    callbacks=[_CACHE_METRIC_VALUES.size_observations],
    unit='By',
    description='Approximate current size of Dara cache stores and registries',
)
_METER.create_observable_gauge(
    'dara.cache.entries',
    callbacks=[_CACHE_METRIC_VALUES.entry_observations],
    unit='{entry}',
    description='Current number of entries in Dara cache stores and registries',
)


def _safe_request_attributes(
    _request: Request | WebSocket,
    attributes: dict[str, Any],
) -> dict[str, int] | None:
    """
    Preserve validation observability without exporting endpoint arguments.

    FastAPI validation errors contain the rejected input, so only their count is
    retained. Route, method, status, and timing attributes come from the ASGI
    instrumentation independently of this mapper.
    """
    errors = attributes.get('errors')
    if errors:
        return {'fastapi.validation.error_count': len(errors)}
    return None


def _redact_server_request(span: Span, scope: Scope) -> None:
    """Redact query-bearing URL values while retaining the standard URL path."""
    if not span.is_recording():
        return

    if scope.get('query_string'):
        for attribute in ('url.full', 'http.target', 'http.url'):
            span.set_attribute(attribute, '[REDACTED]')
        span.set_attribute('url.query', '[REDACTED]')


def annotate_route(route_path: str, route_name: str, route_id: str | None) -> None:
    """
    Annotate the current HTTP span with the resolved Dara route definition.

    The route path is the developer-declared template, not the request's route
    parameter values. The optional ID is included only when the application
    explicitly configured one rather than using Dara's generated identifier.

    :param route_path: resolved route template, such as ``/customers/:customer_id``
    :param route_name: resolved human-readable route name
    :param route_id: optional explicit route identifier
    """
    span = trace.get_current_span()
    if not span.is_recording():
        return

    span.set_attribute('dara.route.path', route_path)
    span.set_attribute('dara.route.name', route_name)
    if route_id is not None:
        span.set_attribute('dara.route.id', route_id)


def _sanitize_log_body(record: logging.LogRecord) -> str:
    """Return a bounded Dara event name or the rendered standard-library message."""
    if isinstance(record.msg, Mapping):
        event_name = getattr(record, 'event_name', None)
        body = event_name if isinstance(event_name, str) and event_name else 'dara.log'
    elif isinstance(record.msg, str):
        body = record.getMessage()
    else:
        body = f'Log record of type {type(record.msg).__name__}'
    return body


class _SanitizingLoggingHandler(LoggingHandler):
    """Translate standard-library logs without exporting arbitrary extras or exception details."""

    def _get_attributes(self, record: logging.LogRecord) -> Mapping[str, Any]:
        attributes = super()._get_attributes(record)
        return {
            key: value
            for key, value in attributes.items()
            if key in _ALLOWED_LOG_EXTRA_ATTRIBUTES or key.startswith('code.')
        }

    def _translate(self, record: logging.LogRecord) -> OTelLogRecord:
        safe_record = logging.makeLogRecord(record.__dict__.copy())
        safe_record.msg = _sanitize_log_body(record)
        safe_record.args = ()
        safe_record.exc_info = None
        safe_record.exc_text = None
        safe_record.stack_info = None
        return super()._translate(safe_record)


def _get_process_boot_id() -> str:
    """Return a process-local boot identifier that changes after a fork."""
    global _PROCESS_BOOT_ID, _PROCESS_BOOT_ID_PID

    process_pid = os.getpid()
    if process_pid != _PROCESS_BOOT_ID_PID:
        _PROCESS_BOOT_ID_PID = process_pid
        _PROCESS_BOOT_ID = str(uuid4())
    return _PROCESS_BOOT_ID


def _sanitize_span_exception(helper: ExceptionCallbackHelper) -> None:
    """Keep failure classification while suppressing exception messages and tracebacks."""
    helper.no_record_exception()
    helper.span.set_attribute('error.type', type(helper.exception).__name__)
    # Setting a status without a description first prevents OpenTelemetry's
    # context manager from replacing it with ``<type>: <message>``.
    helper.span.set_status(Status(StatusCode.ERROR))


@dataclass
class _OperationObservation:
    """Mutable outcome shared by concurrent work inside one observed operation."""

    span: Span | None = None
    outcome: str = 'success'

    def set_outcome(self, outcome: str) -> None:
        """
        Set a bounded terminal outcome for an operation that handles its own errors.

        :param outcome: terminal outcome such as ``success``, ``error``, or ``cancelled``
        """
        self.outcome = outcome
        if self.span is not None and self.span.is_recording():
            self.span.set_attribute('dara.outcome', outcome)
            if outcome == 'error':
                self.span.set_status(Status(StatusCode.ERROR))

    def record_exception(self, error: BaseException) -> None:
        """
        Mark the operation as failed or cancelled and annotate its span.

        :param error: exception raised by the observed operation
        """
        self.outcome = 'cancelled' if isinstance(error, asyncio.CancelledError) else 'error'
        if self.span is None or not self.span.is_recording():
            return

        if self.outcome == 'error':
            self.span.set_attribute('error.type', type(error).__name__)
            self.span.set_status(Status(StatusCode.ERROR))
        self.span.set_attribute('dara.outcome', self.outcome)


@contextmanager
def _observe_operation(
    *,
    span_name: str,
    span_attributes: dict[str, str],
    metric_attributes: dict[str, str],
    active: UpDownCounter,
    duration: Histogram,
    executions: Counter,
    span_kind: SpanKind = SpanKind.INTERNAL,
    context: Context | None = None,
    links: list[Link] | None = None,
) -> Iterator[_OperationObservation]:
    if not _RUNTIME.configured:
        yield _OperationObservation()
        return

    started = perf_counter()
    active.add(1, metric_attributes)
    observation = _OperationObservation()
    try:
        with _TRACER.start_as_current_span(
            span_name,
            context=context,
            kind=span_kind,
            attributes=span_attributes,
            links=links,
            record_exception=False,
            set_status_on_exception=False,
        ) as span:
            observation.span = span
            try:
                yield observation
            except BaseException as error:
                observation.record_exception(error)
                raise
            finally:
                span.set_attribute('dara.outcome', observation.outcome)
    finally:
        outcome_attributes = {**metric_attributes, 'dara.outcome': observation.outcome}
        duration.record(perf_counter() - started, outcome_attributes)
        executions.add(1, outcome_attributes)
        active.add(-1, metric_attributes)


@contextmanager
def observe_action(
    action_name: str,
    delivery: str,
    handler_type: str,
    *,
    definition_id: str | None,
    instance_id: str | None,
    function_name: str,
) -> Iterator[_OperationObservation]:
    """
    Trace and measure a complete Dara action execution.

    :param action_name: stable registered callable name
    :param delivery: bounded result delivery mode, ``request`` or ``stream``
    :param handler_type: bounded callable type, ``sync`` or ``async``
    :param definition_id: registered action definition identifier
    :param instance_id: action instance identifier, when available
    :param function_name: unqualified action handler name
    """
    metric_attributes = {
        'dara.action.name': action_name,
        'dara.action.delivery': delivery,
        'dara.action.handler.type': handler_type,
    }
    span_attributes = {
        **metric_attributes,
        'dara.action.function.name': function_name,
        'dara.action.function.identity': action_name,
    }
    if definition_id is not None:
        span_attributes['dara.action.definition.id'] = definition_id
    if instance_id is not None:
        span_attributes['dara.action.instance.id'] = instance_id

    with _observe_operation(
        span_name='dara.action.execute',
        span_attributes=span_attributes,
        metric_attributes=metric_attributes,
        active=_ACTION_ACTIVE,
        duration=_ACTION_DURATION,
        executions=_ACTION_EXECUTIONS,
    ) as observation:
        yield observation


@contextmanager
def observe_action_phase(
    phase: str,
    action_name: str,
    *,
    definition_id: str | None,
    instance_id: str | None,
    function_name: str,
) -> Iterator[_OperationObservation]:
    """
    Trace a bounded preparation phase before an action handler is scheduled.

    :param phase: bounded phase such as ``dependencies``
    :param action_name: stable registered callable name
    :param definition_id: registered action definition identifier
    :param instance_id: action instance identifier, when available
    :param function_name: unqualified action handler name
    """
    if not _RUNTIME.configured:
        yield _OperationObservation()
        return

    observation = _OperationObservation()
    attributes = {
        'dara.action.phase': phase,
        'dara.action.name': action_name,
        'dara.action.function.name': function_name,
        'dara.action.function.identity': action_name,
    }
    if definition_id is not None:
        attributes['dara.action.definition.id'] = definition_id
    if instance_id is not None:
        attributes['dara.action.instance.id'] = instance_id

    with _TRACER.start_as_current_span(
        f'dara.action.{phase}',
        attributes=attributes,
        record_exception=False,
        set_status_on_exception=False,
    ) as span:
        observation.span = span
        try:
            yield observation
        except BaseException as error:
            observation.record_exception(error)
            raise
        finally:
            span.set_attribute('dara.outcome', observation.outcome)


@contextmanager
def observe_websocket_message(
    direction: str,
    message_type: str,
    payload_type: str | None = None,
) -> Iterator[_OperationObservation]:
    """
    Trace and measure one inbound or outbound WebSocket message operation.

    :param direction: bounded direction, ``inbound`` or ``outbound``
    :param message_type: bounded protocol type, such as ``message``, ``custom``, ``init``, or ``invalid``
    :param payload_type: safe protocol payload type to add to the span only
    """
    metric_attributes = {
        'dara.websocket.direction': direction,
        'dara.websocket.message.type': message_type,
        'dara.websocket.operation': 'message',
    }
    span_attributes = dict(metric_attributes)
    if payload_type is not None:
        span_attributes['dara.websocket.message.payload.type'] = payload_type

    with _observe_operation(
        span_name=f'dara.websocket.message.{direction}',
        span_attributes=span_attributes,
        metric_attributes=metric_attributes,
        active=_WEBSOCKET_MESSAGE_ACTIVE,
        duration=_WEBSOCKET_MESSAGE_DURATION,
        executions=_WEBSOCKET_MESSAGE_EXECUTIONS,
        span_kind=SpanKind.CONSUMER if direction == 'inbound' else SpanKind.PRODUCER,
    ) as observation:
        yield observation


@contextmanager
def observe_websocket_handler(
    handler_kind: str,
    execution: str,
) -> Iterator[_OperationObservation]:
    """
    Trace and measure one registered custom WebSocket handler.

    The handler kind is recorded only on the span; metric dimensions remain
    bounded even when a client submits arbitrary kinds.

    :param handler_kind: registered custom handler kind
    :param execution: bounded execution mode, ``sync`` or ``async``
    """
    span_attributes = {
        'dara.websocket.direction': 'inbound',
        'dara.websocket.handler.kind': handler_kind,
        'dara.websocket.handler.execution': execution,
        'dara.websocket.message.type': 'custom',
        'dara.websocket.operation': 'handler',
    }
    metric_attributes = {
        'dara.websocket.direction': 'inbound',
        'dara.websocket.handler.execution': execution,
        'dara.websocket.message.type': 'custom',
        'dara.websocket.operation': 'handler',
    }
    with _observe_operation(
        span_name='dara.websocket.handler.execute',
        span_attributes=span_attributes,
        metric_attributes=metric_attributes,
        active=_WEBSOCKET_MESSAGE_ACTIVE,
        duration=_WEBSOCKET_MESSAGE_DURATION,
        executions=_WEBSOCKET_MESSAGE_EXECUTIONS,
    ) as observation:
        yield observation


@contextmanager
def observe_websocket_round_trip(message_type: str) -> Iterator[_OperationObservation]:
    """
    Trace and measure a server-request/client-response WebSocket round trip.

    :param message_type: bounded protocol type, ``message`` or ``custom``
    """
    attributes = {
        'dara.websocket.message.type': message_type,
        'dara.websocket.operation': 'round_trip',
    }
    started = perf_counter()
    observation = _OperationObservation()
    if not _RUNTIME.configured:
        yield observation
        return

    try:
        with _TRACER.start_as_current_span(
            'dara.websocket.round_trip',
            kind=SpanKind.PRODUCER,
            attributes=attributes,
            record_exception=False,
            set_status_on_exception=False,
        ) as span:
            observation.span = span
            try:
                yield observation
            except BaseException as error:
                observation.record_exception(error)
                raise
            finally:
                span.set_attribute('dara.outcome', observation.outcome)
    finally:
        _WEBSOCKET_ROUND_TRIP_DURATION.record(
            perf_counter() - started,
            {**attributes, 'dara.outcome': observation.outcome},
        )


def record_websocket_queue_wait(duration_seconds: float, message_type: str) -> None:
    """
    Record time between enqueueing and sending an outbound WebSocket message.

    :param duration_seconds: elapsed queue time measured with a monotonic clock
    :param message_type: bounded protocol type, ``message`` or ``custom``
    """
    if _RUNTIME.configured:
        _WEBSOCKET_QUEUE_DURATION.record(
            duration_seconds,
            {'dara.websocket.message.type': message_type},
        )


@contextmanager
def observe_derived_variable(
    resolver_name: str,
    execution: str,
    *,
    variable_id: str,
    function_name: str,
) -> Iterator[_OperationObservation]:
    """
    Trace and measure one complete derived-variable resolution.

    :param resolver_name: stable registered resolver name
    :param execution: bounded execution mode, ``inline`` or ``task``
    :param variable_id: registered derived-variable identifier
    :param function_name: unqualified resolver function name
    """
    metric_attributes = {
        'dara.derived_variable.resolver': resolver_name,
        'dara.derived_variable.execution': execution,
        'dara.derived_variable.stage': 'prepare' if execution == 'task' else 'resolve',
    }
    span_attributes = {
        **metric_attributes,
        'dara.derived_variable.id': variable_id,
        'dara.derived_variable.name': function_name,
        'dara.derived_variable.function.name': function_name,
        'dara.derived_variable.function.identity': resolver_name,
    }
    with _observe_operation(
        span_name=f'dara.derived_variable.{"prepare" if execution == "task" else "resolve"}',
        span_attributes=span_attributes,
        metric_attributes=metric_attributes,
        active=_DERIVED_VARIABLE_ACTIVE,
        duration=_DERIVED_VARIABLE_DURATION,
        executions=_DERIVED_VARIABLE_EXECUTIONS,
    ) as observation:
        yield observation


@contextmanager
def observe_derived_variable_phase(
    phase: str,
    resolver_name: str,
) -> Iterator[_OperationObservation]:
    """
    Trace one bounded phase within derived-variable resolution.

    Phase spans deliberately have no independent metrics; the complete resolution
    owns duration and outcome metrics.

    :param phase: bounded phase name
    :param resolver_name: stable registered resolver name
    """
    if not _RUNTIME.configured:
        yield _OperationObservation()
        return

    observation = _OperationObservation()
    with _TRACER.start_as_current_span(
        f'dara.derived_variable.{phase}',
        attributes={
            'dara.derived_variable.phase': phase,
            'dara.derived_variable.resolver': resolver_name,
        },
        record_exception=False,
        set_status_on_exception=False,
    ) as span:
        observation.span = span
        try:
            yield observation
        except BaseException as error:
            observation.record_exception(error)
            raise
        finally:
            span.set_attribute('dara.outcome', observation.outcome)


def record_derived_variable_cache_access(result: str) -> None:
    """
    Count a derived-variable cache outcome without recording its cache key.

    :param result: bounded result, ``hit``, ``miss``, or ``bypass``
    """
    if _RUNTIME.configured:
        _DERIVED_VARIABLE_CACHE_ACCESSES.add(1, {'dara.cache.result': result})


@contextmanager
def observe_py_component(
    component_name: str,
    *,
    definition_id: str,
    instance_id: str | None,
    function_name: str,
) -> Iterator[_OperationObservation]:
    """
    Trace and measure one Python component render.

    :param component_name: stable registered component callable name
    :param definition_id: registered Python component definition identifier
    :param instance_id: rendered component instance identifier, when available
    :param function_name: unqualified renderer function name
    """
    metric_attributes = {'dara.py_component.name': component_name}
    span_attributes = {
        **metric_attributes,
        'dara.py_component.definition.id': definition_id,
        'dara.py_component.function.name': function_name,
        'dara.py_component.function.identity': component_name,
    }
    if instance_id is not None:
        span_attributes['dara.py_component.instance.id'] = instance_id

    with _observe_operation(
        span_name='dara.py_component.render',
        span_attributes=span_attributes,
        metric_attributes=metric_attributes,
        active=_PY_COMPONENT_ACTIVE,
        duration=_PY_COMPONENT_DURATION,
        executions=_PY_COMPONENT_EXECUTIONS,
    ) as observation:
        yield observation


@contextmanager
def observe_stream(stream_name: str) -> Iterator[_OperationObservation]:
    """
    Trace and measure one complete stream lifecycle.

    :param stream_name: stable registered stream callable name
    """
    span_attributes = {'dara.stream.name': stream_name}
    with _observe_operation(
        span_name='dara.stream.run',
        span_attributes=span_attributes,
        metric_attributes=span_attributes,
        active=_STREAM_ACTIVE,
        duration=_STREAM_DURATION,
        executions=_STREAM_EXECUTIONS,
    ) as observation:
        yield observation


def record_stream_progress(
    observation: _OperationObservation,
    *,
    event_count: int,
    time_to_first_event: float | None,
    max_event_interval: float | None,
) -> None:
    """
    Annotate stream progress and record first-event latency once.

    :param observation: active stream observation
    :param event_count: total events emitted so far
    :param time_to_first_event: monotonic elapsed time to the first event, if emitted
    :param max_event_interval: longest interval between consecutive events, if observed
    """
    if observation.span is not None and observation.span.is_recording():
        observation.span.set_attribute('dara.stream.event.count', event_count)
        observation.span.set_attribute('dara.stream.first_event.emitted', time_to_first_event is not None)
        if max_event_interval is not None:
            observation.span.set_attribute('dara.stream.event.max_interval', max_event_interval)
    if _RUNTIME.configured and time_to_first_event is not None:
        _STREAM_TIME_TO_FIRST_EVENT.record(time_to_first_event)


def record_stream_event(interval_seconds: float | None = None) -> None:
    """
    Count one emitted stream event and optionally measure its inter-event interval.

    :param interval_seconds: elapsed time since the preceding event
    """
    if _RUNTIME.configured:
        _STREAM_EVENTS.add(1)
        if interval_seconds is not None:
            _STREAM_EVENT_INTERVAL.record(interval_seconds)


@contextmanager
def observe_upload(resolver_kind: str) -> Iterator[_OperationObservation]:
    """
    Trace and measure one upload resolution.

    :param resolver_kind: bounded resolver kind, ``custom`` or ``default``
    """
    span_attributes = {'dara.upload.resolver.kind': resolver_kind}
    with _observe_operation(
        span_name='dara.upload.resolve',
        span_attributes=span_attributes,
        metric_attributes=span_attributes,
        active=_UPLOAD_ACTIVE,
        duration=_UPLOAD_DURATION,
        executions=_UPLOAD_EXECUTIONS,
    ) as observation:
        yield observation


@contextmanager
def observe_backend_store(
    operation: str,
    backend_name: str,
) -> Iterator[_OperationObservation]:
    """
    Trace and measure one backend-store operation.

    Store identifiers and persistence keys are deliberately excluded.

    :param operation: bounded operation such as ``read``, ``write``, or ``delete``
    :param backend_name: backend implementation class name
    """
    attributes = {
        'dara.backend_store.operation': operation,
        'dara.backend_store.backend': backend_name,
    }
    with _observe_operation(
        span_name=f'dara.backend_store.{operation}',
        span_attributes=attributes,
        metric_attributes=attributes,
        active=_BACKEND_STORE_ACTIVE,
        duration=_BACKEND_STORE_DURATION,
        executions=_BACKEND_STORE_EXECUTIONS,
    ) as observation:
        yield observation


@contextmanager
def observe_internal_operation(
    category: str,
    operation: str,
    *,
    name: str | None = None,
) -> Iterator[_OperationObservation]:
    """
    Trace and measure an important bounded internal operation.

    The optional implementation or registry name is span-only to prevent
    application-defined identifiers from becoming metric dimensions.

    :param category: bounded subsystem such as ``server_variable`` or ``cache``
    :param operation: bounded operation within the subsystem
    :param name: optional stable implementation or registry name
    """
    metric_attributes = {
        'dara.internal.category': category,
        'dara.internal.operation': operation,
    }
    span_attributes = dict(metric_attributes)
    if name is not None:
        span_attributes['dara.internal.name'] = name
    with _observe_operation(
        span_name=f'dara.{category}.{operation}',
        span_attributes=span_attributes,
        metric_attributes=metric_attributes,
        active=_INTERNAL_OPERATION_ACTIVE,
        duration=_INTERNAL_OPERATION_DURATION,
        executions=_INTERNAL_OPERATIONS,
    ) as observation:
        yield observation


@contextmanager
def observe_task(
    task_name: str,
    task_kind: str,
    origin_kind: str | None = None,
    origin_name: str | None = None,
) -> Iterator[_OperationObservation]:
    """
    Trace and measure one complete task lifecycle in the application process.

    :param task_name: stable registered task callable name
    :param task_kind: bounded task kind, ``process`` or ``meta``
    :param origin_kind: optional bounded subsystem that scheduled the task
    :param origin_name: optional stable scheduling callable, recorded on the span only
    """
    span_attributes = {
        'dara.task.name': task_name,
        'dara.task.kind': task_kind,
    }
    metric_attributes = dict(span_attributes)
    if origin_kind is not None:
        span_attributes['dara.task.origin'] = origin_kind
        metric_attributes['dara.task.origin'] = origin_kind
    if origin_name is not None:
        span_attributes['dara.task.origin.name'] = origin_name
    with _observe_operation(
        span_name='dara.task.run',
        span_attributes=span_attributes,
        metric_attributes=metric_attributes,
        active=_TASK_ACTIVE,
        duration=_TASK_DURATION,
        executions=_TASK_EXECUTIONS,
    ) as observation:
        yield observation


@contextmanager
def observe_task_operation(
    operation: str,
    task_kind: str,
) -> Iterator[_OperationObservation]:
    """
    Trace and measure a bounded task control operation.

    Task IDs are deliberately excluded because they are unique per execution.

    :param operation: bounded operation such as ``schedule``, ``wait``, or ``cancel``
    :param task_kind: bounded task kind, ``process``, ``meta``, or ``pending``
    """
    attributes = {
        'dara.task.operation': operation,
        'dara.task.kind': task_kind,
    }
    with _observe_operation(
        span_name=f'dara.task.{operation}',
        span_attributes=attributes,
        metric_attributes=attributes,
        active=_TASK_OPERATION_ACTIVE,
        duration=_TASK_OPERATION_DURATION,
        executions=_TASK_OPERATIONS,
        span_kind=SpanKind.PRODUCER if operation == 'dispatch' else SpanKind.INTERNAL,
    ) as observation:
        yield observation


@contextmanager
def observe_task_phase(phase: str, task_name: str) -> Iterator[_OperationObservation]:
    """
    Trace one bounded task transport or serialization phase.

    :param phase: bounded phase such as ``input_decode`` or ``result_encode``
    :param task_name: stable registered task callable name
    """
    if not _RUNTIME.configured:
        yield _OperationObservation()
        return

    observation = _OperationObservation()
    with _TRACER.start_as_current_span(
        f'dara.task.{phase}',
        attributes={
            'dara.task.phase': phase,
            'dara.task.name': task_name,
        },
        record_exception=False,
        set_status_on_exception=False,
    ) as span:
        observation.span = span
        try:
            yield observation
        except BaseException as error:
            observation.record_exception(error)
            raise
        finally:
            span.set_attribute('dara.outcome', observation.outcome)


@contextmanager
def observe_worker_task(
    task_name: str,
    carrier: Mapping[str, str] | None,
) -> Iterator[_OperationObservation]:
    """
    Attach an incoming W3C context and trace one subprocess task execution.

    :param task_name: stable function name from the configured task module
    :param carrier: serialized W3C propagation carrier
    """
    with use_telemetry_carrier(carrier):
        attributes = {'dara.task.name': task_name}
        with _observe_operation(
            span_name='dara.worker.task.execute',
            span_attributes=attributes,
            metric_attributes=attributes,
            active=_WORKER_TASK_ACTIVE,
            duration=_WORKER_TASK_DURATION,
            executions=_WORKER_TASK_EXECUTIONS,
            span_kind=SpanKind.CONSUMER,
        ) as observation:
            yield observation


@contextmanager
def observe_scheduled_job(
    job_name: str,
    carrier: Mapping[str, str] | None,
) -> Iterator[_OperationObservation]:
    """
    Attach an incoming W3C context and trace one scheduled-job invocation.

    :param job_name: stable scheduled callable name
    :param carrier: serialized W3C propagation carrier
    """
    links: list[Link] = []
    if carrier:
        linked_span_context = trace.get_current_span(_TRACE_CONTEXT_PROPAGATOR.extract(carrier)).get_span_context()
        if linked_span_context.is_valid:
            links.append(Link(linked_span_context))

    attributes = {'dara.scheduled_job.name': job_name}
    with _observe_operation(
        span_name='dara.scheduled_job.run',
        span_attributes=attributes,
        metric_attributes=attributes,
        active=_SCHEDULED_JOB_ACTIVE,
        duration=_SCHEDULED_JOB_DURATION,
        executions=_SCHEDULED_JOB_EXECUTIONS,
        span_kind=SpanKind.CONSUMER,
        context=Context(),
        links=links,
    ) as observation:
        yield observation


def record_worker_count_change(delta: int) -> None:
    """
    Record a change in the number of task worker processes.

    :param delta: positive for creation and negative for removal
    """
    if _RUNTIME.configured:
        _WORKER_COUNT.add(delta)


def record_worker_busy_change(delta: int) -> None:
    """
    Record a change in the number of workers executing tasks.

    :param delta: positive when work starts and negative when it ends
    """
    if _RUNTIME.configured:
        _WORKER_BUSY.add(delta)


def record_task_queue_depth_change(delta: int) -> None:
    """
    Record a change in the number of dispatched, unacknowledged tasks.

    :param delta: positive on dispatch and negative on acknowledgement or cancellation
    """
    if _RUNTIME.configured:
        _TASK_QUEUE_DEPTH.add(delta)


def record_task_queue_wait(duration_seconds: float, task_name: str) -> None:
    """
    Record dispatch-to-acknowledgement latency for a stable task callable.

    :param duration_seconds: elapsed queue time measured with a monotonic clock
    :param task_name: stable registered task callable name
    """
    if _RUNTIME.configured:
        _TASK_QUEUE_DURATION.record(duration_seconds, {'dara.task.name': task_name})


def record_cache_store_metrics(size_bytes: int, entries: int) -> None:
    """
    Set the current application cache-store measurements.

    Values are retained before telemetry starts so the first collection reports
    the complete state created during application setup.

    :param size_bytes: approximate size of stored values in bytes
    :param entries: current number of stored cache entries
    """
    with _CACHE_METRIC_VALUES.lock:
        _CACHE_METRIC_VALUES.store_size_bytes = size_bytes
        _CACHE_METRIC_VALUES.store_entries = entries


def record_registry_cache_metrics(name: str, size_bytes: int, entries: int) -> None:
    """
    Set current measurements for one bounded Dara registry.

    :param name: registered Dara registry type
    :param size_bytes: approximate registry size in bytes
    :param entries: current number of registry entries
    """
    with _CACHE_METRIC_VALUES.lock:
        _CACHE_METRIC_VALUES.registry_size_bytes[name] = size_bytes
        _CACHE_METRIC_VALUES.registry_entries[name] = entries


def capture_telemetry_context() -> Context | None:
    """Capture the current OTEL context when Dara telemetry is enabled."""
    if not _RUNTIME.configured:
        return None
    return otel_context.get_current()


@contextmanager
def use_telemetry_context(context: Context | None) -> Iterator[None]:
    """
    Attach a previously captured OTEL context for the duration of queued work.

    :param context: context captured when the work was queued
    """
    if context is None:
        yield
        return

    token = otel_context.attach(context)
    try:
        yield
    finally:
        otel_context.detach(token)


def capture_telemetry_carrier() -> dict[str, str] | None:
    """Serialize the current OTEL context into a W3C propagation carrier."""
    if not _RUNTIME.configured:
        return None

    carrier: dict[str, str] = {}
    _TRACE_CONTEXT_PROPAGATOR.inject(carrier)
    return carrier or None


@contextmanager
def use_telemetry_carrier(carrier: Mapping[str, str] | None) -> Iterator[None]:
    """
    Extract and attach a serialized W3C context for the duration of an operation.

    :param carrier: W3C propagation fields transported across a process boundary
    """
    if not carrier:
        yield
        return

    token = otel_context.attach(_TRACE_CONTEXT_PROPAGATOR.extract(carrier))
    try:
        yield
    finally:
        otel_context.detach(token)


@dataclass
class _TelemetryRuntime:
    configured: bool = False
    logging_instrumented: bool = False
    logging_handler: LoggingHandler | None = None
    system_metrics_instrumented: bool = False
    fastapi_instrumentation: dict[int, AbstractContextManager[None]] = field(default_factory=dict)

    def initialize_process(self, process_type: str = 'application') -> bool:
        """
        Configure process-wide telemetry once and return whether it is enabled.

        :param process_type: bounded Dara process role used as a resource attribute
        """
        settings = get_settings()
        prometheus_reader_enabled = process_type == 'application' and settings.prometheus_metrics_enabled
        metrics_enabled = settings.otlp_metrics_enabled or prometheus_reader_enabled
        if not settings.dara_otel_enabled and not metrics_enabled:
            return False

        # The stable HTTP duration histogram uses seconds and is the instrument
        # operators should query for latency percentiles.
        os.environ.setdefault('OTEL_SEMCONV_STABILITY_OPT_IN', settings.otel_semconv_stability_opt_in)

        if self.configured:
            return True

        configure_options: dict[str, Any] = {}
        if metrics_enabled:
            additional_readers = (
                [
                    PrometheusMetricReader(
                        registry=DARA_METRICS_REGISTRY,
                        scope_info_enabled=False,
                    )
                ]
                if prometheus_reader_enabled
                else []
            )
            configure_options['metrics'] = MetricsOptions(
                additional_readers=additional_readers,
                views=_METRIC_VIEWS,
            )
        else:
            configure_options['metrics'] = False

        # Logfire discovers standard OTLP exporters during configuration. Mask
        # signals that Dara has not enabled, then restore the process environment.
        exporter_overrides: dict[str, str] = {}
        if prometheus_reader_enabled and not settings.otlp_metrics_enabled:
            exporter_overrides['OTEL_METRICS_EXPORTER'] = 'none'
        if not settings.dara_otel_enabled:
            exporter_overrides.update(
                {
                    'OTEL_TRACES_EXPORTER': 'none',
                    'OTEL_LOGS_EXPORTER': 'none',
                }
            )
        configured_exporters = {name: os.environ.get(name) for name in exporter_overrides}
        os.environ.update(exporter_overrides)

        try:
            logfire.configure(
                send_to_logfire=False,
                console=False,
                scrubbing=False,
                add_baggage_to_attributes=False,
                advanced=AdvancedOptions(exception_callback=_sanitize_span_exception),
                resource_attributes={
                    'process.pid': os.getpid(),
                    'dara.process.type': process_type,
                    'dara.process.boot.id': _get_process_boot_id(),
                },
                **configure_options,
            )
        finally:
            for name, previous_value in configured_exporters.items():
                if previous_value is None:
                    os.environ.pop(name, None)
                else:
                    os.environ[name] = previous_value
        self.configured = True

        if settings.dara_otel_enabled:
            logging_instrumentor = LoggingInstrumentor()
            if not logging_instrumentor.is_instrumented_by_opentelemetry:
                logging_instrumentor.instrument(
                    inject_trace_context=True,
                    log_code_attributes=True,
                    enable_log_auto_instrumentation=False,
                )
                self.logging_instrumented = True
            self.logging_handler = _SanitizingLoggingHandler(
                logger_provider=get_logger_provider(),
                log_code_attributes=True,
            )
            logging.getLogger().addHandler(self.logging_handler)

        if metrics_enabled:
            system_metrics_instrumentor = SystemMetricsInstrumentor()
            if not system_metrics_instrumentor.is_instrumented_by_opentelemetry:
                logfire.instrument_system_metrics()
                self.system_metrics_instrumented = True
        return True

    def initialize(self, app: FastAPI) -> None:
        """Configure process telemetry once and instrument a FastAPI application once."""
        try:
            if not self.initialize_process():
                return

            app_id = id(app)
            if app_id in self.fastapi_instrumentation:
                return

            instrumentation = logfire.instrument_fastapi(
                app,
                capture_headers=False,
                request_attributes_mapper=_safe_request_attributes,
                record_send_receive=False,
                extra_spans=False,
                server_request_hook=_redact_server_request,
            )
            instrumentation.__enter__()
            self.fastapi_instrumentation[app_id] = instrumentation
        except Exception:
            self.shutdown()
            raise

    def shutdown(self) -> None:
        """Remove Dara-owned instrumentation and bound application shutdown latency."""
        if not self.configured:
            return

        for instrumentation in reversed(tuple(self.fastapi_instrumentation.values())):
            with suppress(Exception):
                instrumentation.__exit__(None, None, None)
        self.fastapi_instrumentation.clear()

        if self.system_metrics_instrumented:
            with suppress(Exception):
                SystemMetricsInstrumentor().uninstrument()
            self.system_metrics_instrumented = False

        if self.logging_handler is not None:
            logging.getLogger().removeHandler(self.logging_handler)
            self.logging_handler.close()
            self.logging_handler = None

        if self.logging_instrumented:
            with suppress(Exception):
                LoggingInstrumentor().uninstrument()
            self.logging_instrumented = False

        self.configured = False
        timeout_millis = get_settings().dara_otel_shutdown_timeout_millis

        # Logfire passes the timeout to its providers, but third-party exporters
        # are not required to honour it. A daemon thread makes the application
        # shutdown deadline real without pretending the exporter was stopped.
        def shutdown_providers() -> None:
            with suppress(Exception):
                logfire.shutdown(timeout_millis=timeout_millis)

        shutdown_thread = Thread(
            target=shutdown_providers,
            name='dara-otel-shutdown',
            daemon=True,
        )
        shutdown_thread.start()
        shutdown_thread.join(timeout_millis / 1000)
        if shutdown_thread.is_alive():
            logging.getLogger(__name__).warning(
                'OpenTelemetry shutdown exceeded its configured deadline',
                extra={'event_name': 'telemetry.shutdown.timeout'},
            )


_RUNTIME = _TelemetryRuntime()


def initialize_telemetry(app: FastAPI) -> None:
    """
    Initialize Dara telemetry and instrument an application when enabled.

    Set ``DARA_OTEL_ENABLED=TRUE`` to opt in. Export destinations and signal
    settings are read from standard OpenTelemetry ``OTEL_*`` environment
    variables. Dara never sends data to Pydantic's hosted Logfire service.

    :param app: FastAPI application to instrument
    """
    _RUNTIME.initialize(app)


def initialize_process_telemetry(process_type: str = 'worker') -> None:
    """
    Initialize Dara telemetry in a worker or scheduled-job process.

    Export destinations and signal settings are inherited through standard
    OpenTelemetry environment variables.

    :param process_type: bounded Dara process role
    """
    try:
        _RUNTIME.initialize_process(process_type)
    except Exception:
        _RUNTIME.shutdown()
        raise


def shutdown_telemetry() -> None:
    """Flush and shut down telemetry initialized by Dara."""
    _RUNTIME.shutdown()
