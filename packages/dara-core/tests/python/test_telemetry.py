import os
import subprocess
import sys
from pathlib import Path
from unittest.mock import MagicMock, call, patch

import pytest
from async_asgi_testclient import TestClient as AsyncClient

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
        app = _start_test_application()
        async with AsyncClient(app):
            instrumentation.__exit__.assert_not_called()

    configure.assert_called_once_with(
        send_to_logfire=False,
        console=False,
        resource_attributes={
            'process.pid': os.getpid(),
            'dara.process.type': 'application',
        },
    )
    logging_instrumentor.return_value.instrument.assert_called_once_with(
        inject_trace_context=True,
        log_code_attributes=True,
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
    shutdown.assert_called_once_with()
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
        patch('dara.core.telemetry.LoggingInstrumentor'),
        patch('dara.core.telemetry.SystemMetricsInstrumentor'),
    ):
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
        patch('dara.core.telemetry.SystemMetricsInstrumentor'),
    ):
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
    }
    metrics_options = configure_options['metrics']
    assert metrics_options.additional_readers == [prometheus_reader]
    assert metrics_options.views == telemetry._PROMETHEUS_METRIC_VIEWS
    instrument_system_metrics.assert_called_once_with()
    logging_instrumentor.return_value.instrument.assert_called_once_with(
        inject_trace_context=True,
        log_code_attributes=True,
    )
    assert os.environ['OTEL_METRICS_EXPORTER'] == 'none'


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
        _start_test_application()

    system_metrics_instrumentor.return_value.uninstrument.assert_called_once_with()
    logging_instrumentor.return_value.uninstrument.assert_called_once_with()
    shutdown.assert_called_once_with()


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


def test_server_request_hook_redacts_query_and_client_address():
    span = MagicMock()
    span.is_recording.return_value = True

    telemetry._redact_server_request(
        span,
        {
            'type': 'http',
            'query_string': b'token=secret',
            'client': ('203.0.113.1', 1234),
        },
    )

    assert span.set_attribute.call_args_list == [
        call('url.query', '[REDACTED]'),
        call('client.address', '[REDACTED]'),
        call('client.port', 0),
    ]


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
            'OTEL_TRACES_EXPORTER': 'none',
            'OTEL_LOGS_EXPORTER': 'none',
            'OTEL_METRICS_EXPORTER': 'none',
        }
    )
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


def test_task_and_subprocess_context_propagation():
    environment = os.environ.copy()
    environment.update(
        {
            'DARA_OTEL_ENABLED': 'TRUE',
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
