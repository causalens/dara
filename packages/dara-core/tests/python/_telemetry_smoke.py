"""Isolated end-to-end telemetry smoke test used by test_telemetry."""

import json
import logging
from typing import Any, cast
from unittest.mock import MagicMock
from uuid import uuid4

import anyio
from async_asgi_testclient import TestClient
from opentelemetry import trace
from opentelemetry._logs import get_logger_provider
from opentelemetry.sdk._logs.export import InMemoryLogRecordExporter, SimpleLogRecordProcessor
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from dara.core import DerivedVariable, Variable, action, telemetry
from dara.core.auth import BasicAuthConfig
from dara.core.configuration import ConfigurationBuilder
from dara.core.http import get
from dara.core.interactivity.actions import ActionCtx
from dara.core.internal.execute_action import execute_action_sync
from dara.core.internal.registries import action_registry, static_kwargs_registry, utils_registry
from dara.core.logging import http_logger
from dara.core.main import _start_application
from dara.core.visual.components import RawString


class _Unserializable:
    """Value that FastAPI's encoder cannot coerce to JSON."""

    __slots__ = ()


class _FakeScheduledProcess:
    """Minimal process handle used to exercise application-owned scheduler cleanup."""

    def join(self, _timeout: float) -> None:
        """Simulate an already-stopped process."""

    def is_alive(self) -> bool:
        """Report that no process termination is required."""
        return False


class _FakeScheduledJob:
    """Scheduled job factory that avoids spawning a subprocess in this smoke test."""

    def do(self, _func, _args):
        """Return a process-compatible handle."""
        return _FakeScheduledProcess()


async def main() -> None:
    """Exercise real Dara HTTP, action, and WebSocket telemetry."""
    builder = ConfigurationBuilder()
    result = Variable('initial')
    unserializable_derived = DerivedVariable(
        lambda _value: _Unserializable(),
        variables=[result],
        cache=None,
    )
    error_handled = anyio.Event()

    @get(url='/health')
    def health(token: str):
        logging.getLogger('dara.telemetry-smoke').warning('correlated smoke log')
        return {'ok': True}

    @get(url='/items/{item_id}')
    def item(item_id: str):
        return {'item': item_id}

    @action
    async def traced_action(ctx: ActionCtx):
        await ctx.update(result, 'complete')

    @action
    async def failed_action(_ctx: ActionCtx):
        raise RuntimeError('secret-action-value')

    @action
    async def sync_action(ctx: ActionCtx):
        await ctx.update(result, 'sync complete')

    sync_action_instance = sync_action()

    @get(url='/sync-action')
    async def run_sync_action():
        return await execute_action_sync(
            action_def=action_registry.get(sync_action_instance.definition_uid),
            inp=None,
            values={},
            static_kwargs=static_kwargs_registry.get(sync_action_instance.uid),
            store=utils_registry.get('Store'),
            task_mgr=utils_registry.get('TaskManager'),
        )

    def sync_handler(_channel: str, data: str):
        return {'handler': 'sync', 'data': data}

    async def async_handler(_channel: str, data: str):
        await anyio.sleep(0)
        return {'handler': 'async', 'data': data}

    async def error_handler(_channel: str, _data: str):
        error_handled.set()
        raise RuntimeError('expected handler failure')

    builder.add_endpoint(health)
    builder.add_endpoint(item)
    builder.add_endpoint(run_sync_action)
    builder.add_ws_handler('sync', sync_handler)
    builder.add_ws_handler('async', async_handler)
    builder.add_ws_handler('error', error_handler)
    builder.router.add_page(
        path='telemetry-page',
        content=RawString(content='Telemetry page'),
        id='telemetry-page',
        name='Telemetry Page',
    )
    action_instance = traced_action()
    failed_action_instance = failed_action()

    def lifecycle_cleanup():
        raise RuntimeError('private-lifecycle-error')

    async def lifecycle_startup():
        await anyio.sleep(0)
        return lifecycle_cleanup

    def scheduled_target():
        return None

    auth = BasicAuthConfig(username='test', password='test')
    config = builder._to_configuration()
    config.auth_config = auth
    config.startup_functions.append(lifecycle_startup)
    config.scheduled_jobs.append((cast(Any, _FakeScheduledJob()), scheduled_target, []))
    app = _start_application(config)
    http_logger._logger.setLevel(logging.INFO)

    span_exporter = InMemorySpanExporter()
    trace.get_tracer_provider().add_span_processor(SimpleSpanProcessor(span_exporter))

    log_exporter = InMemoryLogRecordExporter()
    get_logger_provider().add_log_record_processor(SimpleLogRecordProcessor(log_exporter))

    telemetry._ACTION_ACTIVE = MagicMock()
    telemetry._ACTION_DURATION = MagicMock()
    telemetry._ACTION_EXECUTIONS = MagicMock()
    telemetry._WEBSOCKET_MESSAGE_ACTIVE = MagicMock()
    telemetry._WEBSOCKET_MESSAGE_DURATION = MagicMock()
    telemetry._WEBSOCKET_MESSAGE_EXECUTIONS = MagicMock()

    async with TestClient(app) as client:
        login = await client.post('/api/auth/session', json={'username': 'test', 'password': 'test'})
        assert login.status_code == 200, login.text

        response = await client.get('/api/health?token=secret')
        assert response.status_code == 200, response.text

        path_response = await client.get('/api/items/secret-value')
        assert path_response.status_code == 200, path_response.text

        route_response = await client.post(
            '/api/core/route/telemetry-page',
            json={
                'action_payloads': [],
                'derived_variable_payloads': [
                    {
                        'uid': unserializable_derived.uid,
                        'values': {
                            'data': ['initial'],
                            'lookup': {},
                        },
                    }
                ],
                'py_component_payloads': [],
                'ws_channel': 'telemetry-route-channel',
                'params': {'customer_id': 'not-exported'},
            },
        )
        assert route_response.status_code == 200, route_response.text
        route_chunks = [json.loads(line) for line in route_response.text.splitlines()]
        derived_chunk = next(chunk for chunk in route_chunks if chunk['type'] == 'derived_variable')
        assert derived_chunk['result']['ok'] is False

        sync_action_response = await client.get('/api/sync-action')
        assert sync_action_response.status_code == 200, sync_action_response.text

        async with client.websocket_connect('/api/core/ws') as websocket:
            init_message = await websocket.receive_json()
            channel = init_message['message']['channel']

            # Heartbeats are deliberately not instrumented as message operations.
            await websocket.send_json({'type': 'ping', 'message': None})
            assert await websocket.receive_json() == {'type': 'pong', 'message': None}

            execution_id = str(uuid4())
            action_response = await client.post(
                f'/api/core/action/{action_instance.definition_uid}',
                json={
                    'values': {'data': {}, 'lookup': {}},
                    'input': None,
                    'ws_channel': channel,
                    'uid': action_instance.uid,
                    'execution_id': execution_id,
                },
            )
            assert action_response.status_code == 200, action_response.text

            while True:
                action_message = await websocket.receive_json()
                payload = action_message.get('message', {})
                if payload.get('uid') == execution_id:
                    assert action_message['__typename'] == 'ActionMessage'
                    if payload.get('action', 'missing') is None:
                        break

            failed_execution_id = str(uuid4())
            failed_action_response = await client.post(
                f'/api/core/action/{failed_action_instance.definition_uid}',
                json={
                    'values': {'data': {}, 'lookup': {}},
                    'input': None,
                    'ws_channel': channel,
                    'uid': failed_action_instance.uid,
                    'execution_id': failed_execution_id,
                },
            )
            assert failed_action_response.status_code == 200, failed_action_response.text

            while True:
                action_message = await websocket.receive_json()
                payload = action_message.get('message', {})
                if payload.get('uid') == failed_execution_id:
                    assert action_message['__typename'] == 'ActionMessage'
                    if payload.get('action', 'missing') is None:
                        break

            for handler_kind in ('sync', 'async'):
                await websocket.send_json(
                    {
                        'type': 'custom',
                        'message': {'kind': handler_kind, 'data': 'input', '__rchan': handler_kind},
                    }
                )
                handler_response = await websocket.receive_json()
                assert handler_response['message']['data'] == {'handler': handler_kind, 'data': 'input'}

            await websocket.send_json(
                {
                    'type': 'custom',
                    'message': {'kind': 'error', 'data': 'input'},
                }
            )
            with anyio.fail_after(1):
                await error_handled.wait()
            await anyio.sleep(0)

            await websocket.send_json(
                {
                    'type': 'custom',
                    'message': {'kind': 'missing-handler', 'data': 'input'},
                }
            )
            await anyio.sleep(0)

    spans = span_exporter.get_finished_spans()

    startup_span = next(span for span in spans if span.name == 'dara.application.startup')
    shutdown_span = next(span for span in spans if span.name == 'dara.application.shutdown')
    assert startup_span.parent is None
    assert shutdown_span.parent is None
    assert startup_span.context is not None
    assert shutdown_span.context is not None

    startup_children = [
        span for span in spans if span.parent is not None and span.parent.span_id == startup_span.context.span_id
    ]
    assert {
        'dara.application.auth_session_backend.initialize',
        'dara.application.runtime.initialize',
        'dara.application.signal_handlers.setup',
        'dara.application.startup_hook',
    }.issubset({span.name for span in startup_children})
    auth_backend_span = next(
        span for span in startup_children if span.name == 'dara.application.auth_session_backend.initialize'
    )
    assert auth_backend_span.attributes is not None
    assert auth_backend_span.attributes['dara.internal.name'] == 'InMemoryAuthSessionBackend'
    custom_startup_span = next(
        span
        for span in startup_children
        if span.name == 'dara.application.startup_hook'
        and span.attributes is not None
        and str(span.attributes.get('dara.internal.name', '')).endswith('.lifecycle_startup')
    )
    assert custom_startup_span.attributes['dara.outcome'] == 'success'
    scheduled_start_span = next(
        span
        for span in startup_children
        if span.name == 'dara.application.scheduled_job.start'
        and span.attributes is not None
        and str(span.attributes.get('dara.internal.name', '')).endswith('.scheduled_target')
    )
    assert scheduled_start_span.attributes['dara.outcome'] == 'success'

    shutdown_children = [
        span for span in spans if span.parent is not None and span.parent.span_id == shutdown_span.context.span_id
    ]
    assert 'dara.application.tasks.cancel' in {span.name for span in shutdown_children}
    cleanup_span = next(
        span
        for span in shutdown_children
        if span.name == 'dara.application.cleanup_hook'
        and span.attributes is not None
        and str(span.attributes.get('dara.internal.name', '')).endswith('.lifecycle_cleanup')
    )
    assert cleanup_span.attributes['dara.outcome'] == 'error'
    assert cleanup_span.attributes['error.type'] == 'RuntimeError'
    assert cleanup_span.status.description is None
    assert not cleanup_span.events
    assert 'private-lifecycle-error' not in repr(cleanup_span)
    scheduled_stop_span = next(
        span
        for span in shutdown_children
        if span.name == 'dara.application.scheduled_job.stop'
        and span.attributes is not None
        and str(span.attributes.get('dara.internal.name', '')).endswith('.scheduled_target')
    )
    assert scheduled_stop_span.attributes['dara.outcome'] == 'success'

    health_span = next(span for span in spans if span.name == 'GET /api/health')
    correlated_log = next(
        item for item in log_exporter.get_finished_logs() if item.log_record.body == 'correlated smoke log'
    )
    assert correlated_log.log_record.trace_id == health_span.context.trace_id
    assert correlated_log.log_record.span_id == health_span.context.span_id
    assert health_span.attributes is not None
    assert health_span.attributes['url.query'] == '[REDACTED]'
    assert 'secret' not in repr(health_span.attributes)

    item_span = next(span for span in spans if span.name == 'GET /api/items/{item_id}')
    assert item_span.attributes is not None
    assert item_span.attributes['url.path'] == '/api/items/secret-value'

    route_span = next(span for span in spans if span.name == 'POST /api/core/route/{route_id}')
    assert route_span.attributes is not None
    assert route_span.attributes['dara.route.id'] == 'telemetry-page'
    assert route_span.attributes['dara.route.name'] == 'Telemetry Page'
    assert route_span.attributes['dara.route.path'] == '/telemetry-page'
    assert 'not-exported' not in repr(route_span.attributes)

    loader_stream_span = next(span for span in spans if span.name == 'dara.route_loader.stream')
    assert loader_stream_span.parent is not None
    assert loader_stream_span.parent.span_id == route_span.context.span_id
    assert loader_stream_span.attributes is not None
    assert loader_stream_span.attributes['dara.route_loader.derived_variable.count'] == 1
    assert loader_stream_span.attributes['dara.route_loader.py_component.count'] == 0
    assert loader_stream_span.attributes['dara.outcome'] == 'success'

    failed_serialization_span = next(
        span
        for span in spans
        if span.name == 'dara.route_loader.serialize'
        and span.attributes is not None
        and span.attributes.get('dara.internal.name') == 'derived_variable'
    )
    assert failed_serialization_span.attributes['dara.outcome'] == 'error'
    assert failed_serialization_span.attributes['error.type'] == 'UnserializablePayloadError'
    assert failed_serialization_span.status.description is None
    assert not failed_serialization_span.events

    loader_encode_spans = [span for span in spans if span.name == 'dara.route_loader.encode']
    assert {
        span.attributes.get('dara.internal.name') for span in loader_encode_spans if span.attributes is not None
    } == {'actions', 'preload', 'template'}

    action_spans = [span for span in spans if span.name == 'dara.action.execute']
    action_span = next(
        span
        for span in action_spans
        if span.attributes is not None and span.attributes['dara.action.name'].endswith('.traced_action')
    )
    action_http_span = next(span for span in spans if span.name == 'POST /api/core/action/{uid}')
    assert action_span.parent is not None
    assert action_span.parent.span_id == action_http_span.context.span_id
    assert action_span.attributes is not None
    assert action_span.attributes['dara.action.delivery'] == 'stream'
    assert action_span.attributes['dara.action.handler.type'] == 'async'
    assert action_span.attributes['dara.action.name'].endswith('.traced_action')
    assert action_span.attributes['dara.action.function.name'] == 'traced_action'
    assert action_span.attributes['dara.action.function.identity'].endswith('.traced_action')
    assert action_span.attributes['dara.action.definition.id'] == action_instance.definition_uid
    assert action_span.attributes['dara.action.instance.id'] == action_instance.uid
    assert action_span.attributes['dara.outcome'] == 'success'

    sync_action_span = next(
        span
        for span in action_spans
        if span.attributes is not None and span.attributes['dara.action.name'].endswith('.sync_action')
    )
    sync_action_http_span = next(span for span in spans if span.name == 'GET /api/sync-action')
    assert sync_action_span.parent is not None
    assert sync_action_span.parent.span_id == sync_action_http_span.context.span_id
    assert sync_action_span.attributes is not None
    assert sync_action_span.attributes['dara.action.delivery'] == 'request'
    assert sync_action_span.attributes['dara.action.handler.type'] == 'async'
    assert sync_action_span.attributes['dara.action.function.name'] == 'sync_action'
    assert sync_action_span.attributes['dara.action.definition.id'] == sync_action_instance.definition_uid
    assert sync_action_span.attributes['dara.outcome'] == 'success'

    failed_action_span = next(
        span
        for span in action_spans
        if span.attributes is not None and span.attributes['dara.action.name'].endswith('.failed_action')
    )
    assert failed_action_span.attributes is not None
    assert failed_action_span.attributes['dara.action.function.name'] == 'failed_action'
    assert failed_action_span.attributes['dara.action.definition.id'] == failed_action_instance.definition_uid
    assert failed_action_span.attributes['dara.action.instance.id'] == failed_action_instance.uid
    assert failed_action_span.attributes['dara.outcome'] == 'error'
    assert failed_action_span.attributes['error.type'] == 'RuntimeError'
    assert failed_action_span.status.description is None
    assert not failed_action_span.events
    assert 'secret-action-value' not in repr(failed_action_span)

    action_sends = [
        span
        for span in spans
        if span.name == 'dara.websocket.message.outbound'
        and span.attributes is not None
        and span.attributes.get('dara.websocket.message.type') == 'message'
        and span.parent is not None
        and span.parent.span_id == action_span.context.span_id
    ]
    assert {
        span.attributes.get('dara.websocket.message.payload.type')
        for span in action_sends
        if span.attributes is not None
    } == {
        'ActionComplete',
        'BatchEnd',
        'BatchStart',
        'UpdateVariable',
    }

    init_span = next(
        span
        for span in spans
        if span.name == 'dara.websocket.message.outbound'
        and span.attributes is not None
        and span.attributes.get('dara.websocket.message.type') == 'init'
    )
    assert init_span.attributes['dara.websocket.message.payload.type'] == 'Init'

    handler_spans = [span for span in spans if span.name == 'dara.websocket.handler.execute']
    assert {span.attributes.get('dara.websocket.handler.execution') for span in handler_spans if span.attributes} == {
        'sync',
        'async',
    }

    error_span = next(
        span
        for span in handler_spans
        if span.attributes is not None and span.attributes.get('dara.websocket.handler.kind') == 'error'
    )
    assert error_span.attributes is not None
    assert error_span.attributes['dara.outcome'] == 'error'

    for handler_kind in ('sync', 'async'):
        handler_span = next(
            span
            for span in handler_spans
            if span.attributes is not None and span.attributes.get('dara.websocket.handler.kind') == handler_kind
        )
        response_span = next(
            span
            for span in spans
            if span.name == 'dara.websocket.message.outbound'
            and span.attributes is not None
            and span.attributes.get('dara.websocket.message.type') == 'custom'
            and span.parent is not None
            and span.parent.span_id == handler_span.context.span_id
        )
        assert response_span.context.is_valid
        assert response_span.attributes['dara.websocket.message.payload.type'] == handler_kind

    inbound_message_spans = [span for span in spans if span.name == 'dara.websocket.message.inbound']
    assert len(inbound_message_spans) == 4
    missing_handler_span = next(
        span
        for span in inbound_message_spans
        if span.attributes is not None and span.attributes.get('error.type') == 'KeyError'
    )
    assert missing_handler_span.attributes['dara.outcome'] == 'error'

    action_metric_attributes = [
        call.args[1] for call in telemetry._ACTION_DURATION.record.call_args_list if len(call.args) > 1
    ]
    assert {attributes['dara.outcome'] for attributes in action_metric_attributes} == {'success', 'error'}
    assert {attributes['dara.action.delivery'] for attributes in action_metric_attributes} == {'request', 'stream'}
    assert {attributes['dara.action.handler.type'] for attributes in action_metric_attributes} == {'async'}
    assert all(
        set(attributes)
        == {
            'dara.action.name',
            'dara.action.delivery',
            'dara.action.handler.type',
            'dara.outcome',
        }
        for attributes in action_metric_attributes
    )

    websocket_metric_attributes = [
        call.args[1] for call in telemetry._WEBSOCKET_MESSAGE_DURATION.record.call_args_list if len(call.args) > 1
    ]
    assert {attributes['dara.outcome'] for attributes in websocket_metric_attributes} == {'success', 'error'}
    assert all('dara.websocket.handler.kind' not in attributes for attributes in websocket_metric_attributes)
    assert all('dara.websocket.message.payload.type' not in attributes for attributes in websocket_metric_attributes)
    exported_logs = log_exporter.get_finished_logs()
    assert all('secret-action-value' not in repr(item) for item in exported_logs)
    assert all('private-lifecycle-error' not in repr(item) for item in exported_logs)
    assert all('secret-value' not in repr(item) for item in exported_logs)
    assert all('203.0.113.' not in repr(item) for item in exported_logs)
    exported_log_bodies = {item.log_record.body for item in exported_logs}
    assert 'http.response.sent' in exported_log_bodies
    assert 'action.execution.error' in exported_log_bodies


if __name__ == '__main__':
    anyio.run(main)
