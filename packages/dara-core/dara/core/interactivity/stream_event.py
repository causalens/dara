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

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel


class StreamEventType(str, Enum):
    """Types of events that can be sent from a StreamVariable."""

    # === Keyed mode events (require key_accessor) ===
    ADD = 'add'
    """Add one or more items to the keyed collection."""

    REMOVE = 'remove'
    """Remove one or more items by key from the keyed collection."""

    CLEAR = 'clear'
    """Clear all items from the keyed collection."""

    # === Custom state mode events ===
    JSON_SNAPSHOT = 'json_snapshot'
    """Replace entire state with arbitrary JSON data."""

    JSON_PATCH = 'json_patch'
    """Apply JSON Patch operations (RFC 6902) to the current state."""

    # === Control events ===
    RECONNECT = 'reconnect'
    """Signal to client to reconnect (sent when ReconnectException is raised)."""

    ERROR = 'error'
    """Signal an error occurred in the stream."""


class StreamEvent(BaseModel):
    """
    An event emitted by a StreamVariable generator.

    StreamEvents are used to update the client-side state of a StreamVariable.

    **Keyed mode** (when `key_accessor` is set on StreamVariable):
    - `add(*items)`: Add/update items by key
    - `remove(*keys)`: Remove items by key
    - `clear()`: Clear all items

    **Custom state mode** (for arbitrary JSON state):
    - `json_snapshot(data)`: Replace entire state
    - `json_patch(operations)`: Apply RFC 6902 JSON Patch operations

    Examples:
        Keyed collection (e.g., events with unique IDs)::

            async def events_stream():
                yield StreamEvent.clear()  # Start with empty state
                yield StreamEvent.add(event1, event2)  # Add initial events
                async for event in live_feed:
                    yield StreamEvent.add(event)  # Add new events

        Custom state with JSON patches::

            async def dashboard_stream():
                yield StreamEvent.json_snapshot({'items': {}, 'count': 0})
                yield StreamEvent.json_patch([
                    {"op": "add", "path": "/items/123", "value": item},
                    {"op": "replace", "path": "/count", "value": 1}
                ])
    """

    type: StreamEventType
    data: Any = None

    # === Keyed mode events ===

    @classmethod
    def add(cls, *items: Any) -> 'StreamEvent':
        """
        Add one or more items to the keyed collection.

        Items are keyed using the `key_accessor` property path defined on the StreamVariable.
        If an item with the same key exists, it will be updated.

        Args:
            *items: One or more items to add. Each item must have the property
                   specified by `key_accessor`.

        Returns:
            StreamEvent with type ADD

        Raises:
            ValueError: If no items are provided

        Example::

            yield StreamEvent.add(event)
            yield StreamEvent.add(event1, event2, event3)
            yield StreamEvent.add(*events_list)
        """
        if not items:
            raise ValueError('StreamEvent.add() requires at least one item')

        # Single item: send as-is, multiple items: send as list
        data = items[0] if len(items) == 1 else list(items)
        return cls(type=StreamEventType.ADD, data=data)

    @classmethod
    def remove(cls, *keys: str | int) -> 'StreamEvent':
        """
        Remove one or more items by key from the keyed collection.

        Args:
            *keys: One or more keys to remove.

        Returns:
            StreamEvent with type REMOVE

        Raises:
            ValueError: If no keys are provided

        Example::

            yield StreamEvent.remove('item-1')
            yield StreamEvent.remove('item-1', 'item-2', 'item-3')
            yield StreamEvent.remove(*keys_to_remove)
        """
        if not keys:
            raise ValueError('StreamEvent.remove() requires at least one key')

        # Single key: send as-is, multiple keys: send as list
        data = keys[0] if len(keys) == 1 else list(keys)
        return cls(type=StreamEventType.REMOVE, data=data)

    @classmethod
    def clear(cls) -> 'StreamEvent':
        """
        Clear all items from the keyed collection.

        Returns:
            StreamEvent with type CLEAR

        Example::

            yield StreamEvent.clear()  # Empty the collection
        """
        return cls(type=StreamEventType.CLEAR, data=None)

    # === Custom state mode events ===

    @classmethod
    def json_snapshot(cls, data: Any) -> 'StreamEvent':
        """
        Replace the entire state with new JSON data.

        Use this for custom state structures or as the first event
        in a stream to establish initial state.

        Args:
            data: The new state (any JSON-serializable structure)

        Returns:
            StreamEvent with type JSON_SNAPSHOT

        Example::

            yield StreamEvent.json_snapshot({'items': {}, 'meta': {'count': 0}})
            yield StreamEvent.json_snapshot(await api.get_current_state())
        """
        return cls(type=StreamEventType.JSON_SNAPSHOT, data=data)

    @classmethod
    def json_patch(cls, operations: list[dict[str, Any]]) -> 'StreamEvent':
        """
        Apply JSON Patch operations (RFC 6902) to the current state.

        This allows fine-grained updates to complex state structures without
        replacing the entire state.

        Args:
            operations: List of JSON Patch operations. Each operation is a dict
                       with keys like 'op', 'path', and 'value'.

        Returns:
            StreamEvent with type JSON_PATCH

        Example::

            yield StreamEvent.json_patch([
                {"op": "add", "path": "/items/-", "value": new_item},
                {"op": "replace", "path": "/count", "value": 5},
                {"op": "remove", "path": "/items/0"}
            ])
        """
        return cls(type=StreamEventType.JSON_PATCH, data=operations)

    # === Control events ===

    @classmethod
    def reconnect(cls) -> 'StreamEvent':
        """
        Signal to the client that it should reconnect.

        This is sent automatically when ReconnectException is raised in the generator.

        Returns:
            StreamEvent with type RECONNECT
        """
        return cls(type=StreamEventType.RECONNECT, data=None)

    @classmethod
    def error(cls, message: str) -> 'StreamEvent':
        """
        Signal that an error occurred in the stream.

        This is sent automatically when an unhandled exception occurs in the generator.

        Args:
            message: Error message to send to the client

        Returns:
            StreamEvent with type ERROR
        """
        return cls(type=StreamEventType.ERROR, data=message)


class ReconnectException(Exception):
    """
    Exception to signal that the stream should reconnect.

    Raise this exception in a StreamVariable generator to indicate that
    a recoverable error occurred and the client should attempt to reconnect.
    The framework will send a reconnect event to the client, which will
    then attempt to reconnect with exponential backoff.

    Example::

        async def events_stream(invocation_id: str):
            try:
                async for event in api.stream_events(invocation_id):
                    yield StreamEvent.add(event)
            except ConnectionError:
                raise ReconnectException()
    """

    pass
