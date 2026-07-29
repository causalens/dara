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
import os
from collections.abc import Iterator
from contextlib import AbstractContextManager, contextmanager, suppress
from dataclasses import dataclass, field
from time import perf_counter
from typing import Any

import logfire
from fastapi import FastAPI, Request, WebSocket
from opentelemetry import context as otel_context
from opentelemetry import metrics, trace
from opentelemetry.context import Context
from opentelemetry.instrumentation.logging import LoggingInstrumentor
from opentelemetry.instrumentation.system_metrics import SystemMetricsInstrumentor
from opentelemetry.metrics import Counter, Histogram, UpDownCounter
from opentelemetry.trace import Span, Status, StatusCode
from starlette.types import Scope

from dara.core.internal.settings import get_settings

_TRACER = trace.get_tracer('dara.core')
_METER = metrics.get_meter('dara.core')

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
    """Redact request metadata that can contain user-supplied or identifying data."""
    if not span.is_recording():
        return

    if scope.get('query_string'):
        span.set_attribute('url.query', '[REDACTED]')
    if scope.get('client'):
        span.set_attribute('client.address', '[REDACTED]')
        span.set_attribute('client.port', 0)


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
            if outcome != 'success':
                self.span.set_status(Status(StatusCode.ERROR))

    def record_exception(self, error: BaseException) -> None:
        """
        Mark the operation as failed or cancelled and annotate its span.

        :param error: exception raised by the observed operation
        """
        self.outcome = 'cancelled' if isinstance(error, asyncio.CancelledError) else 'error'
        if self.span is None or not self.span.is_recording():
            return

        if isinstance(error, Exception):
            self.span.record_exception(error)
        self.span.set_status(Status(StatusCode.ERROR, str(error)))
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
) -> Iterator[_OperationObservation]:
    if not _RUNTIME.configured:
        yield _OperationObservation()
        return

    started = perf_counter()
    active.add(1, metric_attributes)
    observation = _OperationObservation()
    try:
        with _TRACER.start_as_current_span(span_name, attributes=span_attributes) as span:
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
def observe_action(action_name: str, execution: str) -> Iterator[_OperationObservation]:
    """
    Trace and measure a complete Dara action execution.

    :param action_name: stable registered callable name
    :param execution: bounded execution mode such as ``sync`` or ``async``
    """
    attributes = {
        'dara.action.name': action_name,
        'dara.action.execution': execution,
    }
    with _observe_operation(
        span_name='dara.action.execute',
        span_attributes=attributes,
        metric_attributes=attributes,
        active=_ACTION_ACTIVE,
        duration=_ACTION_DURATION,
        executions=_ACTION_EXECUTIONS,
    ) as observation:
        yield observation


@contextmanager
def observe_websocket_message(
    direction: str,
    message_type: str,
) -> Iterator[_OperationObservation]:
    """
    Trace and measure one inbound or outbound WebSocket message operation.

    :param direction: bounded direction, ``inbound`` or ``outbound``
    :param message_type: bounded protocol type, ``message``, ``custom``, or ``invalid``
    """
    attributes = {
        'dara.websocket.direction': direction,
        'dara.websocket.message.type': message_type,
        'dara.websocket.operation': 'message',
    }
    with _observe_operation(
        span_name=f'dara.websocket.message.{direction}',
        span_attributes=attributes,
        metric_attributes=attributes,
        active=_WEBSOCKET_MESSAGE_ACTIVE,
        duration=_WEBSOCKET_MESSAGE_DURATION,
        executions=_WEBSOCKET_MESSAGE_EXECUTIONS,
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
def observe_derived_variable(
    resolver_name: str,
    execution: str,
) -> Iterator[_OperationObservation]:
    """
    Trace and measure one complete derived-variable resolution.

    :param resolver_name: stable registered resolver name
    :param execution: bounded execution mode, ``inline`` or ``task``
    """
    attributes = {
        'dara.derived_variable.resolver': resolver_name,
        'dara.derived_variable.execution': execution,
    }
    with _observe_operation(
        span_name='dara.derived_variable.resolve',
        span_attributes=attributes,
        metric_attributes=attributes,
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
def observe_py_component(component_name: str) -> Iterator[_OperationObservation]:
    """
    Trace and measure one Python component render.

    :param component_name: stable registered component callable name
    """
    span_attributes = {'dara.py_component.name': component_name}
    with _observe_operation(
        span_name='dara.py_component.render',
        span_attributes=span_attributes,
        metric_attributes=span_attributes,
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


@dataclass
class _TelemetryRuntime:
    configured: bool = False
    logging_instrumented: bool = False
    system_metrics_instrumented: bool = False
    fastapi_instrumentation: dict[int, AbstractContextManager[None]] = field(default_factory=dict)

    def initialize(self, app: FastAPI) -> None:
        """Configure process telemetry once and instrument a FastAPI application once."""
        settings = get_settings()
        if not settings.dara_otel_enabled:
            return

        # The stable HTTP duration histogram uses seconds and is the instrument
        # operators should query for latency percentiles.
        os.environ.setdefault('OTEL_SEMCONV_STABILITY_OPT_IN', settings.otel_semconv_stability_opt_in)

        try:
            if not self.configured:
                logfire.configure(send_to_logfire=False, console=False)
                self.configured = True

                LoggingInstrumentor().instrument(inject_trace_context=True, log_code_attributes=True)
                self.logging_instrumented = True

                logfire.instrument_system_metrics()
                self.system_metrics_instrumented = True

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
        """Remove Dara-owned instrumentation and flush all configured OTEL signals."""
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

        if self.logging_instrumented:
            with suppress(Exception):
                LoggingInstrumentor().uninstrument()
            self.logging_instrumented = False

        with suppress(Exception):
            logfire.shutdown()
        self.configured = False


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


def shutdown_telemetry() -> None:
    """Flush and shut down telemetry initialized by Dara."""
    _RUNTIME.shutdown()
