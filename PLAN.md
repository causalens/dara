# Dara OpenTelemetry Plan

## Chunked task list

- [x] Slice 1 — OTEL bootstrap and HTTP coverage
  - [x] Add Pydantic Logfire with FastAPI and system-metrics integrations.
  - [x] Add OpenTelemetry standard-library logging instrumentation.
  - [x] Add a `dara.core.telemetry` module with a narrow initialization interface.
  - [x] Gate all telemetry behind `DARA_OTEL_ENABLED`, disabled by default.
  - [x] Configure Logfire not to send to Pydantic's hosted backend and let standard `OTEL_*` variables configure OTLP/HTTP exporters.
  - [x] Instrument the full FastAPI/ASGI lifecycle without capturing endpoint argument values or HTTP headers by default.
  - [x] Export standard-library logs as native OTEL logs while preserving Dara's existing console output.
  - [x] Enable stable HTTP semantic conventions for telemetry initialized by Dara.
  - [x] Collect baseline process/system metrics.
  - [x] Flush telemetry during application shutdown.
  - [x] Add focused bootstrap, disabled-mode, HTTP, log-correlation, and shutdown tests.
  - [x] Document configuration and update the `dara-core` changelog.

- [x] Slice 2 — Actions and WebSockets
  - [x] Trace the full asynchronous action lifecycle rather than only the scheduling HTTP request.
  - [x] Add spans for synchronous route-load actions.
  - [x] Add spans and duration/error metrics for non-heartbeat WebSocket message handlers.
  - [x] Trace custom synchronous and asynchronous WebSocket handlers.
  - [x] Carry trace context with queued server messages so the actual WebSocket send is correlated with the operation that produced it.
  - [x] Add action and WebSocket active-count, duration, and error metrics.
  - [x] Test parentage across background tasks and WebSocket queues.

- [x] Slice 3 — Derived variables, components, streams, and stores
  - [x] Trace derived-variable cache lookup, lock wait, dependency resolution, resolver execution, and cache write.
  - [x] Record cache-hit and cache-miss metrics without using cache keys as attributes or dimensions.
  - [x] Trace Python component rendering.
  - [x] Trace stream lifecycle and terminal outcomes without creating a span per emitted event by default.
  - [x] Trace upload resolvers and backend-store reads/writes.
  - [x] Add low-cardinality duration and error metrics for these operations.
  - [x] Add focused tests for successful, cached, failed, and cancelled paths.

- [x] Slice 4 — Tasks, workers, and scheduled jobs
  - [x] Trace TaskManager scheduling, waiting, cancellation, and completion.
  - [x] Propagate W3C trace context through Dara's custom task payloads.
  - [x] Initialize telemetry in spawned worker processes and attach incoming context around task execution.
  - [x] Propagate context to scheduled-job subprocesses.
  - [x] Add worker count, busy-worker, queue-depth, task duration, and task outcome metrics.
  - [x] Flush worker telemetry on graceful process exit.
  - [x] Test propagation and resource identity across spawned processes.

- [x] Slice 5 — Metric migration and Prometheus compatibility
  - [x] Replace direct `prometheus_client` operation instrumentation with OTEL instruments.
  - [x] Preserve standard `http.server.request.duration`, active-request, and request/response-size metrics from FastAPI instrumentation.
  - [x] Replace string-valued cache `Info` metrics with numeric byte and entry gauges.
  - [x] Preserve Dara's existing Prometheus port while governing Prometheus and OTLP through existing settings.
  - [x] Document how to avoid duplicate ingestion when Prometheus and OTLP feed the same backend.
  - [x] Add Prometheus/Grafana examples for p50, p95, and p99 using histogram queries.
  - [x] Add dashboards/recording-rule examples for throughput, errors, saturation, and latency.
  - [x] Document the legacy metric-name migration while preserving the existing Prometheus port configuration.

- [ ] Slice 6 — Hardening and rollout
  - [x] Define and document the allowed span/log attribute vocabulary.
  - [x] Exclude secrets, auth data, request bodies, user data, cache keys, and uploaded content by default.
  - [x] Audit all metric dimensions for bounded cardinality.
  - [x] Document head sampling and recommend collector-side tail sampling for distributed traces.
  - [x] Add collector examples for OTLP-to-Prometheus and a trace/log backend.
  - [x] Add telemetry exporter health/drop monitoring guidance.
  - [x] Measure enabled and disabled request overhead.
  - [ ] Add an end-to-end collector smoke test for traces, native logs, and metrics.
  - [x] Document optional outbound HTTP, database, and browser/frontend instrumentation.
  - [x] Retain the standard HTTP `client.address` span attribute while excluding it from logs and metric dimensions.
  - [x] Bound application shutdown even when a third-party exporter ignores its shutdown timeout.
  - [x] Exercise real parameterized routes and HTTP middleware logs to prove raw path values are not exported.

## Architecture

`dara.core.telemetry` will be a deep module. Its external interface will initially contain only:

```python
def initialize_telemetry(app: FastAPI) -> None:
    """Initialize configured telemetry and instrument the application."""

def shutdown_telemetry() -> None:
    """Flush and shut down configured telemetry."""
```

Callers do not construct providers, exporters, processors, handlers, meters, or tracers. Those are implementation details. Manual Dara instrumentation will use module-owned helpers or module-local Logfire instances so attribute policy and naming stay consistent.

Telemetry is a deployment concern:

- `DARA_OTEL_ENABLED=TRUE` opts the process into Dara instrumentation.
- `OTEL_EXPORTER_OTLP_ENDPOINT` or signal-specific endpoint variables select the destination.
- `OTEL_SERVICE_NAME`, `OTEL_RESOURCE_ATTRIBUTES`, and other standard resource variables identify the deployment.
- `OTEL_TRACES_EXPORTER`, `OTEL_METRICS_EXPORTER`, and `OTEL_LOGS_EXPORTER` can disable individual signals.
- `OTEL_EXPORTER_OTLP_HEADERS`, certificate, compression, timeout, and export-interval variables configure transport.
- `LOGFIRE_TRACE_SAMPLE_RATE` configures Logfire head sampling.

Dara will call `logfire.configure(send_to_logfire=False, console=False)`. It must never implicitly send application data to Pydantic's hosted Logfire backend.

## Signal model

### Traces

- FastAPI instrumentation owns HTTP server spans and the WebSocket connection span.
- Dara owns spans for framework operations whose lifetimes do not match an HTTP request.
- Span names are fixed and low-cardinality. Registered operation names are attributes.
- Execution IDs may be trace attributes when useful but are never metric dimensions.
- User/session IDs, cache keys, argument values, request bodies, headers, and results are excluded by default.

### Logs

- Existing Dara console handlers remain in place.
- OpenTelemetry logging instrumentation adds a second native OTEL log handler when enabled.
- Trace and span IDs are injected into log records for console correlation.
- Dara's logger records will use string bodies plus structured extras rather than dictionary-valued `record.msg`.
- Exporter/instrumentation logs must not recursively re-enter the OTEL handler.

### Metrics

- Durations use histograms; p50/p95/p99 are calculated in the metrics backend.
- OTEL exponential histograms are preferred for Prometheus native-histogram compatibility.
- Standard semantic-convention instruments are reused rather than duplicated.
- Custom dimensions are limited to bounded values such as operation name, route, message kind, and outcome.

## Compatibility and rollout

- Telemetry is initially opt-in and has no effect when disabled.
- The current Prometheus endpoint remains untouched in the first slice.
- OTEL and legacy Prometheus metric migration happens only after equivalence and duplicate-ingestion behavior are tested.
- Application-owned Logfire/OpenTelemetry initialization needs an explicit ownership design before becoming public configuration; the first slice assumes Dara owns initialization when `DARA_OTEL_ENABLED=TRUE`.

## Verification

Each slice must include:

- In-memory exporter tests for signal content and trace parentage.
- Disabled-mode tests proving no instrumentation or handler mutation occurs.
- Error/cancellation tests where applicable.
- Cardinality and sensitive-attribute assertions.
- Relevant `dara-core` backend tests.
- `poetry anthology run lint` and `poetry anthology run format-check`.
- A `packages/dara-core/changelog.md` entry under `## NEXT`.
