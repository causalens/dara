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


# --- StreamEvent Tests: Keyed Mode ---


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


def test_stream_event_remove_single():
    """Test StreamEvent.remove with a single key."""
    event = StreamEvent.remove('item-1')
    assert event.type == StreamEventType.REMOVE
    assert event.data == 'item-1'


def test_stream_event_remove_multiple():
    """Test StreamEvent.remove with multiple keys."""
    event = StreamEvent.remove('item-1', 'item-2', 'item-3')
    assert event.type == StreamEventType.REMOVE
    assert event.data == ['item-1', 'item-2', 'item-3']


def test_stream_event_remove_int_keys():
    """Test StreamEvent.remove with integer keys."""
    event = StreamEvent.remove(1, 2, 3)
    assert event.type == StreamEventType.REMOVE
    assert event.data == [1, 2, 3]


def test_stream_event_remove_empty_raises():
    """Test that StreamEvent.remove raises when no keys are provided."""
    with pytest.raises(ValueError, match='requires at least one key'):
        StreamEvent.remove()


def test_stream_event_clear():
    """Test StreamEvent.clear."""
    event = StreamEvent.clear()
    assert event.type == StreamEventType.CLEAR
    assert event.data is None


def test_stream_event_replace_multiple():
    """Test StreamEvent.replace with multiple items."""
    event = StreamEvent.replace({'id': '1'}, {'id': '2'}, {'id': '3'})
    assert event.type == StreamEventType.REPLACE
    assert event.data == [{'id': '1'}, {'id': '2'}, {'id': '3'}]


def test_stream_event_replace_single():
    """Test StreamEvent.replace with a single item."""
    event = StreamEvent.replace({'id': '1', 'data': 'test'})
    assert event.type == StreamEventType.REPLACE
    assert event.data == [{'id': '1', 'data': 'test'}]


def test_stream_event_replace_empty():
    """Test StreamEvent.replace with no items (equivalent to clear)."""
    event = StreamEvent.replace()
    assert event.type == StreamEventType.REPLACE
    assert event.data == []


def test_stream_event_replace_from_list():
    """Test StreamEvent.replace with unpacked list."""
    items = [{'id': '1'}, {'id': '2'}]
    event = StreamEvent.replace(*items)
    assert event.type == StreamEventType.REPLACE
    assert event.data == [{'id': '1'}, {'id': '2'}]


# --- StreamEvent Tests: Custom State Mode ---


def test_stream_event_json_snapshot():
    """Test StreamEvent.json_snapshot with various data types."""
    # List
    event = StreamEvent.json_snapshot([1, 2, 3])
    assert event.type == StreamEventType.JSON_SNAPSHOT
    assert event.data == [1, 2, 3]

    # Dict
    event = StreamEvent.json_snapshot({'items': {}, 'count': 0})
    assert event.type == StreamEventType.JSON_SNAPSHOT
    assert event.data == {'items': {}, 'count': 0}

    # Nested structure
    event = StreamEvent.json_snapshot({'a': {'b': {'c': 1}}})
    assert event.type == StreamEventType.JSON_SNAPSHOT
    assert event.data == {'a': {'b': {'c': 1}}}

    # Primitive
    event = StreamEvent.json_snapshot('hello')
    assert event.type == StreamEventType.JSON_SNAPSHOT
    assert event.data == 'hello'


def test_stream_event_json_patch():
    """Test StreamEvent.json_patch."""
    operations = [
        {'op': 'add', 'path': '/items/-', 'value': {'id': '1'}},
        {'op': 'replace', 'path': '/count', 'value': 5},
        {'op': 'remove', 'path': '/old_field'},
    ]
    event = StreamEvent.json_patch(operations)
    assert event.type == StreamEventType.JSON_PATCH
    assert event.data == operations


# --- StreamEvent Tests: Control Events ---


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
        yield StreamEvent.json_snapshot({'meta': {'count': 5}})

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


def test_stream_variable_prevents_run_as_task_derived():
    """Test that StreamVariable raises when DerivedVariable has run_as_task=True."""

    async def test_stream(value: str):
        yield StreamEvent.add({'id': '1', 'value': value})

    var = Variable('test')
    derived_with_task = DerivedVariable(lambda x: x.upper(), variables=[var], run_as_task=True)

    with pytest.raises(ValueError, match='cannot depend on a DerivedVariable with run_as_task=True'):
        StreamVariable(test_stream, variables=[derived_with_task])


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


async def test_stream_endpoint_keyed_mode():
    """Test stream endpoint with keyed mode events (add/remove/clear)."""
    builder = ConfigurationBuilder()

    received_values = []

    async def test_stream(value: str):
        received_values.append(value)
        yield StreamEvent.clear()
        yield StreamEvent.add({'id': '1', 'value': value})
        yield StreamEvent.add({'id': '2', 'value': 'second'})

    var = Variable('test_input')
    stream_var = StreamVariable(test_stream, variables=[var], key_accessor='id')

    builder.add_page('Test', content=MockComponent(stream=stream_var))
    config = create_app(builder)

    app = _start_application(config)
    async with AsyncClient(app) as client:
        response = await _get_stream_response(client, stream_var, ['hello'])

        assert response.status_code == 200
        events = parse_sse_events(response.text)

        assert len(events) == 3
        assert events[0]['type'] == 'clear'
        assert events[0]['data'] is None
        assert events[1]['type'] == 'add'
        assert events[1]['data'] == {'id': '1', 'value': 'hello'}
        assert events[2]['type'] == 'add'
        assert events[2]['data'] == {'id': '2', 'value': 'second'}

        # Check the stream received the correct value
        assert received_values == ['hello']


async def test_stream_endpoint_replace():
    """Test stream endpoint with replace event for atomic state replacement."""
    builder = ConfigurationBuilder()

    async def test_stream(value: str):
        # Use replace for atomic initial state (no flash of empty)
        yield StreamEvent.replace(
            {'id': '1', 'value': value},
            {'id': '2', 'value': 'second'},
        )
        # Then stream incremental updates
        yield StreamEvent.add({'id': '3', 'value': 'third'})

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
        assert events[0]['type'] == 'replace'
        assert events[0]['data'] == [
            {'id': '1', 'value': 'hello'},
            {'id': '2', 'value': 'second'},
        ]
        assert events[1]['type'] == 'add'
        assert events[1]['data'] == {'id': '3', 'value': 'third'}


async def test_stream_endpoint_replace_empty():
    """Test stream endpoint with empty replace (equivalent to clear)."""
    builder = ConfigurationBuilder()

    async def test_stream(value: str):
        yield StreamEvent.replace()  # Empty replace = clear

    var = Variable('test_input')
    stream_var = StreamVariable(test_stream, variables=[var], key_accessor='id')

    builder.add_page('Test', content=MockComponent(stream=stream_var))
    config = create_app(builder)

    app = _start_application(config)
    async with AsyncClient(app) as client:
        response = await _get_stream_response(client, stream_var, ['hello'])

        assert response.status_code == 200
        events = parse_sse_events(response.text)

        assert len(events) == 1
        assert events[0]['type'] == 'replace'
        assert events[0]['data'] == []


async def test_stream_endpoint_custom_state_mode():
    """Test stream endpoint with custom state mode events (json_snapshot/json_patch)."""
    builder = ConfigurationBuilder()

    async def test_stream(value: str):
        yield StreamEvent.json_snapshot({'count': 0, 'items': {}})
        yield StreamEvent.json_patch(
            [
                {'op': 'replace', 'path': '/count', 'value': 5},
                {'op': 'add', 'path': '/items/a', 'value': value},
            ]
        )

    var = Variable('test')
    stream_var = StreamVariable(test_stream, variables=[var])

    builder.add_page('Test', content=MockComponent(stream=stream_var))
    config = create_app(builder)

    app = _start_application(config)
    async with AsyncClient(app) as client:
        response = await _get_stream_response(client, stream_var, ['hello'])

        assert response.status_code == 200
        events = parse_sse_events(response.text)

        assert len(events) == 2
        assert events[0]['type'] == 'json_snapshot'
        assert events[0]['data'] == {'count': 0, 'items': {}}
        assert events[1]['type'] == 'json_patch'
        assert events[1]['data'] == [
            {'op': 'replace', 'path': '/count', 'value': 5},
            {'op': 'add', 'path': '/items/a', 'value': 'hello'},
        ]


async def test_stream_endpoint_with_derived_variable():
    """Test stream endpoint with a DerivedVariable as input."""
    builder = ConfigurationBuilder()

    received_values = []

    async def test_stream(transformed_value: str):
        received_values.append(transformed_value)
        yield StreamEvent.json_snapshot({'result': transformed_value})

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
        assert events[0]['type'] == 'json_snapshot'

        assert received_values[0] == 'transformed_my_input'


async def test_stream_endpoint_error_handling():
    """Test that stream endpoint handles errors correctly."""
    builder = ConfigurationBuilder()

    async def failing_stream(value: str):
        yield StreamEvent.clear()
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
        assert events[0]['type'] == 'clear'
        assert events[1]['type'] == 'error'
        assert 'Test error' in events[1]['data']


async def test_stream_endpoint_reconnect_exception():
    """Test that ReconnectException sends a reconnect event."""
    builder = ConfigurationBuilder()

    async def reconnecting_stream(value: str):
        yield StreamEvent.clear()
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
        assert events[0]['type'] == 'clear'
        assert events[1]['type'] == 'reconnect'


async def test_stream_endpoint_not_found():
    """Test that stream endpoint returns 404 for unknown stream."""

    async def dummy_stream():
        yield StreamEvent.json_snapshot([])

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


# --- Mode Validation Tests ---


async def test_stream_endpoint_keyed_event_without_key_accessor_errors():
    """Test that using keyed mode events (add) without key_accessor results in error."""
    builder = ConfigurationBuilder()

    async def bad_stream(value: str):
        # Using add() without key_accessor should error
        yield StreamEvent.add({'id': '1', 'value': value})

    var = Variable('test')
    # No key_accessor - custom mode
    stream_var = StreamVariable(bad_stream, variables=[var])

    builder.add_page('Test', content=MockComponent(stream=stream_var))
    config = create_app(builder)

    app = _start_application(config)
    async with AsyncClient(app) as client:
        response = await _get_stream_response(client, stream_var, ['hello'])

        assert response.status_code == 200
        events = parse_sse_events(response.text)

        assert len(events) == 1
        assert events[0]['type'] == 'error'
        assert 'key_accessor' in events[0]['data']


async def test_stream_endpoint_custom_event_with_key_accessor_errors():
    """Test that using custom mode events (json_snapshot) with key_accessor results in error."""
    builder = ConfigurationBuilder()

    async def bad_stream(value: str):
        # Using json_snapshot() with key_accessor should error
        yield StreamEvent.json_snapshot({'value': value})

    var = Variable('test')
    # Has key_accessor - keyed mode
    stream_var = StreamVariable(bad_stream, variables=[var], key_accessor='id')

    builder.add_page('Test', content=MockComponent(stream=stream_var))
    config = create_app(builder)

    app = _start_application(config)
    async with AsyncClient(app) as client:
        response = await _get_stream_response(client, stream_var, ['hello'])

        assert response.status_code == 200
        events = parse_sse_events(response.text)

        assert len(events) == 1
        assert events[0]['type'] == 'error'
        assert 'key_accessor' in events[0]['data']
