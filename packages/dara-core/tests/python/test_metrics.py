import os
import subprocess
import sys
from pathlib import Path

from prometheus_client import REGISTRY

from dara.core.metrics import DARA_METRICS_REGISTRY


def test_dara_prometheus_reader_uses_isolated_registry():
    """Dara can serve OTEL metrics without mutating Prometheus's default registry."""
    assert DARA_METRICS_REGISTRY is not REGISTRY
    assert list(DARA_METRICS_REGISTRY.collect()) == []


def test_prometheus_endpoint_exports_otel_metrics_from_a_dara_app():
    """A real Dara app translates its OTEL instruments for the existing scrape endpoint."""
    environment = os.environ.copy()
    environment.update(
        {
            'DARA_TEST_FLAG': 'TRUE',
            'DARA_OTEL_ENABLED': 'TRUE',
            'OTEL_TRACES_EXPORTER': 'none',
            'OTEL_LOGS_EXPORTER': 'none',
            'OTEL_METRICS_EXPORTER': 'prometheus',
        }
    )
    smoke_test = Path(__file__).with_name('_prometheus_metrics_smoke.py')

    result = subprocess.run(
        [sys.executable, str(smoke_test)],
        capture_output=True,
        check=False,
        env=environment,
        text=True,
        timeout=30,
    )

    assert result.returncode == 0, f'{result.stdout}\n{result.stderr}'
