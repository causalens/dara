"""
Tests for StreamVariable functionality.
"""

import json
from typing import Any
from unittest.mock import Mock

import pytest
from async_asgi_testclient import TestClient as AsyncClient

from dara.core import DerivedVariable, Variable
from dara.core.configuration import ConfigurationBuilder
from dara.core.definitions import ComponentInstance
from dara.core.interactivity.stream_event import ReconnectException, StreamEvent, StreamEventType
from dara.core.interactivity.stream_variable import StreamVariable
from dara.core.internal.dependency_resolution import ResolvedDerivedVariable
from dara.core.main import _start_application

from tests.python.utils import AUTH_HEADERS, create_app, normalize_request

pytestmark = pytest.mark.anyio


class MockComponent(ComponentInstance):
    """Mock component for testing."""

    stream: StreamVariable | None = None

    def __init__(self, stream: StreamVariable | None = None):
        super().__init__(stream=stream, uid='uid')


# --- StreamEvent Tests ---


def test_stream_event_add_single():
    """Test StreamEvent.add with a single item."""
    event = StreamEvent.add({'id': '1', 'data': 'test'})
    assert event.type == StreamEventType.ADD
    assert event.data == {'id': '1', 'data': 'test'}


def test_stream_event_add_multiple():
    """Test StreamEvent.add with multiple items."""
    event = StreamEvent.add({'id': '1'}, {'id': '2'}, {'id': '3'})
    assert event.type == StreamEventType.ADD
    assert event.data == [{'id': '1'}, {'id': '2'}, {'id': '3'}]


def test_stream_event_add_empty_raises():
    """Test that StreamEvent.add raises when no items are provided."""
    with pytest.raises(ValueError, match='requires at least one item'):
        StreamEvent.add()


def test_stream_event_snapshot():
    """Test StreamEvent.snapshot."""
    event = StreamEvent.snapshot([1, 2, 3])
    assert event.type == StreamEventType.SNAPSHOT
    assert event.data == [1, 2, 3]

    # Test with dict
    event = StreamEvent.snapshot({'items': {}, 'count': 0})
    assert event.type == StreamEventType.SNAPSHOT
    assert event.data == {'items': {}, 'count': 0}


def test_stream_event_patch():
    """Test StreamEvent.patch."""
    operations = [
        {'op': 'add', 'path': '/items/-', 'value': {'id': '1'}},
        {'op': 'replace', 'path': '/count', 'value': 5},
    ]
    event = StreamEvent.patch(operations)
    assert event.type == StreamEventType.PATCH
    assert event.data == operations


def test_stream_event_reconnect():
    """Test StreamEvent.reconnect."""
    event = StreamEvent.reconnect()
    assert event.type == StreamEventType.RECONNECT
    assert event.data is None


def test_stream_event_error():
    """Test StreamEvent.error."""
    event = StreamEvent.error('Something went wrong')
    assert event.type == StreamEventType.ERROR
    assert event.data == 'Something went wrong'


# --- StreamVariable Tests ---


def test_stream_variable_creation():
    """Test basic StreamVariable creation."""

    async def test_stream(x: str):
        yield StreamEvent.add({'id': '1'})

    var = Variable('test')
    stream_var = StreamVariable(test_stream, variables=[var], key_accessor='id')

    assert stream_var.key_accessor == 'id'
    assert len(stream_var.variables) == 1
    assert stream_var.nested == []


def test_stream_variable_serialization():
    """Test that StreamVariable serializes correctly."""

    async def test_stream(x: str):
        yield StreamEvent.add({'id': '1'})

    var = Variable('test')
    stream_var = StreamVariable(test_stream, variables=[var], key_accessor='id')

    serialized = stream_var.model_dump()
    assert serialized['__typename'] == 'StreamVariable'
    assert serialized['key_accessor'] == 'id'
    assert serialized['nested'] == []
    assert len(serialized['variables']) == 1
    assert serialized['variables'][0]['__typename'] == 'Variable'


def test_stream_variable_get_nested():
    """Test StreamVariable.get() for nested access."""

    async def test_stream(x: str):
        yield StreamEvent.snapshot({'meta': {'count': 5}})

    stream_var = StreamVariable(test_stream, variables=[])
    nested = stream_var.get('meta', 'count')

    assert nested.nested == ['meta', 'count']
    assert nested.uid == stream_var.uid  # Same uid, different nested path


def test_stream_variable_prevents_stream_dependency():
    """Test that StreamVariable raises when another StreamVariable is in variables."""

    async def stream_a(x: str):
        yield StreamEvent.add({'id': '1'})

    async def stream_b(upstream):
        yield StreamEvent.add({'id': '2'})

    stream_a_var = StreamVariable(stream_a, variables=[Variable('test')])

    with pytest.raises(ValueError, match='cannot depend on another StreamVariable'):
        StreamVariable(stream_b, variables=[stream_a_var])


def test_stream_variable_with_derived_variable():
    """Test that StreamVariable can depend on a DerivedVariable."""

    async def test_stream(derived_value: str):
        yield StreamEvent.add({'id': '1', 'value': derived_value})

    var = Variable('input')
    derived = DerivedVariable(lambda x: x.upper(), variables=[var])
    stream_var = StreamVariable(test_stream, variables=[derived])

    assert len(stream_var.variables) == 1
    # Check serialization includes the derived variable
    serialized = stream_var.model_dump()
    assert serialized['variables'][0]['__typename'] == 'DerivedVariable'


# --- SSE Endpoint Tests ---


async def _get_stream_response(
    client: AsyncClient,
    stream_var: StreamVariable,
    values: list[Any],
    headers=AUTH_HEADERS,
):
    """Helper to fetch SSE response from the stream endpoint."""
    # Normalize the values like the frontend would
    normalized_values, lookup = normalize_request(values, stream_var.variables)

    response = await client.post(
        f'/api/core/stream/{str(stream_var.uid)}',
        json={'values': {'data': normalized_values, 'lookup': lookup}},
        headers=headers,
    )

    return response


def parse_sse_events(content: str) -> list[dict]:
    """Parse SSE events from response content."""
    events = []
    for line in content.split('\n'):
        if line.startswith('data: '):
            data = json.loads(line[6:])
            events.append(data)
    return events


async def test_stream_endpoint_basic():
    """Test basic stream endpoint functionality."""
    builder = ConfigurationBuilder()

    received_values = []

    async def test_stream(value: str):
        received_values.append(value)
        yield StreamEvent.snapshot([])
        yield StreamEvent.add({'id': '1', 'value': value})

    var = Variable('test_input')
    stream_var = StreamVariable(test_stream, variables=[var], key_accessor='id')

    builder.add_page('Test', content=MockComponent(stream=stream_var))
    config = create_app(builder)

    app = _start_application(config)
    async with AsyncClient(app) as client:
        response = await _get_stream_response(client, stream_var, ['hello'])

        assert response.status_code == 200
        events = parse_sse_events(response.text)

        assert len(events) == 2
        assert events[0]['type'] == 'snapshot'
        assert events[0]['data'] == []
        assert events[1]['type'] == 'add'
        assert events[1]['data'] == {'id': '1', 'value': 'hello'}

        # Check the stream received the correct value
        assert received_values == ['hello']


async def test_stream_endpoint_with_derived_variable():
    """Test stream endpoint with a DerivedVariable as input."""
    builder = ConfigurationBuilder()

    received_values = []

    async def test_stream(transformed_value: str):
        received_values.append(transformed_value)
        yield StreamEvent.snapshot({'result': transformed_value})

    input_var = Variable('test')
    # DerivedVariable that transforms the input
    derived = DerivedVariable(lambda x: f'transformed_{x}', variables=[input_var])
    stream_var = StreamVariable(test_stream, variables=[derived])

    builder.add_page('Test', content=MockComponent(stream=stream_var))
    config = create_app(builder)

    app = _start_application(config)
    async with AsyncClient(app) as client:
        # The value we send is a resolved DerivedVariable structure
        # In practice, the client resolves the DV and sends the result
        resolved_dv = ResolvedDerivedVariable(
            type='derived',
            uid=str(derived.uid),
            values=['my_input'],
            nested=[],
            force_key=None,
        )
        response = await _get_stream_response(client, stream_var, [resolved_dv])

        assert response.status_code == 200
        events = parse_sse_events(response.text)

        assert len(events) == 1
        assert events[0]['type'] == 'snapshot'


async def test_stream_endpoint_error_handling():
    """Test that stream endpoint handles errors correctly."""
    builder = ConfigurationBuilder()

    async def failing_stream(value: str):
        yield StreamEvent.snapshot([])
        raise RuntimeError('Test error')

    var = Variable('test')
    stream_var = StreamVariable(failing_stream, variables=[var], key_accessor='id')

    builder.add_page('Test', content=MockComponent(stream=stream_var))
    config = create_app(builder)

    app = _start_application(config)
    async with AsyncClient(app) as client:
        response = await _get_stream_response(client, stream_var, ['hello'])

        assert response.status_code == 200
        events = parse_sse_events(response.text)

        assert len(events) == 2
        assert events[0]['type'] == 'snapshot'
        assert events[1]['type'] == 'error'
        assert 'Test error' in events[1]['data']


async def test_stream_endpoint_reconnect_exception():
    """Test that ReconnectException sends a reconnect event."""
    builder = ConfigurationBuilder()

    async def reconnecting_stream(value: str):
        yield StreamEvent.snapshot([])
        raise ReconnectException()

    var = Variable('test')
    stream_var = StreamVariable(reconnecting_stream, variables=[var], key_accessor='id')

    builder.add_page('Test', content=MockComponent(stream=stream_var))
    config = create_app(builder)

    app = _start_application(config)
    async with AsyncClient(app) as client:
        response = await _get_stream_response(client, stream_var, ['hello'])

        assert response.status_code == 200
        events = parse_sse_events(response.text)

        assert len(events) == 2
        assert events[0]['type'] == 'snapshot'
        assert events[1]['type'] == 'reconnect'


async def test_stream_endpoint_not_found():
    """Test that stream endpoint returns 404 for unknown stream."""

    async def dummy_stream():
        yield StreamEvent.snapshot([])

    builder = ConfigurationBuilder()
    builder.add_page('Test', content=MockComponent(stream=StreamVariable(dummy_stream, variables=[])))
    config = create_app(builder)

    app = _start_application(config)
    async with AsyncClient(app) as client:
        response = await client.post(
            '/api/core/stream/nonexistent-uid',
            json={'values': {'data': [], 'lookup': {}}},
            headers=AUTH_HEADERS,
        )
        assert response.status_code == 404
