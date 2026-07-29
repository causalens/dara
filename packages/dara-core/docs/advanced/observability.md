---
title: OpenTelemetry observability
---

Dara can export traces, logs, and metrics to any OpenTelemetry-compatible collector or backend. The integration uses
[Pydantic Logfire](https://logfire.pydantic.dev/) for instrumentation, but does not send data to Pydantic's hosted
service. Export is configured with standard OpenTelemetry environment variables.

OTLP traces, logs, and metrics are opt-in. Dara's existing Prometheus endpoint remains enabled by default and now
serves the same OTEL metric instruments in Prometheus format. A minimal OTLP/HTTP configuration is:

```dotenv
DARA_OTEL_ENABLED=TRUE
OTEL_SERVICE_NAME=my-dara-app
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_TRACES_EXPORTER=otlp
OTEL_LOGS_EXPORTER=otlp
OTEL_METRICS_EXPORTER=otlp
DARA_OTEL_SHUTDOWN_TIMEOUT_MILLIS=5000
```

Metrics transports are governed by the existing Dara settings and the standard OTEL exporter setting:

| `DARA_DISABLE_METRICS` | `DARA_OTEL_ENABLED` | Behavior |
| --- | --- | --- |
| `FALSE` | `FALSE` | Serve metrics from the existing Prometheus endpoint. |
| `FALSE` | `TRUE` | Keep the Prometheus endpoint and also use the exporter selected by `OTEL_METRICS_EXPORTER`. |
| `TRUE` | `TRUE` | Disable the Prometheus endpoint and use the exporter selected by `OTEL_METRICS_EXPORTER`. |
| `TRUE` | `FALSE` | Disable metrics. |

`DARA_METRICS_PORT` selects the Prometheus port and defaults to `10000`; `DARA_DISABLE_METRICS=TRUE` disables that
endpoint. When telemetry is enabled, `OTEL_METRICS_EXPORTER=otlp` exports metrics through OTLP, while
`OTEL_METRICS_EXPORTER=none` enables traces and logs without an OTLP metrics exporter. Selecting `prometheus` avoids
an OTLP metrics exporter while retaining the existing endpoint unless it is explicitly disabled.

If both the Prometheus endpoint and OTLP metrics are enabled, do not send both transports to the same metrics backend:
they contain observations from the same instruments.

Signal-specific endpoints, authentication headers, TLS certificates, compression, timeouts, resource attributes, and
export intervals can all be set with their standard `OTEL_*` variables. For example, use
`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`, or
`OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` when signals have different destinations.

Set `OTEL_RESOURCE_ATTRIBUTES` to attach deployment metadata such as `service.namespace`, `service.version`,
`deployment.environment.name`, `service.instance.id`, and `vcs.ref.head.revision`. `service.instance.id` should be
unique per running application instance. Dara adds `process.pid`, `dara.process.type`, and a process-local
`dara.process.boot.id`; deployment identity remains under operator control through `OTEL_SERVICE_NAME` and
`OTEL_RESOURCE_ATTRIBUTES`. Keep resource values stable and do not copy them onto metric data-point attributes.

## Exported signals

The initial integration provides:

- FastAPI HTTP server spans, including route, method, status, duration, and error state.
- A WebSocket connection span from the ASGI instrumentation.
- Full-lifecycle spans for synchronous and background action execution.
- Spans for non-heartbeat inbound and outbound WebSocket messages and registered custom handlers.
- Trace-context propagation from actions and custom handlers through queued WebSocket sends.
- Full-lifecycle spans for derived-variable resolution, Python component rendering, streams, uploads, and backend-store
  operations.
- Derived-variable phase spans for lock waiting, dependency resolution, cache lookup, resolver execution, and cache
  writes.
- Task scheduling, waiting, cancellation, and complete application-process lifecycle spans.
- Task-worker and scheduled-job execution spans linked across process boundaries with W3C trace context.
- Standard-library logs as native OpenTelemetry log records with trace and span correlation.
- Standard HTTP server metrics, including request duration, active requests, and request/response sizes.
- Baseline process and runtime metrics from Logfire's system-metrics integration.
- Action and WebSocket active-operation, duration, execution-count, and outcome metrics.
- Active-operation, duration, execution-count, and outcome metrics for derived variables, Python components, streams,
  uploads, and backend stores, plus aggregate derived-variable cache hit, miss, and bypass counts.
- Task lifecycle and control-operation metrics, worker execution metrics, and current worker, busy-worker, and queue
  counts.
- Numeric cache size and entry gauges for the application cache store, individual bounded Dara registries, and their
  total.

Dara's existing console logs remain enabled. The OpenTelemetry log handler is additive.

## Privacy and attribute vocabulary

Dara exports a deliberately narrow vocabulary:

| Signal | Allowed data |
| --- | --- |
| HTTP spans | Route template, method, protocol, status, timing, and request/response sizes. |
| Operation spans | Fixed span name, registered callable name where applicable, bounded execution/operation kind, `dara.outcome`, and exception type. |
| Metrics | The same bounded operation dimensions plus numeric measurements. |
| Logs | Dara structured-log title or rendered standard-library message, trace context, code location, and the allowlisted extras `event_name`, `method`, `operation`, `outcome`, and `status_code`. |
| Resources | Standard deployment identity plus process PID, bounded process type, and process boot ID. |

Application endpoint arguments, path-parameter values, raw URL paths, query-string values, client addresses, request
and response bodies, HTTP headers, baggage, cache keys, task IDs, uploaded content, operation arguments, and returned
values are not exported by default. Raw paths and queries are replaced with `[REDACTED]`; route templates remain
available for aggregation. For failed FastAPI validation Dara records only the number of validation errors, not the
rejected values or error messages.

Exception messages and tracebacks are excluded from spans and OTEL logs. Failures retain only `error.type`, the span
error status, and a bounded outcome. The OTEL logging handler operates on a copy of each record, drops arbitrary
structured extras, and exports only the title from Dara's structured logger because its `content` and `error` fields
can contain application data. Ordinary standard-library log messages retain their rendered arguments. Dara's existing
console handlers continue to receive the original record. This is structural filtering, not pattern-based redaction:
applications remain responsible for keeping user data and credentials out of ordinary log messages.

Action metrics use the `dara.action.*` namespace. WebSocket message and custom-handler metrics use
`dara.websocket.message.*`. Metric dimensions contain only bounded operation types, directions, execution modes,
outcomes, and registered action names. Custom WebSocket handler kinds are span attributes but are deliberately excluded
from metric dimensions so arbitrary client input cannot create unbounded time series.

Derived-variable metrics use `dara.derived_variable.*`; cache-access metrics include only `hit`, `miss`, or `bypass`
and never a cache key. Python component, stream, upload, and backend-store metrics use the `dara.py_component.*`,
`dara.stream.*`, `dara.upload.*`, and `dara.backend_store.*` namespaces. Upload content and filenames, stream events,
store identifiers and keys, operation arguments, and returned values are not telemetry attributes. Each stream has one
lifecycle span; individual emitted events do not create spans.

Cache capacity metrics use `dara.cache.size` in bytes and `dara.cache.entries`. Their `dara.cache.kind` dimension is
one of `store`, `registry`, or `total`; registry observations also have a bounded `dara.registry.name`. Cache keys and
stored values are never dimensions.

Task metrics use `dara.task.*`; worker execution and occupancy use `dara.worker.*`. The task payload carries only the
serialized W3C `traceparent` and `tracestate` fields in addition to its existing function and argument data; baggage is
deliberately excluded. Task IDs and arguments are not span attributes or metric dimensions. Scheduled-job metrics use
`dara.scheduled_job.*`. Spawned processes initialize their own OTLP exporters from inherited `OTEL_*` variables and
identify themselves with `process.pid`, a bounded `dara.process.type`, and `dara.process.boot.id` resource attributes.
Worker and scheduled-job telemetry is flushed on graceful process exit. The Prometheus reader runs only in the
application process because the Python exporter does not support multiprocessing; parent-owned worker count,
busy-worker, and queue-depth metrics remain available on port `10000`.

## HTTP latency percentiles

OpenTelemetry exports HTTP request duration as a histogram. Percentiles such as p50, p95, and p99 are calculated by the
metrics backend rather than inside the application.

For Dara's Prometheus endpoint or an OpenTelemetry Collector exporting classic histograms to Prometheus,
representative percentile queries are:

```promql
histogram_quantile(
  0.50,
  sum by (le, http_route, http_request_method) (
    rate(http_server_request_duration_seconds_bucket[5m])
  )
)

histogram_quantile(
  0.95,
  sum by (le, http_route, http_request_method) (
    rate(http_server_request_duration_seconds_bucket[5m])
  )
)

histogram_quantile(
  0.99,
  sum by (le, http_route, http_request_method) (
    rate(http_server_request_duration_seconds_bucket[5m])
  )
)
```

Exact metric and label names can differ with Collector translation settings, so confirm them in the target Prometheus
deployment. Aggregate by route templates, never raw request paths. Request throughput can be derived from the
histogram count:

```promql
sum by (http_route, http_request_method) (
  rate(http_server_request_duration_seconds_count[5m])
)
```

The downloadable [Prometheus recording rules](../assets/advanced/otel-prometheus-recording-rules.yml) precompute
throughput, error ratio, p50, p95, and p99. A useful Grafana service dashboard should include:

| Panel | PromQL |
| --- | --- |
| Request throughput | `sum(dara:http_requests:rate5m)` |
| HTTP error ratio | `sum(dara:http_errors:rate5m) / clamp_min(sum(dara:http_requests:rate5m), 1)` |
| Request latency | `dara:http_request_duration_seconds:p50`, `:p95`, and `:p99` |
| Active requests | `sum(http_server_active_requests)` |
| Worker saturation | `sum(dara_worker_busy) / clamp_min(sum(dara_worker_count), 1)` |
| Queue saturation | `sum(dara_task_queue_depth)` |
| Cache capacity | `sum by (dara_cache_kind) (dara_cache_size_bytes)` and `dara_cache_entries` |

## Collector example

This example accepts OTLP/HTTP and OTLP/gRPC, batches all signals, forwards traces and logs to a generic OTLP backend,
and exposes OTLP metrics for Prometheus scraping on port `9464`:

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch: {}

exporters:
  otlp/backend:
    endpoint: ${env:OTEL_BACKEND_ENDPOINT}
    tls:
      insecure: false
    sending_queue:
      enabled: true
    retry_on_failure:
      enabled: true
  prometheus:
    endpoint: 0.0.0.0:9464

extensions:
  health_check:
    endpoint: 0.0.0.0:13133

service:
  extensions: [health_check]
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlp/backend]
    logs:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlp/backend]
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [prometheus]
  telemetry:
    metrics:
      readers:
        - pull:
            exporter:
              prometheus:
                host: 0.0.0.0
                port: 8888
```

The Collector's health endpoint is exposed on `13133` and its internal metrics on `8888`. Set
`OTEL_BACKEND_ENDPOINT`, configure TLS and authentication for the chosen backend, and do not use the example's
unauthenticated public listeners without appropriate network controls.

For a local connectivity check, replace the backend exporter with the Collector `debug` exporter. Production
deployments should use a sending queue, retries, TLS, and a persistent queue where loss during Collector restarts is
unacceptable.

## Sampling

`LOGFIRE_TRACE_SAMPLE_RATE` controls head sampling. For example, `0.1` samples approximately ten percent of traces.
Head sampling applies before errors or slow requests are known; use collector-side tail sampling when those traces must
be retained preferentially.

## Shutdown and exporter health

`DARA_OTEL_SHUTDOWN_TIMEOUT_MILLIS` bounds the complete Logfire/OTEL shutdown and defaults to five seconds. Dara calls
Logfire's deadline-aware shutdown directly; it does not wrap shutdown in a background thread that can outlive the
deadline. Signal-specific `OTEL_EXPORTER_OTLP_*_TIMEOUT` variables independently bound each export attempt.

Monitor the Collector rather than inferring exporter health from missing application data. Alert on sustained increases
in `otelcol_exporter_enqueue_failed_spans`, `otelcol_exporter_enqueue_failed_log_records`,
`otelcol_exporter_enqueue_failed_metric_points`, and the corresponding `otelcol_exporter_send_failed_*` counters.
Compare `otelcol_exporter_queue_size` with `otelcol_exporter_queue_capacity`, and compare receiver accepted counts with
exporter sent counts for each signal. Prometheus translation may append `_total` to counter names.

## Optional instrumentation

Dara does not automatically instrument arbitrary application HTTP clients or database libraries. Applications may add
the appropriate OpenTelemetry instrumentation after Dara initializes the providers, but must apply the same attribute
and cardinality policy. Browser telemetry is a separate trust boundary: configure frontend sampling, origins,
authentication, and attribute filtering independently rather than reusing backend exporter credentials.

## Prometheus migration

Existing installations retain the Prometheus endpoint on port `10000`. For a staged migration:

1. Enable `DARA_OTEL_ENABLED=TRUE` and select `OTEL_METRICS_EXPORTER=otlp`, keeping scraped and OTLP metrics in
   separate backends or tenants while comparing them.
2. Update alerts and dashboards using the mapping below.
3. Set `DARA_DISABLE_METRICS=TRUE` after removing the Prometheus scrape target. Alternatively, set
   `OTEL_METRICS_EXPORTER=none` to keep Prometheus metrics alongside OTEL traces and logs.

| Deprecated Prometheus metric | OTEL metric | Notes |
| --- | --- | --- |
| `http_requests_total` | `http.server.request.duration` | Use the translated histogram `_count` for throughput. |
| `http_request_duration_seconds` | `http.server.request.duration` | Standard HTTP semantic-convention histogram. |
| `task_runtimes` | `dara.task.duration` | Use bounded task kind, name, and outcome dimensions. |
| `dv_runtimes` | `dara.derived_variable.duration` | Use bounded resolver, execution, and outcome dimensions. |
| `cache_size_info` | `dara.cache.size` | Numeric bytes; the old human-readable string metric is removed. |
| — | `dara.cache.entries` | Numeric current entry count. |

The endpoint now exposes the translated numeric `dara_cache_size_bytes` and `dara_cache_entries` gauges in place of
`cache_size_info`. All transports use one OTEL instrumentation schema. Metric names shown in PromQL use the default
OTEL-to-Prometheus translation of dotted names and units.
