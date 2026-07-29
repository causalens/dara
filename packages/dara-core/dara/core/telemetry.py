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

import os
from contextlib import AbstractContextManager, suppress
from dataclasses import dataclass, field
from typing import Any

import logfire
from fastapi import FastAPI, Request, WebSocket
from opentelemetry.instrumentation.logging import LoggingInstrumentor
from opentelemetry.instrumentation.system_metrics import SystemMetricsInstrumentor
from opentelemetry.trace import Span
from starlette.types import Scope

from dara.core.internal.settings import get_settings


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
