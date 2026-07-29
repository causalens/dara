"""Isolated end-to-end telemetry smoke test used by test_telemetry."""

import datetime
import logging

import jwt
from fastapi.testclient import TestClient
from opentelemetry import trace
from opentelemetry._logs import get_logger_provider
from opentelemetry.sdk._logs.export import InMemoryLogRecordExporter, SimpleLogRecordProcessor
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from dara.core.auth.definitions import JWT_ALGO
from dara.core.configuration import ConfigurationBuilder
from dara.core.http import get
from dara.core.internal.settings import get_settings
from dara.core.main import _start_application


def main() -> None:
    """Exercise real Logfire HTTP tracing and native OTEL log correlation."""
    builder = ConfigurationBuilder()

    @get(url='/health')
    def health(token: str):
        logging.getLogger('dara.telemetry-smoke').warning('correlated smoke log')
        return {'ok': True}

    builder.add_endpoint(health)
    app = _start_application(builder._to_configuration())

    span_exporter = InMemorySpanExporter()
    trace.get_tracer_provider().add_span_processor(SimpleSpanProcessor(span_exporter))

    log_exporter = InMemoryLogRecordExporter()
    get_logger_provider().add_log_record_processor(SimpleLogRecordProcessor(log_exporter))

    token = jwt.encode(
        {
            'session_id': 'telemetry-smoke',
            'identity_id': 'telemetry-smoke',
            'identity_name': 'telemetry-smoke',
            'groups': [],
            'exp': datetime.datetime.now(tz=datetime.timezone.utc) + datetime.timedelta(minutes=1),
        },
        get_settings().jwt_secret,
        algorithm=JWT_ALGO,
    )
    with TestClient(app) as client:
        response = client.get(
            '/api/health?token=secret',
            headers={'Authorization': f'Bearer {token}'},
        )
        assert response.status_code == 200, response.text

    request_span = next(span for span in span_exporter.get_finished_spans() if span.name == 'GET /api/health')
    assert request_span.attributes is not None
    assert request_span.attributes['url.query'] == '[REDACTED]'
    assert request_span.attributes['client.address'] == '[REDACTED]'
    assert 'secret' not in repr(request_span.attributes)

    correlated_log = next(
        item for item in log_exporter.get_finished_logs() if item.log_record.body == 'correlated smoke log'
    )
    assert correlated_log.log_record.trace_id == request_span.context.trace_id
    assert correlated_log.log_record.span_id == request_span.context.span_id


if __name__ == '__main__':
    main()
