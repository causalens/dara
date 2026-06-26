"""
Copyright 2023 Impulse Innovations Limited


Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
"""

import time

from prometheus_client import Counter, Histogram
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

HTTP_REQUESTS_TOTAL = Counter(
    'http_requests_total',
    'Total HTTP requests',
    labelnames=['method', 'status', 'path'],
)

HTTP_REQUEST_DURATION_SECONDS = Histogram(
    'http_request_duration_seconds',
    'HTTP request duration in seconds',
    labelnames=['method', 'status', 'path'],
    buckets=(0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0, float('inf')),
)


class PrometheusMiddleware(BaseHTTPMiddleware):
    """Middleware that records HTTP request count and duration as Prometheus metrics.

    Uses the matched Starlette route pattern (e.g. ``/api/components/{uid}``) for the ``path``
    label to avoid unbounded cardinality from dynamic path segments.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        start = time.monotonic()
        response = await call_next(request)
        duration = time.monotonic() - start

        # Use the matched route pattern to keep label cardinality bounded
        route = request.scope.get('route')
        path = route.path if route is not None and hasattr(route, 'path') else request.url.path

        HTTP_REQUESTS_TOTAL.labels(
            method=request.method,
            status=str(response.status_code),
            path=path,
        ).inc()

        HTTP_REQUEST_DURATION_SECONDS.labels(
            method=request.method,
            status=str(response.status_code),
            path=path,
        ).observe(duration)

        return response
