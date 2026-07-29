"""Isolated end-to-end smoke test for Dara authentication telemetry."""

import os
import sys
import time
from pathlib import Path
from typing import cast
from unittest.mock import MagicMock

import anyio
import httpx
import respx
from async_asgi_testclient import TestClient
from opentelemetry import trace
from opentelemetry.sdk.trace import ReadableSpan, TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from opentelemetry.trace import SpanKind

os.environ.update(
    {
        'DARA_DOCKER_MODE': 'TRUE',
        'JWT_SECRET': 'telemetry-auth-jwt-secret-at-least-32-bytes',
        'SSO_ISSUER_URL': 'http://test-identity-provider.com',
        'SSO_CLIENT_ID': 'telemetry-client',
        'SSO_CLIENT_SECRET': 'telemetry-client-secret',
        'SSO_REDIRECT_URI': 'http://localhost:8000/sso-callback',
        'SSO_GROUPS': 'dev',
        'SSO_USE_USERINFO': 'true',
    }
)
sys.path.insert(0, str(Path(__file__).parents[2]))

from dara.core import telemetry  # noqa: E402
from dara.core.auth.oidc.config import OIDCAuthConfig  # noqa: E402
from dara.core.auth.oidc.definitions import OIDC_LOGIN_SESSION_COOKIE_NAME  # noqa: E402
from dara.core.auth.oidc.settings import get_oidc_settings  # noqa: E402
from dara.core.auth.oidc.transaction_store import oidc_transaction_store  # noqa: E402
from dara.core.auth.session_store import InMemoryAuthSessionBackend  # noqa: E402
from dara.core.configuration import ConfigurationBuilder  # noqa: E402
from dara.core.main import _start_application  # noqa: E402

from tests.python.test_oidc_auth import (  # noqa: E402
    MOCK_DISCOVERY_WITH_USERINFO,
    MOCK_JWKS_DATA,
    make_mock_id_token,
    mocked_urllib,
    start_oidc_login,
)


def _child_span(spans: tuple[ReadableSpan, ...], name: str, parent: ReadableSpan) -> ReadableSpan:
    """Return a named direct child span."""
    assert parent.context is not None
    return next(
        span
        for span in spans
        if span.name == name and span.parent is not None and span.parent.span_id == parent.context.span_id
    )


async def main() -> None:
    """Exercise discovery, callback, userinfo, session verification, and rejection telemetry."""
    get_oidc_settings.cache_clear()
    oidc_transaction_store.clear()

    builder = ConfigurationBuilder()
    auth_config = OIDCAuthConfig()
    builder.add_auth(auth_config)
    builder.auth_session_backend = InMemoryAuthSessionBackend()
    app = _start_application(builder._to_configuration())

    span_exporter = InMemorySpanExporter()
    cast(TracerProvider, trace.get_tracer_provider()).add_span_processor(SimpleSpanProcessor(span_exporter))

    telemetry._AUTH_ACTIVE = MagicMock()
    telemetry._AUTH_DURATION = MagicMock()
    telemetry._AUTH_EXECUTIONS = MagicMock()

    discovery_url = f'{os.environ["SSO_ISSUER_URL"]}/.well-known/openid-configuration'
    with respx.mock, mocked_urllib(MOCK_JWKS_DATA):
        respx.get(discovery_url).mock(
            return_value=httpx.Response(status_code=200, json=MOCK_DISCOVERY_WITH_USERINFO.model_dump())
        )
        token_route = respx.post(MOCK_DISCOVERY_WITH_USERINFO.token_endpoint)
        userinfo_route = respx.get(MOCK_DISCOVERY_WITH_USERINFO.userinfo_endpoint)

        async with TestClient(app) as client:
            state = await start_oidc_login(client, redirect_to='/after-login')
            transaction = oidc_transaction_store.get(state)
            assert transaction is not None

            private_identity = 'private-identity-value'
            private_email = 'private-email@example.com'
            initial_id_token = make_mock_id_token(
                state,
                {
                    'sub': private_identity,
                    'exp': int(time.time()) + 2,
                    'identity': {
                        'id': private_identity,
                        'name': 'Private User Name',
                        'email': private_email,
                    },
                },
            )
            refreshed_id_token = make_mock_id_token(
                state,
                {
                    'sub': private_identity,
                    'exp': int(time.time()) + 3600,
                    'identity': {
                        'id': private_identity,
                        'name': 'Private User Name',
                        'email': private_email,
                    },
                },
            )

            def token_response(request: httpx.Request) -> httpx.Response:
                if b'grant_type=refresh_token' in request.content:
                    return httpx.Response(
                        status_code=200,
                        json={
                            'id_token': refreshed_id_token,
                            'access_token': 'private-refreshed-access-token',
                            'refresh_token': 'private-rotated-refresh-token',
                        },
                    )
                return httpx.Response(
                    status_code=200,
                    json={
                        'id_token': initial_id_token,
                        'access_token': 'private-access-token',
                        'refresh_token': 'private-refresh-token',
                    },
                )

            token_route.mock(side_effect=token_response)
            userinfo_route.mock(
                return_value=httpx.Response(
                    status_code=200,
                    json={
                        'sub': private_identity,
                        'name': 'Private User Name',
                        'email': private_email,
                        'groups': ['dev'],
                    },
                )
            )

            callback = await client.post(
                '/api/auth/sso-callback',
                json={'auth_code': 'private-authorization-code', 'state': state},
            )
            assert callback.status_code == 200, callback.text

            verify = await client.post('/api/auth/verify-session')
            assert verify.status_code == 200, verify.text

            await anyio.sleep(2.2)
            refreshed_verify = await client.post('/api/auth/verify-session')
            assert refreshed_verify.status_code == 200, refreshed_verify.text

            rejected_state = await start_oidc_login(client)
            rejected = await client.post(
                '/api/auth/sso-callback',
                json={'auth_code': 'private-rejected-code', 'state': f'{rejected_state}-invalid'},
            )
            assert rejected.status_code == 400, rejected.text
            assert OIDC_LOGIN_SESSION_COOKIE_NAME in client.cookie_jar

    spans = span_exporter.get_finished_spans()

    startup_span = next(span for span in spans if span.name == 'dara.auth.oidc.startup')
    discovery_attempt = _child_span(spans, 'dara.auth.oidc.discovery.attempt', startup_span)
    discovery_clients = [
        span
        for span in spans
        if span.kind == SpanKind.CLIENT
        and span.parent is not None
        and discovery_attempt.context is not None
        and span.parent.span_id == discovery_attempt.context.span_id
    ]
    assert len(discovery_clients) == 1

    login_span = next(span for span in spans if span.name == 'dara.auth.login.initiate')
    assert login_span.attributes is not None
    assert login_span.attributes['dara.auth.system'] == 'oidc'
    assert login_span.attributes['dara.auth.credential.source'] == 'none'
    login_http_span = next(span for span in spans if span.name == 'POST /api/auth/session')
    assert login_span.parent is not None
    assert login_http_span.context is not None
    assert login_span.parent.span_id == login_http_span.context.span_id

    callback_span = next(
        span
        for span in spans
        if span.name == 'dara.auth.oidc.callback'
        and span.attributes is not None
        and span.attributes.get('dara.outcome') == 'success'
    )
    token_exchange = _child_span(spans, 'dara.auth.oidc.token_exchange', callback_span)
    id_token_verify = _child_span(spans, 'dara.auth.oidc.id_token.verify', callback_span)
    userinfo = _child_span(spans, 'dara.auth.oidc.userinfo', callback_span)
    access_verify = _child_span(spans, 'dara.auth.access.verify', callback_span)
    session_create = _child_span(spans, 'dara.auth.session_store.create', callback_span)
    assert access_verify.attributes is not None
    assert session_create.attributes is not None

    token_clients = [
        span
        for span in spans
        if span.kind == SpanKind.CLIENT
        and span.parent is not None
        and token_exchange.context is not None
        and span.parent.span_id == token_exchange.context.span_id
    ]
    assert len(token_clients) == 1
    userinfo_clients = [
        span
        for span in spans
        if span.kind == SpanKind.CLIENT
        and span.parent is not None
        and userinfo.context is not None
        and span.parent.span_id == userinfo.context.span_id
    ]
    assert len(userinfo_clients) == 1

    jwks_fetch = _child_span(spans, 'dara.auth.oidc.jwks.fetch', id_token_verify)
    assert jwks_fetch.kind == SpanKind.CLIENT
    assert id_token_verify.attributes is not None
    assert id_token_verify.attributes['dara.auth.oidc.jwks.cache.result'] == 'miss'

    verify_spans = [span for span in spans if span.name == 'dara.auth.session.verify']
    verify_span = verify_spans[0]
    assert verify_span.attributes is not None
    assert verify_span.attributes['dara.auth.credential.source'] == 'cookie'
    verify_store = _child_span(spans, 'dara.auth.session_store.get', verify_span)
    assert verify_store.attributes is not None
    assert verify_store.attributes['dara.auth.session_store.result'] == 'active'

    refresh_span = next(span for span in spans if span.name == 'dara.auth.session.refresh')
    assert refresh_span.attributes is not None
    assert refresh_span.attributes['dara.outcome'] == 'success'
    refresh_parent = next(
        span
        for span in verify_spans
        if span.context is not None
        and refresh_span.parent is not None
        and refresh_span.parent.span_id == span.context.span_id
    )
    assert refresh_parent.attributes is not None
    refresh_phase_names = {
        span.name
        for span in spans
        if span.parent is not None
        and refresh_span.context is not None
        and span.parent.span_id == refresh_span.context.span_id
    }
    assert {
        'dara.auth.session_store.get',
        'dara.auth.refresh.cache_lookup',
        'dara.auth.refresh.lock_wait',
        'dara.auth.refresh.provider',
        'dara.auth.token.verify',
        'dara.auth.session_store.set',
    }.issubset(refresh_phase_names)
    id_token_verify_spans = [span for span in spans if span.name == 'dara.auth.oidc.id_token.verify']
    assert {
        span.attributes.get('dara.auth.oidc.jwks.cache.result')
        for span in id_token_verify_spans
        if span.attributes is not None
    } == {'hit', 'miss'}

    rejected_callback = next(
        span
        for span in spans
        if span.name == 'dara.auth.oidc.callback'
        and span.attributes is not None
        and span.attributes.get('dara.outcome') == 'denied'
    )
    rejected_state_span = _child_span(spans, 'dara.auth.oidc.state.validate', rejected_callback)
    assert rejected_state_span.attributes is not None
    assert rejected_state_span.attributes['dara.auth.failure.reason'] == 'invalid_state'
    assert not rejected_state_span.events
    assert rejected_state_span.status.description is None

    private_values = (
        state,
        transaction.nonce,
        initial_id_token,
        refreshed_id_token,
        'private-authorization-code',
        'private-rejected-code',
        'private-access-token',
        'private-refreshed-access-token',
        'private-refresh-token',
        'private-rotated-refresh-token',
        private_identity,
        private_email,
        'Private User Name',
    )
    exported = repr(spans)
    assert all(value not in exported for value in private_values)
    assert all(not span.events for span in spans if span.name.startswith('dara.auth.'))
    assert all(span.status.description is None for span in spans if span.name.startswith('dara.auth.'))

    auth_metric_attributes = [
        call.args[1] for call in telemetry._AUTH_DURATION.record.call_args_list if len(call.args) > 1
    ]
    assert auth_metric_attributes
    assert all(
        set(attributes).issubset({'dara.auth.operation', 'dara.auth.system', 'dara.outcome'})
        for attributes in auth_metric_attributes
    )


if __name__ == '__main__':
    anyio.run(main)
