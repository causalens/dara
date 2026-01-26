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

    ADD = 'add'
    """Add one or more items to the collection. Requires key_accessor on StreamVariable."""

    SNAPSHOT = 'snapshot'
    """Replace entire state with the provided data (any shape)."""

    PATCH = 'patch'
    """Apply JSON Patch operations (RFC 6902) to the current state."""

    RECONNECT = 'reconnect'
    """Signal to client to reconnect (sent when ReconnectException is raised)."""

    ERROR = 'error'
    """Signal an error occurred in the stream."""


class StreamEvent(BaseModel):
    """
    An event emitted by a StreamVariable generator.

    StreamEvents are used to update the client-side state of a StreamVariable.
    The type of event determines how the data is applied:

    - `add`: Add items to a keyed collection (requires key_accessor)
    - `snapshot`: Replace entire state with new data
    - `patch`: Apply JSON Patch operations to current state

    Examples:
        Simple list accumulation::

            yield StreamEvent.add(event)
            yield StreamEvent.add(event1, event2, event3)

        Custom state with patches::

            yield StreamEvent.snapshot({'items': [], 'count': 0})
            yield StreamEvent.patch([
                {"op": "add", "path": "/items/-", "value": item},
                {"op": "replace", "path": "/count", "value": new_count}
            ])
    """

    type: StreamEventType
    data: Any = None

    @classmethod
    def add(cls, *items: Any) -> 'StreamEvent':
        """
        Add one or more items to the collection.

        Items are keyed using the `key_accessor` property path defined on the StreamVariable.
        Duplicate keys will update the existing item (deduplication).

        Args:
            *items: One or more items to add. Each item should have the property
                   specified by key_accessor.

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
    def snapshot(cls, data: Any) -> 'StreamEvent':
        """
        Replace the entire state with new data.

        This is typically used as the first event in a stream to establish
        initial state, ensuring consistent state on reconnection.

        Args:
            data: The new state (any shape - list, dict, or complex structure)

        Returns:
            StreamEvent with type SNAPSHOT

        Example::

            yield StreamEvent.snapshot(await api.get_current_state())
            yield StreamEvent.snapshot({'items': {}, 'meta': {'count': 0}})
        """
        return cls(type=StreamEventType.SNAPSHOT, data=data)

    @classmethod
    def patch(cls, operations: list[dict[str, Any]]) -> 'StreamEvent':
        """
        Apply JSON Patch operations (RFC 6902) to the current state.

        This allows fine-grained updates to complex state structures without
        replacing the entire state.

        Args:
            operations: List of JSON Patch operations. Each operation is a dict
                       with keys like 'op', 'path', and 'value'.

        Returns:
            StreamEvent with type PATCH

        Example::

            yield StreamEvent.patch([
                {"op": "add", "path": "/items/-", "value": new_item},
                {"op": "replace", "path": "/count", "value": 5},
                {"op": "remove", "path": "/items/0"}
            ])
        """
        return cls(type=StreamEventType.PATCH, data=operations)

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
