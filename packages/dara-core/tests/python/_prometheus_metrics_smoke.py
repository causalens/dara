"""Prometheus translation smoke test used by test_metrics."""

import anyio
from async_asgi_testclient import TestClient
from prometheus_client import generate_latest

from dara.core import telemetry
from dara.core.configuration import ConfigurationBuilder
from dara.core.main import _start_application
from dara.core.metrics import DARA_METRICS_REGISTRY


async def main() -> None:
    """Exercise OTEL HTTP and cache metrics through a real Dara application."""
    app = _start_application(ConfigurationBuilder()._to_configuration())

    async with TestClient(app) as client:
        response = await client.get('/status')
        assert response.status_code == 200

        with telemetry.observe_action(
            'tests.prometheus_action',
            'request',
            'sync',
            definition_id='prometheus-action',
            instance_id='prometheus-action-instance',
            function_name='prometheus_action',
        ):
            pass

        exposition = generate_latest(DARA_METRICS_REGISTRY).decode()
        assert 'http_server_request_duration_seconds' in exposition, exposition
        assert 'http_server_active_requests' in exposition, exposition
        assert 'dara_action_duration_seconds' in exposition, exposition
        assert 'le="0.005"' in exposition, exposition
        assert 'dara_cache_size_bytes' in exposition, exposition
        assert 'dara_cache_entries' in exposition, exposition
        assert 'dara_process_type="application"' in exposition, exposition


if __name__ == '__main__':
    anyio.run(main)
