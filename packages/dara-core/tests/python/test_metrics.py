import subprocess
import sys

from prometheus_client import REGISTRY

from dara.core.metrics import DARA_METRICS_REGISTRY

DARA_METRIC_NAMES = {
    'cache_size',
    'dv_runtimes',
    'http_request_duration_seconds',
    'http_requests',
    'task_runtimes',
}


def _metric_names(registry) -> set[str]:
    return {metric.name for metric in registry.collect()}


def test_dara_metrics_use_isolated_registry():
    """Dara metrics are available without being added to Prometheus's default registry."""
    assert _metric_names(DARA_METRICS_REGISTRY) >= DARA_METRIC_NAMES
    assert DARA_METRIC_NAMES.isdisjoint(_metric_names(REGISTRY))


def test_dara_import_allows_matching_metrics_in_default_registry():
    """Applications can own metric names that match Dara's without causing import failures."""
    result = subprocess.run(
        [
            sys.executable,
            '-c',
            """
from prometheus_client import Counter, Histogram, Info

Counter('http_requests_total', 'Application request count')
Histogram('http_request_duration_seconds', 'Application request duration')
Info('cache_size', 'Application cache size')
Histogram('task_runtimes', 'Application task runtimes')
Histogram('dv_runtimes', 'Application derived variable runtimes')

import dara.core
""",
        ],
        capture_output=True,
        check=False,
        text=True,
    )

    assert result.returncode == 0, result.stderr
