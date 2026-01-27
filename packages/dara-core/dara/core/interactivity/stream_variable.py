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

import asyncio
from collections.abc import AsyncGenerator, Callable
from dataclasses import dataclass
from typing import Any, Generic, Literal

from fastapi import Request
from pydantic import ConfigDict, Field, SerializerFunctionWrapHandler, field_validator, model_serializer
from typing_extensions import TypeVar

from dara.core.base_definitions import BaseTask
from dara.core.interactivity.any_variable import AnyVariable
from dara.core.interactivity.client_variable import ClientVariable
from dara.core.interactivity.stream_event import ReconnectException, StreamEvent
from dara.core.internal.cache_store import CacheStore
from dara.core.internal.tasks import TaskManager
from dara.core.logging import dev_logger

VariableType = TypeVar('VariableType', default=Any)


class StreamVariable(ClientVariable, Generic[VariableType]):
    """
    A StreamVariable represents a stream of events that are accumulated on the client.

    It takes an async generator function that yields StreamEvents, and dependencies
    (other variables). When dependencies change, a new stream is opened. Old streams
    might be cleaned up when unused to save resources.

    The stream is managed via Server-Sent Events (SSE) and the client handles
    reconnection automatically with exponential backoff.

    IMPORTANT: Handling Reconnection
    --------------------------------
    Stream functions MUST be idempotent - they should produce the correct state even
    when called multiple times due to reconnection. Streams can disconnect and reconnect
    at any time (network issues, browser tab suspension, server restarts). Your stream
    function runs from the beginning on each reconnection.

    Always start with ``StreamEvent.replace()`` (keyed mode) or ``StreamEvent.json_snapshot()``
    (custom mode) to set the full initial state atomically. This ensures clients always
    converge to the correct state regardless of when they connect, and avoids a flash of
    empty content on reconnection.

    Keyed mode (when ``key_accessor`` is set):

    - Items are stored in a dict keyed by the accessor, exposed as a list
    - Use ``replace()``, ``add()``, ``remove()``, ``clear()`` events

    Custom state mode (no ``key_accessor``):

    - State can be any JSON structure
    - Use ``json_snapshot()``, ``json_patch()`` events

    Examples
    --------
    Keyed event stream (e.g., events with unique IDs):

    ```python
    from dara.core import StreamVariable, StreamEvent

    async def events_stream(invocation_id: str):
        # Set initial state atomically (handles reconnection, no flash of empty)
        initial_events = await api.get_events(invocation_id)
        yield StreamEvent.replace(*initial_events)

        # Stream new events
        async for event in api.stream_events(invocation_id):
            yield StreamEvent.add(event)

    events = StreamVariable(
        events_stream,
        variables=[invocation_id_var],
        key_accessor='id',
    )

    # Use in template
    For(items=events, renderer=EventCard(events.list_item))
    ```

    Custom state with JSON patches:

    ```python
    async def dashboard_stream(dashboard_id: str):
        # Set initial state atomically (handles reconnection)
        current_state = await api.get_dashboard_state(dashboard_id)
        yield StreamEvent.json_snapshot(current_state)

        async for update in api.stream_updates(dashboard_id):
            yield StreamEvent.json_patch([
                {"op": "add", "path": f"/items/{update.id}", "value": update},
                {"op": "replace", "path": "/count", "value": update.count}
            ])

    dashboard = StreamVariable(dashboard_stream, variables=[dashboard_id_var])
    ```
    """

    __typename: Literal['StreamVariable'] = 'StreamVariable'
    uid: str
    variables: list[AnyVariable] = Field(default_factory=list)
    key_accessor: str | None = None
    nested: list[str] = Field(default_factory=list)

    model_config = ConfigDict(extra='forbid')

    @field_validator('variables')
    @classmethod
    def validate_variables(cls, variables: list[AnyVariable]) -> list[AnyVariable]:
        """Validate that variables don't contain unsupported types."""
        from dara.core.interactivity.derived_variable import DerivedVariable
        from dara.core.internal.registries import derived_variable_registry

        for v in variables:
            # Disallow StreamVariable -> StreamVariable dependency
            if isinstance(v, StreamVariable):
                raise ValueError(
                    'StreamVariable cannot depend on another StreamVariable. '
                    'Compose generators in Python instead. Example:\n\n'
                    'async def enriched_events(id):\n'
                    '    async for event in source_stream(id):\n'
                    '        yield StreamEvent.add(enrich(event))\n\n'
                    'events = StreamVariable(enriched_events, variables=[id_var])'
                )

            # Disallow DerivedVariable with run_as_task=True
            if isinstance(v, DerivedVariable):
                entry = derived_variable_registry.get(str(v.uid))
                if entry is not None and entry.run_as_task:
                    raise ValueError(
                        'StreamVariable cannot depend on a DerivedVariable with run_as_task=True. '
                        'Task-based variables resolve asynchronously which is incompatible with '
                        'streaming. Remove run_as_task=True or compute the value in the stream function.'
                    )

        return variables

    def __init__(
        self,
        func: Callable[..., AsyncGenerator[StreamEvent, None]],
        variables: list[AnyVariable] | None = None,
        key_accessor: str | None = None,
        uid: str | None = None,
        nested: list[str] | None = None,
        **kwargs,
    ):
        """
        Create a new StreamVariable.

        :param func: Async generator function that yields StreamEvents.
                    The function receives resolved values of `variables` as arguments.
        :param variables: List of variables whose resolved values are passed to `func`.
                         When any of these change, a new stream is opened.
        :param key_accessor: Property path to extract unique ID from items for deduplication.
                            Required when using StreamEvent.add(). E.g., 'id' or 'data.id'.
        :param uid: Unique identifier for this variable. Auto-generated if not provided.
        :param nested: Internal use - tracks nested path for .get() chains.
        """
        if variables is None:
            variables = []
        if nested is None:
            nested = []

        super().__init__(
            uid=uid,
            variables=variables,
            key_accessor=key_accessor,
            nested=nested,
            **kwargs,
        )

        # Register with the stream variable registry
        from dara.core.internal.registries import stream_variable_registry

        stream_variable_registry.register(
            str(self.uid),
            StreamVariableRegistryEntry(
                uid=str(self.uid),
                func=func,
                variables=variables,
                key_accessor=key_accessor,
            ),
        )

    def get(self, *keys: str) -> 'StreamVariable[Any]':
        """
        Access a nested value within the stream's accumulated state.

        This is useful when the stream accumulates complex state (via snapshot/patch)
        and you want to access a specific part of it.

        Example::

            dashboard = StreamVariable(dashboard_stream, variables=[id_var])

            # Access nested value
            Text(dashboard.get('meta', 'count'))

        :param keys: One or more keys to traverse into the nested structure.
        :return: A new StreamVariable pointing to the nested path.
        """
        return self.model_copy(
            update={'nested': [*self.nested, *[str(k) for k in keys]]},
            deep=True,
        )

    @property
    def list_item(self):
        """
        Get a LoopVariable that represents the current item when iterating.

        This is used with the For component to access the current item in the loop.

        Example::

            For(items=events, renderer=EventCard(events.list_item))
        """
        from dara.core.interactivity.loop_variable import LoopVariable

        return LoopVariable()

    @model_serializer(mode='wrap')
    def ser_model(self, nxt: SerializerFunctionWrapHandler) -> dict:
        parent_dict = nxt(self)
        return {
            **parent_dict,
            '__typename': 'StreamVariable',
            'uid': str(parent_dict['uid']),
        }


@dataclass
class StreamVariableRegistryEntry:
    """Registry entry for a StreamVariable."""

    uid: str
    func: Callable[..., AsyncGenerator[StreamEvent, None]]
    variables: list[AnyVariable]
    key_accessor: str | None


class StreamVariableModeError(Exception):
    """Raised when a StreamEvent is used with the wrong mode (keyed vs custom)."""

    pass


# Event types that require key_accessor (keyed mode)
_KEYED_MODE_EVENT_TYPES = {'add', 'remove', 'replace', 'clear'}
# Event types for custom mode (no key_accessor)
_CUSTOM_MODE_EVENT_TYPES = {'json_snapshot', 'json_patch'}


def _validate_event_mode(event: StreamEvent, key_accessor: str | None) -> None:
    """
    Validate that the event type matches the StreamVariable mode.

    Raises StreamVariableModeError if:
    - Keyed mode event (add/remove/replace/clear) is used without key_accessor
    - Custom mode event (json_snapshot/json_patch) is used with key_accessor
    """
    event_type = event.type.value if hasattr(event.type, 'value') else str(event.type)

    if event_type in _KEYED_MODE_EVENT_TYPES and key_accessor is None:
        raise StreamVariableModeError(
            f'StreamEvent.{event_type}() requires key_accessor to be set on StreamVariable. '
            f"Either set key_accessor='your_id_field' on the StreamVariable, "
            f'or use StreamEvent.json_snapshot()/json_patch() for custom state mode.'
        )

    if event_type in _CUSTOM_MODE_EVENT_TYPES and key_accessor is not None:
        raise StreamVariableModeError(
            f'StreamEvent.{event_type}() is for custom state mode but key_accessor is set. '
            f'Either remove key_accessor from StreamVariable, '
            f'or use StreamEvent.add()/remove()/replace()/clear() for keyed mode.'
        )


async def run_stream(
    entry: StreamVariableRegistryEntry, request: Request, values: list[Any], store: CacheStore, task_mgr: TaskManager
):
    """Run a StreamVariable."""
    # dynamic import due to circular import
    from dara.core.internal.dependency_resolution import (
        resolve_dependency,
    )

    resolved_values = await asyncio.gather(*[resolve_dependency(v, store, task_mgr) for v in values])

    has_tasks = any(isinstance(v, BaseTask) for v in resolved_values)
    if has_tasks:
        raise NotImplementedError('StreamVariable does not support tasks')

    generator = None
    try:
        generator = entry.func(*resolved_values)
        async for event in generator:
            if await request.is_disconnected():
                break
            # Validate event type matches the StreamVariable mode
            _validate_event_mode(event, entry.key_accessor)
            yield f'data: {event.model_dump_json()}\n\n'
    except ReconnectException:
        yield f'data: {StreamEvent.reconnect().model_dump_json()}\n\n'
    except StreamVariableModeError as e:
        dev_logger.error('Stream mode error', error=e)
        yield f'data: {StreamEvent.error(str(e)).model_dump_json()}\n\n'
    except Exception as e:
        dev_logger.error('Stream error', error=e)
        yield f'data: {StreamEvent.error(str(e)).model_dump_json()}\n\n'
    finally:
        # Cleanup: close generator if it's still open
        if generator is not None:
            try:
                await generator.aclose()
            except Exception:
                pass
