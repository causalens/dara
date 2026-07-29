---
title: OpenTelemetry observability
---

Dara can export traces, logs, and metrics to any OpenTelemetry-compatible collector or backend. The integration uses
[Pydantic Logfire](https://logfire.pydantic.dev/) for instrumentation, but does not send data to Pydantic's hosted
service. Export is configured with standard OpenTelemetry environment variables.

The integration is opt-in. A minimal OTLP/HTTP configuration is:

```dotenv
DARA_OTEL_ENABLED=TRUE
OTEL_SERVICE_NAME=my-dara-app
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_TRACES_EXPORTER=otlp
OTEL_LOGS_EXPORTER=otlp
OTEL_METRICS_EXPORTER=otlp
```

Signal-specific endpoints, authentication headers, TLS certificates, compression, timeouts, resource attributes, and
export intervals can all be set with their standard `OTEL_*` variables. For example, use
`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`, or
`OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` when signals have different destinations.

Set `OTEL_RESOURCE_ATTRIBUTES` to attach deployment metadata such as `service.namespace`, `service.version`,
`deployment.environment.name`, and `service.instance.id`. Keep these values stable and low-cardinality.

## Exported signals

The initial integration provides:

- FastAPI HTTP server spans, including route, method, status, duration, and error state.
- A WebSocket connection span from the ASGI instrumentation.
- Standard-library logs as native OpenTelemetry log records with trace and span correlation.
- Standard HTTP server metrics, including request duration, active requests, and request/response sizes.
- Baseline process and runtime metrics from Logfire's system-metrics integration.

Dara's existing console logs remain enabled. The OpenTelemetry log handler is additive.

Application endpoint arguments, query-string values, client addresses, request and response bodies, and HTTP headers
are not captured by default. For failed FastAPI validation Dara records only the number of validation errors, not the
rejected values or error messages.

Framework-level spans for action execution, WebSocket message handling, derived variables, streams, task workers, and
scheduled jobs will be added incrementally.

## HTTP latency percentiles

OpenTelemetry exports HTTP request duration as a histogram. Percentiles such as p50, p95, and p99 are calculated by the
metrics backend rather than inside the application.

For an OpenTelemetry Collector exporting classic histograms to Prometheus, a representative p95 query is:

```promql
histogram_quantile(
  0.95,
  sum by (le, http_route, http_request_method) (
    rate(http_server_request_duration_seconds_bucket[5m])
  )
)
```

Use `0.50` or `0.99` for p50 or p99. Exact metric and label names can differ with Collector translation settings, so
confirm them in the target Prometheus deployment. Aggregate by route templates, never raw request paths.

## Sampling

`LOGFIRE_TRACE_SAMPLE_RATE` controls head sampling. For example, `0.1` samples approximately ten percent of traces.
Head sampling applies before errors or slow requests are known; use collector-side tail sampling when those traces must
be retained preferentially.

## Existing Prometheus endpoint

The existing Dara Prometheus endpoint and `DARA_METRICS_PORT` remain unchanged during the initial rollout. If both that
endpoint and OTLP metrics feed the same backend, avoid charting semantically equivalent legacy and OpenTelemetry
metrics together. Dara will migrate its framework-specific Prometheus instruments to OpenTelemetry in a later,
compatibility-focused step.
