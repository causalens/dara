import logging
import os
import subprocess
import sys
import time
from pathlib import Path
from unittest.mock import ANY, MagicMock, call, patch

import pytest
from async_asgi_testclient import TestClient as AsyncClient
from opentelemetry import baggage
from opentelemetry.trace import NonRecordingSpan, SpanContext, TraceFlags, TraceState, set_span_in_context

from dara.core import telemetry
from dara.core.configuration import ConfigurationBuilder
from dara.core.internal.settings import get_settings
from dara.core.main import _start_application

from tests.python.utils import create_app

pytestmark = pytest.mark.anyio


@pytest.fixture(autouse=True)
def clear_settings_cache():
    """Reload environment-backed telemetry settings for each application test."""
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _start_test_application():
    return _start_application(create_app(ConfigurationBuilder()))


async def test_telemetry_is_disabled_when_all_transports_are_disabled(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv('DARA_OTEL_ENABLED', raising=False)
    monkeypatch.setenv('DARA_DISABLE_METRICS', 'TRUE')
    monkeypatch.delenv('OTEL_SEMCONV_STABILITY_OPT_IN', raising=False)

    with (
        patch('dara.core.telemetry.logfire.configure') as configure,
        patch('dara.core.telemetry.logfire.instrument_fastapi') as instrument_fastapi,
        patch('dara.core.telemetry.logfire.instrument_system_metrics') as instrument_system_metrics,
    ):
        app = _start_test_application()
        async with AsyncClient(app):
            pass

    configure.assert_not_called()
    instrument_fastapi.assert_not_called()
    instrument_system_metrics.assert_not_called()
    assert 'OTEL_SEMCONV_STABILITY_OPT_IN' not in os.environ


async def test_initializes_all_signals_and_shuts_them_down(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv('DARA_OTEL_ENABLED', 'TRUE')
    monkeypatch.setenv('DARA_DISABLE_METRICS', 'TRUE')
    monkeypatch.delenv('OTEL_SEMCONV_STABILITY_OPT_IN', raising=False)
    instrumentation = MagicMock()

    with (
        patch('dara.core.telemetry.logfire.configure') as configure,
        patch('dara.core.telemetry.logfire.instrument_fastapi', return_value=instrumentation) as instrument_fastapi,
        patch('dara.core.telemetry.logfire.instrument_system_metrics') as instrument_system_metrics,
        patch('dara.core.telemetry.logfire.shutdown') as shutdown,
        patch('dara.core.telemetry.LoggingInstrumentor') as logging_instrumentor,
        patch('dara.core.telemetry.SystemMetricsInstrumentor') as system_metrics_instrumentor,
    ):
        logging_instrumentor.return_value.is_instrumented_by_opentelemetry = False
        system_metrics_instrumentor.return_value.is_instrumented_by_opentelemetry = False
        app = _start_test_application()
        async with AsyncClient(app):
            instrumentation.__exit__.assert_not_called()

    configure.assert_called_once_with(
        send_to_logfire=False,
        console=False,
        scrubbing=False,
        add_baggage_to_attributes=False,
        advanced=ANY,
        resource_attributes={
            'process.pid': os.getpid(),
            'dara.process.type': 'application',
            'dara.process.boot.id': ANY,
        },
        metrics=ANY,
    )
    logging_instrumentor.return_value.instrument.assert_called_once_with(
        inject_trace_context=True,
        log_code_attributes=True,
        enable_log_auto_instrumentation=False,
    )
    instrument_system_metrics.assert_called_once_with()
    instrument_fastapi.assert_called_once_with(
        app,
        capture_headers=False,
        request_attributes_mapper=telemetry._safe_request_attributes,
        record_send_receive=False,
        extra_spans=False,
        server_request_hook=telemetry._redact_server_request,
    )
    instrumentation.__enter__.assert_called_once_with()
    instrumentation.__exit__.assert_called_once_with(None, None, None)
    system_metrics_instrumentor.return_value.uninstrument.assert_called_once_with()
    logging_instrumentor.return_value.uninstrument.assert_called_once_with()
    shutdown.assert_called_once_with(timeout_millis=5000)
    assert os.environ['OTEL_SEMCONV_STABILITY_OPT_IN'] == 'http'


async def test_preserves_explicit_semantic_convention_configuration(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv('DARA_OTEL_ENABLED', 'yes')
    monkeypatch.setenv('DARA_DISABLE_METRICS', 'TRUE')
    monkeypatch.setenv('OTEL_SEMCONV_STABILITY_OPT_IN', 'http/dup')

    with (
        patch('dara.core.telemetry.logfire.configure'),
        patch('dara.core.telemetry.logfire.instrument_fastapi', return_value=MagicMock()),
        patch('dara.core.telemetry.logfire.instrument_system_metrics'),
        patch('dara.core.telemetry.logfire.shutdown'),
        patch('dara.core.telemetry.LoggingInstrumentor') as logging_instrumentor,
        patch('dara.core.telemetry.SystemMetricsInstrumentor') as system_metrics_instrumentor,
    ):
        logging_instrumentor.return_value.is_instrumented_by_opentelemetry = False
        system_metrics_instrumentor.return_value.is_instrumented_by_opentelemetry = False
        app = _start_test_application()
        async with AsyncClient(app):
            pass

    assert os.environ['OTEL_SEMCONV_STABILITY_OPT_IN'] == 'http/dup'


async def test_prometheus_endpoint_translates_otel_metrics_without_an_otlp_reader(monkeypatch: pytest.MonkeyPatch):
    """The Prometheus endpoint uses the OTEL meter provider when OTLP metrics are disabled."""
    monkeypatch.setenv('DARA_OTEL_ENABLED', 'TRUE')
    monkeypatch.setenv('OTEL_METRICS_EXPORTER', 'none')
    instrumentation = MagicMock()
    prometheus_reader = MagicMock()

    with (
        patch('dara.core.telemetry.logfire.configure') as configure,
        patch('dara.core.telemetry.logfire.instrument_fastapi', return_value=instrumentation),
        patch('dara.core.telemetry.logfire.instrument_system_metrics') as instrument_system_metrics,
        patch('dara.core.telemetry.logfire.shutdown'),
        patch('dara.core.telemetry.LoggingInstrumentor') as logging_instrumentor,
        patch('dara.core.telemetry.PrometheusMetricReader', return_value=prometheus_reader) as reader_class,
        patch('dara.core.telemetry.SystemMetricsInstrumentor') as system_metrics_instrumentor,
    ):
        logging_instrumentor.return_value.is_instrumented_by_opentelemetry = False
        system_metrics_instrumentor.return_value.is_instrumented_by_opentelemetry = False
        app = _start_test_application()
        async with AsyncClient(app):
            pass

    reader_class.assert_called_once_with(
        registry=telemetry.DARA_METRICS_REGISTRY,
        scope_info_enabled=False,
    )
    configure_options = configure.call_args.kwargs
    assert configure_options['send_to_logfire'] is False
    assert configure_options['console'] is False
    assert configure_options['resource_attributes'] == {
        'process.pid': os.getpid(),
        'dara.process.type': 'application',
        'dara.process.boot.id': ANY,
    }
    assert configure_options['scrubbing'] is False
    metrics_options = configure_options['metrics']
    assert metrics_options.additional_readers == [prometheus_reader]
    assert metrics_options.views == telemetry._METRIC_VIEWS
    instrument_system_metrics.assert_called_once_with()
    logging_instrumentor.return_value.instrument.assert_called_once_with(
        inject_trace_context=True,
        log_code_attributes=True,
        enable_log_auto_instrumentation=False,
    )
    assert os.environ['OTEL_METRICS_EXPORTER'] == 'none'


async def test_prometheus_only_mode_masks_ambient_trace_and_log_exporters(monkeypatch: pytest.MonkeyPatch):
    """An ambient OTLP endpoint cannot opt disabled Dara signals back in."""
    monkeypatch.setenv('DARA_OTEL_ENABLED', 'FALSE')
    monkeypatch.setenv('DARA_DISABLE_METRICS', 'FALSE')
    monkeypatch.setenv('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://collector:4318')
    monkeypatch.delenv('OTEL_TRACES_EXPORTER', raising=False)
    monkeypatch.delenv('OTEL_LOGS_EXPORTER', raising=False)
    observed_exporters = {}

    def capture_exporters(**_kwargs):
        observed_exporters.update(
            {
                'traces': os.environ.get('OTEL_TRACES_EXPORTER'),
                'logs': os.environ.get('OTEL_LOGS_EXPORTER'),
                'metrics': os.environ.get('OTEL_METRICS_EXPORTER'),
            }
        )

    with (
        patch('dara.core.telemetry.logfire.configure', side_effect=capture_exporters),
        patch('dara.core.telemetry.logfire.instrument_fastapi', return_value=MagicMock()),
        patch('dara.core.telemetry.logfire.instrument_system_metrics'),
        patch('dara.core.telemetry.logfire.shutdown'),
        patch('dara.core.telemetry.LoggingInstrumentor') as logging_instrumentor,
        patch('dara.core.telemetry.SystemMetricsInstrumentor') as system_metrics_instrumentor,
    ):
        system_metrics_instrumentor.return_value.is_instrumented_by_opentelemetry = False
        app = _start_test_application()
        async with AsyncClient(app):
            pass

    assert observed_exporters == {'traces': 'none', 'logs': 'none', 'metrics': 'none'}
    assert 'OTEL_TRACES_EXPORTER' not in os.environ
    assert 'OTEL_LOGS_EXPORTER' not in os.environ
    logging_instrumentor.return_value.instrument.assert_not_called()


async def test_otlp_only_metrics_receive_dara_duration_views(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv('DARA_OTEL_ENABLED', 'TRUE')
    monkeypatch.setenv('DARA_DISABLE_METRICS', 'TRUE')
    monkeypatch.setenv('OTEL_METRICS_EXPORTER', 'otlp')

    with (
        patch('dara.core.telemetry.logfire.configure') as configure,
        patch('dara.core.telemetry.logfire.instrument_fastapi', return_value=MagicMock()),
        patch('dara.core.telemetry.logfire.instrument_system_metrics'),
        patch('dara.core.telemetry.logfire.shutdown'),
        patch('dara.core.telemetry.LoggingInstrumentor') as logging_instrumentor,
        patch('dara.core.telemetry.SystemMetricsInstrumentor') as system_metrics_instrumentor,
    ):
        logging_instrumentor.return_value.is_instrumented_by_opentelemetry = False
        system_metrics_instrumentor.return_value.is_instrumented_by_opentelemetry = False
        app = _start_test_application()
        async with AsyncClient(app):
            pass

    assert configure.call_args.kwargs['metrics'].views == telemetry._METRIC_VIEWS


async def test_shutdown_preserves_host_owned_global_instrumentors(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv('DARA_OTEL_ENABLED', 'TRUE')
    monkeypatch.setenv('DARA_DISABLE_METRICS', 'TRUE')
    handler = logging.NullHandler()

    with (
        patch('dara.core.telemetry.logfire.configure'),
        patch('dara.core.telemetry.logfire.instrument_fastapi', return_value=MagicMock()),
        patch('dara.core.telemetry.logfire.instrument_system_metrics') as instrument_system_metrics,
        patch('dara.core.telemetry.logfire.shutdown'),
        patch('dara.core.telemetry.LoggingInstrumentor') as logging_instrumentor,
        patch('dara.core.telemetry.SystemMetricsInstrumentor') as system_metrics_instrumentor,
        patch('dara.core.telemetry._SanitizingLoggingHandler', return_value=handler),
    ):
        logging_instrumentor.return_value.is_instrumented_by_opentelemetry = True
        system_metrics_instrumentor.return_value.is_instrumented_by_opentelemetry = True
        app = _start_test_application()
        async with AsyncClient(app):
            assert handler in logging.getLogger().handlers

    assert handler not in logging.getLogger().handlers
    logging_instrumentor.return_value.instrument.assert_not_called()
    logging_instrumentor.return_value.uninstrument.assert_not_called()
    instrument_system_metrics.assert_not_called()
    system_metrics_instrumentor.return_value.uninstrument.assert_not_called()


def test_shutdown_deadline_bounds_application_latency(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv('DARA_OTEL_SHUTDOWN_TIMEOUT_MILLIS', '10')
    get_settings.cache_clear()
    runtime = telemetry._TelemetryRuntime(configured=True)

    with patch('dara.core.telemetry.logfire.shutdown', side_effect=lambda **_kwargs: time.sleep(1)):
        started = time.perf_counter()
        runtime.shutdown()
        elapsed = time.perf_counter() - started

    assert elapsed < 0.2
    assert runtime.configured is False


async def test_failed_app_instrumentation_rolls_back_process_instrumentation(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv('DARA_OTEL_ENABLED', 'TRUE')
    monkeypatch.setenv('DARA_DISABLE_METRICS', 'TRUE')

    with (
        patch('dara.core.telemetry.logfire.configure'),
        patch('dara.core.telemetry.logfire.instrument_fastapi', side_effect=RuntimeError('instrumentation failed')),
        patch('dara.core.telemetry.logfire.instrument_system_metrics'),
        patch('dara.core.telemetry.logfire.shutdown') as shutdown,
        patch('dara.core.telemetry.LoggingInstrumentor') as logging_instrumentor,
        patch('dara.core.telemetry.SystemMetricsInstrumentor') as system_metrics_instrumentor,
        pytest.raises(RuntimeError, match='instrumentation failed'),
    ):
        logging_instrumentor.return_value.is_instrumented_by_opentelemetry = False
        system_metrics_instrumentor.return_value.is_instrumented_by_opentelemetry = False
        _start_test_application()

    system_metrics_instrumentor.return_value.uninstrument.assert_called_once_with()
    logging_instrumentor.return_value.uninstrument.assert_called_once_with()
    shutdown.assert_called_once_with(timeout_millis=5000)


def test_request_attributes_exclude_values_and_error_details():
    rejected_input = {'password': 'secret'}

    assert telemetry._safe_request_attributes(MagicMock(), {'values': rejected_input, 'errors': []}) is None
    assert telemetry._safe_request_attributes(
        MagicMock(),
        {
            'values': rejected_input,
            'errors': [{'input': rejected_input, 'msg': 'invalid password', 'type': 'value_error'}],
        },
    ) == {'fastapi.validation.error_count': 1}


def test_server_request_hook_keeps_path_and_redacts_query_bearing_url_attributes():
    span = MagicMock()
    span.is_recording.return_value = True

    telemetry._redact_server_request(
        span,
        {
            'type': 'http',
            'path': '/items/secret-value',
            'query_string': b'token=secret',
            'client': ('203.0.113.1', 1234),
        },
    )

    assert span.set_attribute.call_args_list == [
        call('url.full', '[REDACTED]'),
        call('http.target', '[REDACTED]'),
        call('http.url', '[REDACTED]'),
        call('url.query', '[REDACTED]'),
    ]

    path_only_span = MagicMock()
    path_only_span.is_recording.return_value = True
    telemetry._redact_server_request(
        path_only_span,
        {
            'type': 'http',
            'path': '/items/visible-value',
            'query_string': b'',
            'client': ('203.0.113.1', 1234),
        },
    )
    path_only_span.set_attribute.assert_not_called()


def test_otel_log_translation_drops_exception_details_and_arbitrary_extras():
    """The OTEL handler sanitizes a copy while leaving console records unchanged."""
    error = RuntimeError('secret exception value')
    record = logging.LogRecord(
        name='dara.test',
        level=logging.ERROR,
        pathname=__file__,
        lineno=1,
        msg={'title': 'Action failed', 'error': error},
        args=(),
        exc_info=(RuntimeError, error, None),
    )
    record.content = {'token': 'secret-token'}
    record.status_code = 500
    record.event_name = 'action.failed'

    translated = telemetry._SanitizingLoggingHandler(log_code_attributes=False)._translate(record)

    assert translated.body == 'action.failed'
    assert dict(translated.attributes or {}) == {'event_name': 'action.failed', 'status_code': 500}
    assert 'secret' not in repr(translated)
    assert record.msg == {'title': 'Action failed', 'error': error}
    assert record.content == {'token': 'secret-token'}

    template_record = logging.LogRecord(
        name='application',
        level=logging.WARNING,
        pathname=__file__,
        lineno=1,
        msg='Worker %s started',
        args=('worker-3',),
        exc_info=None,
    )
    template_log = telemetry._SanitizingLoggingHandler(log_code_attributes=False)._translate(template_record)
    assert template_log.body == 'Worker worker-3 started'


def test_span_exception_callback_keeps_only_error_type():
    """Framework span exceptions retain classification without messages or tracebacks."""
    helper = MagicMock()
    helper.exception = RuntimeError('private failure value')

    telemetry._sanitize_span_exception(helper)

    helper.no_record_exception.assert_called_once_with()
    helper.span.set_attribute.assert_called_once_with('error.type', 'RuntimeError')
    status = helper.span.set_status.call_args.args[0]
    assert status.status_code.name == 'ERROR'
    assert status.description is None


def test_serialized_context_carrier_contains_only_w3c_trace_context():
    """Process carriers exclude baggage that may contain application data."""
    span_context = SpanContext(
        trace_id=1,
        span_id=2,
        is_remote=False,
        trace_flags=TraceFlags.SAMPLED,
        trace_state=TraceState(),
    )
    context = set_span_in_context(NonRecordingSpan(span_context))
    context = baggage.set_baggage('secret', 'private-value', context=context)

    with (
        patch.object(telemetry._RUNTIME, 'configured', True),
        telemetry.use_telemetry_context(context),
    ):
        carrier = telemetry.capture_telemetry_carrier()

    assert carrier is not None
    assert set(carrier) <= {'traceparent', 'tracestate'}
    assert 'private-value' not in repr(carrier)


def test_cache_measurements_are_numeric_and_have_bounded_dimensions():
    """Cache callbacks expose bytes and entry counts without string-formatted values."""
    telemetry.record_cache_store_metrics(1024, 2)
    telemetry.record_registry_cache_metrics('Components', 256, 3)

    sizes = list(telemetry._CACHE_METRIC_VALUES.size_observations(MagicMock()))
    entries = list(telemetry._CACHE_METRIC_VALUES.entry_observations(MagicMock()))

    assert all(isinstance(observation.value, int) for observation in sizes + entries)
    assert {(observation.attributes or {}).get('dara.cache.kind') for observation in sizes} == {
        'store',
        'registry',
        'total',
    }
    registry_size = next(
        observation for observation in sizes if (observation.attributes or {}).get('dara.registry.name') == 'Components'
    )
    assert registry_size.value == 256
    assert set(registry_size.attributes or {}) == {'dara.cache.kind', 'dara.registry.name'}


def test_http_spans_and_native_logs_export_with_correlation():
    environment = os.environ.copy()
    environment.update(
        {
            'DARA_OTEL_ENABLED': 'TRUE',
            'DARA_DISABLE_METRICS': 'TRUE',
            'OTEL_TRACES_EXPORTER': 'none',
            'OTEL_LOGS_EXPORTER': 'none',
            'OTEL_METRICS_EXPORTER': 'none',
        }
    )
    environment.pop('DARA_TEST_FLAG', None)
    smoke_test = Path(__file__).with_name('_telemetry_smoke.py')

    result = subprocess.run(
        [sys.executable, str(smoke_test)],
        capture_output=True,
        check=False,
        env=environment,
        text=True,
        timeout=30,
    )

    assert result.returncode == 0, f'{result.stdout}\n{result.stderr}'


def test_internal_operation_spans_and_metrics_export():
    environment = os.environ.copy()
    environment.update(
        {
            'DARA_OTEL_ENABLED': 'TRUE',
            'DARA_DISABLE_METRICS': 'TRUE',
            'OTEL_TRACES_EXPORTER': 'none',
            'OTEL_LOGS_EXPORTER': 'none',
            'OTEL_METRICS_EXPORTER': 'none',
        }
    )
    smoke_test = Path(__file__).with_name('_telemetry_operations_smoke.py')

    result = subprocess.run(
        [sys.executable, str(smoke_test)],
        capture_output=True,
        check=False,
        env=environment,
        text=True,
        timeout=30,
    )

    assert result.returncode == 0, f'{result.stdout}\n{result.stderr}'


def test_authentication_and_oidc_spans_export_without_sensitive_values():
    environment = os.environ.copy()
    environment.update(
        {
            'DARA_OTEL_ENABLED': 'TRUE',
            'DARA_DISABLE_METRICS': 'TRUE',
            'OTEL_TRACES_EXPORTER': 'none',
            'OTEL_LOGS_EXPORTER': 'none',
            'OTEL_METRICS_EXPORTER': 'none',
        }
    )
    environment.pop('DARA_TEST_FLAG', None)
    smoke_test = Path(__file__).with_name('_telemetry_auth_smoke.py')

    result = subprocess.run(
        [sys.executable, str(smoke_test)],
        capture_output=True,
        check=False,
        env=environment,
        text=True,
        timeout=30,
    )

    assert result.returncode == 0, f'{result.stdout}\n{result.stderr}'


def test_task_and_subprocess_context_propagation():
    environment = os.environ.copy()
    environment.update(
        {
            'DARA_OTEL_ENABLED': 'TRUE',
            'DARA_DISABLE_METRICS': 'TRUE',
            'DARA_POOL_MAX_WORKERS': '1',
            'OTEL_TRACES_EXPORTER': 'none',
            'OTEL_LOGS_EXPORTER': 'none',
            'OTEL_METRICS_EXPORTER': 'none',
        }
    )
    package_root = str(Path(__file__).parents[2])
    environment['PYTHONPATH'] = os.pathsep.join(filter(None, (package_root, environment.get('PYTHONPATH'))))
    smoke_test = Path(__file__).with_name('_telemetry_tasks_smoke.py')

    result = subprocess.run(
        [sys.executable, str(smoke_test)],
        capture_output=True,
        check=False,
        env=environment,
        text=True,
        timeout=45,
    )

    assert result.returncode == 0, f'{result.stdout}\n{result.stderr}'
