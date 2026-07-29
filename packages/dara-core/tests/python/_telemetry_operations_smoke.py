"""End-to-end smoke test for Dara internal-operation telemetry."""

import asyncio
import contextlib
import io
from typing import cast
from unittest.mock import MagicMock

import anyio
from async_asgi_testclient import TestClient
from fastapi import UploadFile
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

from dara.core import DerivedVariable, StreamEvent, Variable, telemetry
from dara.core.auth import BasicAuthConfig
from dara.core.configuration import ConfigurationBuilder
from dara.core.definitions import PyComponentDef
from dara.core.http import get
from dara.core.interactivity.stream_variable import StreamVariableRegistryEntry, run_stream
from dara.core.interactivity.tabular_variable import upload
from dara.core.internal.registries import derived_variable_registry, utils_registry
from dara.core.main import _start_application
from dara.core.persistence import BackendStore, InMemoryBackend
from dara.core.visual.dynamic_component import CURRENT_COMPONENT_ID, render_component


def _mock_operation_metrics() -> None:
    """Replace internal-operation instruments so metric dimensions can be asserted."""
    for name in (
        '_DERIVED_VARIABLE_ACTIVE',
        '_DERIVED_VARIABLE_DURATION',
        '_DERIVED_VARIABLE_EXECUTIONS',
        '_DERIVED_VARIABLE_CACHE_ACCESSES',
        '_PY_COMPONENT_ACTIVE',
        '_PY_COMPONENT_DURATION',
        '_PY_COMPONENT_EXECUTIONS',
        '_STREAM_ACTIVE',
        '_STREAM_DURATION',
        '_STREAM_EXECUTIONS',
        '_UPLOAD_ACTIVE',
        '_UPLOAD_DURATION',
        '_UPLOAD_EXECUTIONS',
        '_BACKEND_STORE_ACTIVE',
        '_BACKEND_STORE_DURATION',
        '_BACKEND_STORE_EXECUTIONS',
    ):
        setattr(telemetry, name, MagicMock())


async def main() -> None:
    """Exercise internal-operation telemetry through a real Dara application."""
    builder = ConfigurationBuilder()
    input_value = Variable(1)

    def successful_resolver(value: int):
        return value + 1

    def failed_resolver(_value: int):
        raise RuntimeError('expected derived-variable failure')

    successful_derived = DerivedVariable(successful_resolver, variables=[input_value])
    failed_derived = DerivedVariable(failed_resolver, variables=[input_value], cache=None)

    def component_renderer(value: str):
        return value

    component_definition = PyComponentDef(
        func=component_renderer,
        name='telemetry-component',
        render_component=render_component,
    )

    async def successful_stream():
        yield StreamEvent.json_snapshot({'ready': True})

    async def cancellable_stream():
        await anyio.sleep_forever()
        yield StreamEvent.json_snapshot({'unreachable': True})

    successful_stream_entry = StreamVariableRegistryEntry(
        uid='telemetry-success-stream',
        func=successful_stream,
        variables=[],
        key_accessor=None,
    )
    cancelled_stream_entry = StreamVariableRegistryEntry(
        uid='telemetry-cancelled-stream',
        func=cancellable_stream,
        variables=[],
        key_accessor=None,
    )
    backend_store = BackendStore(backend=InMemoryBackend(), uid='telemetry-store')

    @get(url='/telemetry-operations')
    async def telemetry_operations():
        store = utils_registry.get('Store')
        task_mgr = utils_registry.get('TaskManager')
        successful_entry = derived_variable_registry.get(str(successful_derived.uid))
        failed_entry = derived_variable_registry.get(str(failed_derived.uid))

        first = await successful_entry.get_value(successful_entry, store, task_mgr, [1])
        second = await successful_entry.get_value(successful_entry, store, task_mgr, [1])

        with contextlib.suppress(RuntimeError):
            await failed_entry.get_value(failed_entry, store, task_mgr, [1])

        CURRENT_COMPONENT_ID.set('telemetry-component-instance')
        await render_component(component_definition, store, task_mgr, {'value': 'rendered'}, {})

        disconnect_event = asyncio.Event()
        successful_events = [
            event async for event in run_stream(successful_stream_entry, disconnect_event, [], store, task_mgr)
        ]

        cancelled_disconnect = asyncio.Event()
        cancelled_disconnect.set()
        cancelled_events = [
            event async for event in run_stream(cancelled_stream_entry, cancelled_disconnect, [], store, task_mgr)
        ]

        uploaded = UploadFile(filename='telemetry.csv', file=io.BytesIO(b'index,value\n0,1\n'))
        await upload(uploaded)

        await backend_store.write({'value': 1}, notify=False)
        persisted = await backend_store.read()

        return {
            'cached': first['value'] == second['value'] == 2,
            'persisted': persisted,
            'successful_events': len(successful_events),
            'cancelled_events': len(cancelled_events),
        }

    builder.add_endpoint(telemetry_operations)
    auth = BasicAuthConfig(username='test', password='test')
    config = builder._to_configuration()
    config.auth_config = auth
    app = _start_application(config)

    span_exporter = InMemorySpanExporter()
    cast(TracerProvider, trace.get_tracer_provider()).add_span_processor(SimpleSpanProcessor(span_exporter))
    _mock_operation_metrics()

    async with TestClient(app) as client:
        login = await client.post('/api/auth/session', json={'username': 'test', 'password': 'test'})
        assert login.status_code == 200, login.text

        response = await client.get('/api/telemetry-operations')
        assert response.status_code == 200, response.text
        assert response.json() == {
            'cached': True,
            'persisted': {'value': 1},
            'successful_events': 1,
            'cancelled_events': 0,
        }

    spans = span_exporter.get_finished_spans()
    operation_http_span = next(span for span in spans if span.name == 'GET /api/telemetry-operations')
    assert operation_http_span.context is not None

    derived_spans = [span for span in spans if span.name == 'dara.derived_variable.resolve']
    assert len(derived_spans) == 3
    assert {span.attributes.get('dara.outcome') for span in derived_spans if span.attributes} == {
        'success',
        'error',
    }
    successful_derived_spans = [
        span
        for span in derived_spans
        if span.attributes is not None
        and span.attributes.get('dara.derived_variable.function.name') == 'successful_resolver'
    ]
    assert len(successful_derived_spans) == 2
    for span in successful_derived_spans:
        assert span.attributes is not None
        assert span.attributes['dara.derived_variable.id'] == str(successful_derived.uid)
        assert span.attributes['dara.derived_variable.name'] == 'successful_resolver'
        assert span.attributes['dara.derived_variable.function.identity'].endswith('.successful_resolver')

    failed_derived_span = next(
        span
        for span in derived_spans
        if span.attributes is not None
        and span.attributes.get('dara.derived_variable.function.name') == 'failed_resolver'
    )
    assert failed_derived_span.attributes is not None
    assert failed_derived_span.attributes['dara.derived_variable.id'] == str(failed_derived.uid)
    assert failed_derived_span.attributes['dara.derived_variable.function.identity'].endswith('.failed_resolver')

    for span in derived_spans:
        assert span.parent is not None
        assert span.parent.span_id == operation_http_span.context.span_id

    phase_names = {
        span.name
        for span in spans
        if span.name.startswith('dara.derived_variable.') and span.name != 'dara.derived_variable.resolve'
    }
    assert {
        'dara.derived_variable.lock_wait',
        'dara.derived_variable.dependencies',
        'dara.derived_variable.cache_lookup',
        'dara.derived_variable.resolver',
        'dara.derived_variable.cache_write',
    }.issubset(phase_names)

    cache_lookup_spans = [span for span in spans if span.name == 'dara.derived_variable.cache_lookup']
    assert {span.attributes.get('dara.cache.result') for span in cache_lookup_spans if span.attributes} == {
        'hit',
        'miss',
    }

    component_span = next(span for span in spans if span.name == 'dara.py_component.render')
    assert component_span.attributes is not None
    assert component_span.attributes['dara.py_component.definition.id'] == 'telemetry-component'
    assert component_span.attributes['dara.py_component.instance.id'] == 'telemetry-component-instance'
    assert component_span.attributes['dara.py_component.function.name'] == 'component_renderer'
    assert component_span.attributes['dara.py_component.function.identity'].endswith('.component_renderer')
    assert component_span.attributes['dara.outcome'] == 'success'

    stream_spans = [span for span in spans if span.name == 'dara.stream.run']
    assert {span.attributes.get('dara.outcome') for span in stream_spans if span.attributes} == {
        'success',
        'cancelled',
    }
    assert not any(span.name.startswith('dara.stream.event') for span in spans)

    upload_span = next(span for span in spans if span.name == 'dara.upload.resolve')
    assert upload_span.attributes is not None
    assert upload_span.attributes['dara.upload.resolver.kind'] == 'default'

    store_spans = [span for span in spans if span.name.startswith('dara.backend_store.')]
    assert {span.attributes.get('dara.backend_store.operation') for span in store_spans if span.attributes} == {
        'read',
        'write',
    }

    sensitive_fragments = ('cache_key', 'store_uid', 'telemetry-store', 'index,value')
    for span in spans:
        attributes = repr(span.attributes)
        assert all(fragment not in attributes for fragment in sensitive_fragments)

    cache_metric_attributes = [
        call.args[1] for call in cast(MagicMock, telemetry._DERIVED_VARIABLE_CACHE_ACCESSES).add.call_args_list
    ]
    assert {attributes['dara.cache.result'] for attributes in cache_metric_attributes} == {
        'hit',
        'miss',
        'bypass',
    }
    assert all(set(attributes) == {'dara.cache.result'} for attributes in cache_metric_attributes)

    derived_metric_attributes = [
        call.args[1]
        for call in cast(MagicMock, telemetry._DERIVED_VARIABLE_DURATION).record.call_args_list
        if len(call.args) > 1
    ]
    assert all(
        set(attributes)
        == {
            'dara.derived_variable.resolver',
            'dara.derived_variable.execution',
            'dara.derived_variable.stage',
            'dara.outcome',
        }
        for attributes in derived_metric_attributes
    )

    component_metric_attributes = [
        call.args[1]
        for call in cast(MagicMock, telemetry._PY_COMPONENT_DURATION).record.call_args_list
        if len(call.args) > 1
    ]
    assert all(
        set(attributes) == {'dara.py_component.name', 'dara.outcome'} for attributes in component_metric_attributes
    )

    stream_metric_attributes = [
        call.args[1] for call in cast(MagicMock, telemetry._STREAM_DURATION).record.call_args_list if len(call.args) > 1
    ]
    assert {attributes['dara.outcome'] for attributes in stream_metric_attributes} == {
        'success',
        'cancelled',
    }


if __name__ == '__main__':
    anyio.run(main)
