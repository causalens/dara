---
title: OpenTelemetry observability
---

Dara can export traces, logs, and metrics to any OpenTelemetry-compatible Collector or backend. The integration uses
[Pydantic Logfire](https://logfire.pydantic.dev/) to configure OpenTelemetry, but never sends data to Pydantic's hosted
service.

## Enabling OpenTelemetry

Export is opt-in and configured with standard OpenTelemetry environment variables. A minimal OTLP/HTTP setup is:

```dotenv
DARA_OTEL_ENABLED=TRUE
OTEL_SERVICE_NAME=my-dara-app
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_TRACES_EXPORTER=otlp
OTEL_LOGS_EXPORTER=otlp
OTEL_METRICS_EXPORTER=otlp
```

Use the standard signal-specific variables when traces, logs, and metrics have different destinations:
`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`, and
`OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`. Authentication headers, certificates, compression, and exporter timeouts are
also configured through their standard `OTEL_*` variables.

Set deployment identity through `OTEL_SERVICE_NAME` and `OTEL_RESOURCE_ATTRIBUTES`:

```dotenv
OTEL_RESOURCE_ATTRIBUTES=service.namespace=analytics,service.version=1.4.0,deployment.environment.name=production
```

Dara adds process identity, process type, and a process-local boot ID. Attributes such as `service.instance.id` or a
build revision remain deployment-specific and should be supplied by the runtime.

## Prometheus compatibility

Dara's Prometheus endpoint remains available on port `10000` and serves the same OpenTelemetry metric instruments in
Prometheus format.

- `DARA_METRICS_PORT` changes the endpoint port.
- `DARA_DISABLE_METRICS=TRUE` disables the endpoint.
- `OTEL_METRICS_EXPORTER=none` keeps Prometheus metrics while exporting only traces and logs through OTLP.
- `DARA_DISABLE_METRICS=TRUE` with `OTEL_METRICS_EXPORTER=otlp` exports metrics only through OTLP.

If both Prometheus and OTLP metrics are enabled, do not send both copies to the same metrics backend.

## Collector example

The following Collector configuration receives Dara telemetry over OTLP, forwards traces and logs to an OTLP backend,
and exposes metrics for Prometheus to scrape on port `9464`:

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
    endpoint: telemetry-backend:4317
    tls:
      insecure: false
  prometheus:
    endpoint: 0.0.0.0:9464

service:
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
```

Replace the backend address and configure its authentication and TLS requirements. The Collector `debug` exporter is
useful for checking a local connection before configuring a production sink.

## Local end-to-end test

For local development, Grafana's
[`grafana/otel-lgtm`](https://github.com/grafana/docker-otel-lgtm) image provides a preconfigured Collector, Tempo,
Loki, Prometheus, and Grafana in one container:

```shell
docker run --detach --rm --name dara-otel-lgtm \
  --publish 3000:3000 \
  --publish 4317:4317 \
  --publish 4318:4318 \
  grafana/otel-lgtm:latest
```

Start the Dara application from its project directory and send all three signals to the container:

```shell
env \
  DARA_OTEL_ENABLED=TRUE \
  OTEL_SERVICE_NAME=dara-local \
  OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318 \
  OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf \
  OTEL_TRACES_EXPORTER=otlp \
  OTEL_LOGS_EXPORTER=otlp \
  OTEL_METRICS_EXPORTER=otlp \
  OTEL_METRIC_EXPORT_INTERVAL=1000 \
  poetry run dara start
```

Exercise an endpoint, action, or derived variable, then open Grafana at
[`http://127.0.0.1:3000`](http://127.0.0.1:3000) and sign in with `admin` / `admin`. The preconfigured Explore data
sources show traces in Tempo, logs in Loki, and metrics in Prometheus; filter by the `dara-local` service. Stop the
test backend with `docker stop dara-otel-lgtm`. This image is intended for development and testing, not production.

## What Dara records

Dara provides:

- HTTP server traces and standard request duration, size, and active-request metrics.
- Traces and bounded metrics for actions, WebSocket messages, derived variables, Python components, streams, uploads,
  server variables, persistence operations, and cache access.
- Authentication traces for session handling and OIDC discovery, callbacks, token exchange, token verification,
  provider userinfo, JWKS resolution, refresh, and access checks. These use bounded outcomes and do not attach tokens,
  authorization codes, identity claims, or provider response bodies.
- Trace propagation through queued WebSocket messages, background tasks, worker processes, and scheduled jobs.
- Task queue, worker occupancy, stream progress, cache capacity, process, and runtime metrics.
- Standard-library logs as native OpenTelemetry logs with trace and span correlation.

Route-loader HTTP spans include the resolved Dara route ID, name, and declared path. Action, derived-variable, and
Python-component spans include their registered definition or instance IDs, short function name, and module-qualified
callable identity where available. These identifiers are span attributes only; they are not metric dimensions.

Durations are histograms. Percentiles such as p50, p95, and p99 are calculated by the metrics backend. For Prometheus,
change the first argument to `histogram_quantile` for the desired percentile:

```promql
histogram_quantile(
  0.95,
  sum by (le, http_route, http_request_method) (
    rate(http_server_request_duration_seconds_bucket[5m])
  )
)
```

Exact translated metric and label names can vary with Collector settings. Aggregate HTTP data by route template rather
than raw path.

## Adding application telemetry

Dara configures the process-wide OpenTelemetry providers, so application code can use the standard OpenTelemetry APIs.
Custom telemetry will use the same exporter and will also appear on Dara's Prometheus endpoint where applicable.

### Spans and events

Create a tracer once at module level. Use fixed span and event names, with bounded attributes:

```python
from opentelemetry import trace

tracer = trace.get_tracer(__name__)


def refresh_model():
    with tracer.start_as_current_span('my_app.model.refresh') as span:
        span.set_attribute('my_app.model.kind', 'forecast')

        model = load_model()

        span.add_event(
            'my_app.model.loaded',
            {'my_app.model.source': 'object_store'},
        )
        return model
```

Spans created within an endpoint, action, derived variable, task, or worker automatically join the current trace.
Record identifiers or values only when they are safe and genuinely useful.

### Calls to other services

When an outbound call is made inside a Dara endpoint, action, derived variable, task, or worker, Dara has already made
that operation's span current. An outbound client span created there automatically becomes its child. Propagating that
client span's context lets the receiving service continue the same trace:

`Dara action or derived-variable span → HTTP client span → receiving service span`

Assume an HTTP client is uninstrumented unless the application explicitly installs and enables its matching
OpenTelemetry integration. For example, using HTTPX alone is not enough; enabling
`opentelemetry-instrumentation-httpx` with `HTTPXClientInstrumentor().instrument()` makes ordinary HTTPX requests create
client spans and inject the standard W3C `traceparent` header automatically. Dara does not enable instrumentation for
application HTTP clients because it does not know which client library an application uses.

If no client integration is enabled, create the client span and inject its context explicitly:

```python
import httpx
from opentelemetry import trace
from opentelemetry.propagate import inject
from opentelemetry.trace import SpanKind

tracer = trace.get_tracer(__name__)


async def fetch_catalog():
    headers = {}
    with tracer.start_as_current_span(
        'my_app.catalog.request',
        kind=SpanKind.CLIENT,
    ):
        # Serializes the current client span, including its trace ID and parent span ID.
        inject(headers)
        async with httpx.AsyncClient() as client:
            return await client.get(
                'https://catalog.internal/api/items',
                headers=headers,
            )
```

The receiving service must extract the W3C context; its OpenTelemetry server instrumentation normally handles this.
Its spans will then share the trace ID and appear beneath the client span in the same distributed trace. Use either
client-library instrumentation or the manual client span above, not both, to avoid duplicate spans.
Do not put credentials, user data, or other sensitive values in propagated baggage.

### Metrics

Instruments should also be created once at module level and reused:

```python
from time import perf_counter

from opentelemetry import metrics

meter = metrics.get_meter(__name__)
refreshes = meter.create_counter(
    'my_app.model.refreshes',
    unit='{refresh}',
)
refresh_duration = meter.create_histogram(
    'my_app.model.refresh.duration',
    unit='s',
)


def refresh_model():
    started = perf_counter()
    try:
        return load_model()
    finally:
        refreshes.add(1, {'my_app.model.kind': 'forecast'})
        refresh_duration.record(
            perf_counter() - started,
            {'my_app.model.kind': 'forecast'},
        )
```

Metric attributes create time series. Keep their values bounded: use categories such as operation type, result, or
backend kind; never use user IDs, request IDs, cache keys, URLs, or arbitrary exception messages.

### Logs

Python standard-library logs are exported automatically while existing console logging remains unchanged:

```python
import logging

logger = logging.getLogger(__name__)

logger.info(
    'my_app.model.refreshed',
    extra={
        'operation': 'model.refresh',
        'outcome': 'success',
    },
)
```

Keep exported log messages stable and put only safe, bounded values in structured fields. Dara does not pattern-match
or regex-redact ordinary application log messages, so do not include credentials, request bodies, user data, or
exception text in them. Report detailed sensitive diagnostics through an appropriately secured application logging
path instead.

## Privacy and operations

Dara exports route templates, raw URL paths, methods, status, timing, sizes, and the standard `client.address` HTTP
span attribute. Query strings and query-bearing full URL attributes are redacted. Because path parameter values appear
in `url.path`, applications should never place credentials or secrets in URL paths. Other endpoint arguments, headers,
bodies, cache keys, task IDs, results, exception messages, and tracebacks are excluded by default. A deployment with a
stricter network-identifier policy can remove `client.address` or `url.path` in the Collector.

`LOGFIRE_TRACE_SAMPLE_RATE` controls head sampling. Use Collector-side tail sampling when errors or slow traces must be
retained preferentially.

`DARA_OTEL_SHUTDOWN_TIMEOUT_MILLIS` controls how long application shutdown waits for telemetry flushing and defaults to
five seconds. Monitor Collector receiver, queue, and exporter failure metrics to detect dropped or delayed telemetry.
