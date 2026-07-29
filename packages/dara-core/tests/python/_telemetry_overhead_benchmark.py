"""Measure Dara request overhead for representative telemetry configurations."""

import argparse
import asyncio
import json
import os
import platform
import statistics
import subprocess
import sys
from pathlib import Path
from time import perf_counter_ns
from typing import Any

SCENARIOS = {
    'disabled': {
        'DARA_OTEL_ENABLED': 'FALSE',
        'DARA_DISABLE_METRICS': 'TRUE',
        'OTEL_TRACES_EXPORTER': 'none',
        'OTEL_LOGS_EXPORTER': 'none',
        'OTEL_METRICS_EXPORTER': 'none',
    },
    'prometheus': {
        'DARA_OTEL_ENABLED': 'FALSE',
        'DARA_DISABLE_METRICS': 'FALSE',
        'OTEL_TRACES_EXPORTER': 'none',
        'OTEL_LOGS_EXPORTER': 'none',
        'OTEL_METRICS_EXPORTER': 'none',
    },
    'traces_logs': {
        'DARA_OTEL_ENABLED': 'TRUE',
        'DARA_DISABLE_METRICS': 'TRUE',
        'OTEL_TRACES_EXPORTER': 'none',
        'OTEL_LOGS_EXPORTER': 'none',
        'OTEL_METRICS_EXPORTER': 'none',
    },
    'combined': {
        'DARA_OTEL_ENABLED': 'TRUE',
        'DARA_DISABLE_METRICS': 'FALSE',
        'OTEL_TRACES_EXPORTER': 'none',
        'OTEL_LOGS_EXPORTER': 'none',
        'OTEL_METRICS_EXPORTER': 'none',
    },
}


def _percentile(values: list[int], percentile: float) -> float:
    """Calculate an interpolated percentile from nanosecond observations."""
    ordered = sorted(values)
    position = (len(ordered) - 1) * percentile
    lower_index = int(position)
    upper_index = min(lower_index + 1, len(ordered) - 1)
    fraction = position - lower_index
    return ordered[lower_index] + (ordered[upper_index] - ordered[lower_index]) * fraction


async def _run_worker(warmup: int, requests: int) -> dict[str, float]:
    """Start a real Dara ASGI app and measure complete sequential requests."""
    from async_asgi_testclient import TestClient

    from dara.core.auth import BasicAuthConfig
    from dara.core.configuration import ConfigurationBuilder
    from dara.core.http import get
    from dara.core.main import _start_application

    builder = ConfigurationBuilder()

    @get(url='/benchmark/{item_id}')
    def benchmark_endpoint(item_id: str):
        return {'item_id': item_id, 'ok': True}

    builder.add_endpoint(benchmark_endpoint)
    configuration = builder._to_configuration()
    configuration.auth_config = BasicAuthConfig(username='benchmark', password='benchmark')
    app = _start_application(configuration)
    latencies_ns: list[int] = []

    async with TestClient(app) as client:
        login = await client.post(
            '/api/auth/session',
            json={'username': 'benchmark', 'password': 'benchmark'},
        )
        if login.status_code != 200:
            raise RuntimeError(f'Benchmark login failed with {login.status_code}')

        for _ in range(warmup):
            response = await client.get('/api/benchmark/warmup')
            if response.status_code != 200:
                raise RuntimeError(f'Warmup request failed with {response.status_code}')

        batch_started = perf_counter_ns()
        for index in range(requests):
            request_started = perf_counter_ns()
            response = await client.get(f'/api/benchmark/{index % 10}')
            latencies_ns.append(perf_counter_ns() - request_started)
            if response.status_code != 200:
                raise RuntimeError(f'Benchmark request failed with {response.status_code}')
        batch_elapsed_ns = perf_counter_ns() - batch_started

    return {
        'mean_ms': statistics.fmean(latencies_ns) / 1_000_000,
        'p50_ms': _percentile(latencies_ns, 0.50) / 1_000_000,
        'p95_ms': _percentile(latencies_ns, 0.95) / 1_000_000,
        'p99_ms': _percentile(latencies_ns, 0.99) / 1_000_000,
        'requests_per_second': requests / (batch_elapsed_ns / 1_000_000_000),
    }


def _worker_environment(scenario: str) -> dict[str, str]:
    """Build an isolated environment before Dara or OpenTelemetry is imported."""
    environment = os.environ.copy()
    environment.update(SCENARIOS[scenario])
    environment['DARA_TEST_FLAG'] = 'TRUE'
    environment['PYTHONHASHSEED'] = '0'
    return environment


def _run_subprocess(scenario: str, warmup: int, requests: int) -> dict[str, float]:
    """Execute one benchmark round in a fresh process."""
    command = [
        sys.executable,
        str(Path(__file__).resolve()),
        '--worker',
        '--warmup',
        str(warmup),
        '--requests',
        str(requests),
    ]
    result = subprocess.run(
        command,
        capture_output=True,
        check=False,
        cwd=Path(__file__).parents[2],
        env=_worker_environment(scenario),
        text=True,
        timeout=120,
    )
    if result.returncode != 0:
        raise RuntimeError(f'{scenario} benchmark failed:\n{result.stdout}\n{result.stderr}')

    for line in reversed(result.stdout.splitlines()):
        if line.startswith('DARA_TELEMETRY_BENCHMARK='):
            return json.loads(line.partition('=')[2])
    raise RuntimeError(f'{scenario} benchmark produced no result:\n{result.stdout}\n{result.stderr}')


def _median_summary(rounds: list[dict[str, float]]) -> dict[str, float]:
    """Summarize repeated isolated rounds using their median result."""
    return {
        key: statistics.median(round_result[key] for round_result in rounds)
        for key in ('mean_ms', 'p50_ms', 'p95_ms', 'p99_ms', 'requests_per_second')
    }


def _overhead(summary: dict[str, float], baseline: dict[str, float]) -> dict[str, float]:
    """Calculate absolute and relative p50 overhead against strict-disabled Dara."""
    delta_ms = summary['p50_ms'] - baseline['p50_ms']
    return {
        'p50_delta_ms': delta_ms,
        'p50_delta_percent': delta_ms / baseline['p50_ms'] * 100,
        'throughput_delta_percent': (summary['requests_per_second'] / baseline['requests_per_second'] - 1) * 100,
    }


def _run_controller(warmup: int, requests: int, rounds: int) -> dict[str, Any]:
    """Run scenarios in alternating order to reduce systematic thermal drift."""
    results: dict[str, list[dict[str, float]]] = {scenario: [] for scenario in SCENARIOS}
    scenario_order = list(SCENARIOS)

    for round_index in range(rounds):
        current_order = scenario_order if round_index % 2 == 0 else list(reversed(scenario_order))
        for scenario in current_order:
            round_result = _run_subprocess(scenario, warmup, requests)
            results[scenario].append(round_result)
            print(
                f'round={round_index + 1} scenario={scenario} '
                f'p50={round_result["p50_ms"]:.3f}ms p95={round_result["p95_ms"]:.3f}ms '
                f'rps={round_result["requests_per_second"]:.0f}',
                flush=True,
            )

    summaries = {scenario: _median_summary(values) for scenario, values in results.items()}
    baseline = summaries['disabled']
    return {
        'metadata': {
            'machine': platform.machine(),
            'platform': platform.platform(),
            'python': platform.python_version(),
            'rounds': rounds,
            'warmup_requests_per_round': warmup,
            'measured_requests_per_round': requests,
            'exporters': 'none',
            'transport': 'in-process ASGI',
        },
        'scenarios': {
            scenario: {
                **summary,
                **({} if scenario == 'disabled' else _overhead(summary, baseline)),
            }
            for scenario, summary in summaries.items()
        },
    }


def main() -> None:
    """Run one isolated worker or the repeated benchmark controller."""
    parser = argparse.ArgumentParser()
    parser.add_argument('--worker', action='store_true')
    parser.add_argument('--warmup', type=int, default=300)
    parser.add_argument('--requests', type=int, default=3000)
    parser.add_argument('--rounds', type=int, default=7)
    arguments = parser.parse_args()

    if arguments.worker:
        result = asyncio.run(_run_worker(arguments.warmup, arguments.requests))
        print(f'DARA_TELEMETRY_BENCHMARK={json.dumps(result, sort_keys=True)}')
        return

    result = _run_controller(arguments.warmup, arguments.requests, arguments.rounds)
    print(f'DARA_TELEMETRY_BENCHMARK={json.dumps(result, indent=2, sort_keys=True)}')


if __name__ == '__main__':
    main()
