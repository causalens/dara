"""
StreamVariable E2E test page.

Tests both keyed mode and custom JSON mode streaming.
"""

import asyncio

from dara.components import Button, Card, Select, Stack, Text
from dara.core import For, ReconnectException, StreamEvent, StreamVariable, Variable, action
from dara.core.interactivity import ActionCtx


class _RefreshSignal:
    pass


class _RecoverableErrorSignal:
    pass


class _FatalErrorSignal:
    pass


REFRESH_SIGNAL = _RefreshSignal()
RECOVERABLE_ERROR_SIGNAL = _RecoverableErrorSignal()
FATAL_ERROR_SIGNAL = _FatalErrorSignal()


class KeyedModeBroadcaster:
    """Broadcaster for keyed mode tests."""

    def __init__(self):
        self.events: list[dict] = []
        self.counter = 0
        self.subscribers: list[asyncio.Queue] = []

    def reset_all(self):
        """Reset all state for test isolation. Broadcasts refresh to connected streams."""
        self.events = []
        self.counter = 0
        for queue in self.subscribers:
            queue.put_nowait(REFRESH_SIGNAL)

    def subscribe(self) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        self.subscribers.append(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue):
        if queue in self.subscribers:
            self.subscribers.remove(queue)

    def add_event(self, category: str) -> dict:
        self.counter += 1
        event = {
            'id': self.counter,
            'category': category,
            'message': f'Event #{self.counter}',
        }
        self.events.append(event)
        for queue in self.subscribers:
            queue.put_nowait(event)
        return event

    def remove_event(self, event_id: int):
        self.events = [e for e in self.events if e['id'] != event_id]
        for queue in self.subscribers:
            queue.put_nowait({'__remove__': event_id})

    def refresh(self):
        for queue in self.subscribers:
            queue.put_nowait(REFRESH_SIGNAL)

    def clear(self):
        self.events = []
        self.counter = 0
        self.refresh()

    def trigger_recoverable_error(self):
        for queue in self.subscribers:
            queue.put_nowait(RECOVERABLE_ERROR_SIGNAL)

    def trigger_fatal_error(self):
        for queue in self.subscribers:
            queue.put_nowait(FATAL_ERROR_SIGNAL)

    def get_events_list(self, category: str) -> list[dict]:
        return [e for e in self.events if e.get('category') == category]


class CustomModeBroadcaster:
    """Broadcaster for custom JSON mode tests."""

    def __init__(self):
        self.state = {'count': 0, 'items': {}, 'status': 'idle'}
        self.subscribers: list[asyncio.Queue] = []

    def reset_all(self):
        """Reset all state for test isolation. Broadcasts snapshot to connected streams."""
        self.state = {'count': 0, 'items': {}, 'status': 'idle'}
        for queue in self.subscribers:
            queue.put_nowait({'type': 'snapshot', 'data': self.state.copy()})

    def subscribe(self) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue()
        self.subscribers.append(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue):
        if queue in self.subscribers:
            self.subscribers.remove(queue)

    def increment_count(self):
        self.state['count'] += 1
        for queue in self.subscribers:
            queue.put_nowait(
                {'type': 'patch', 'data': [{'op': 'replace', 'path': '/count', 'value': self.state['count']}]}
            )

    def add_item(self, key: str, value: str):
        self.state['items'][key] = value
        for queue in self.subscribers:
            queue.put_nowait({'type': 'patch', 'data': [{'op': 'add', 'path': f'/items/{key}', 'value': value}]})

    def set_status(self, status: str):
        self.state['status'] = status
        for queue in self.subscribers:
            queue.put_nowait({'type': 'patch', 'data': [{'op': 'replace', 'path': '/status', 'value': status}]})

    def reset(self):
        self.state = {'count': 0, 'items': {}, 'status': 'idle'}
        for queue in self.subscribers:
            queue.put_nowait({'type': 'snapshot', 'data': self.state.copy()})

    def get_state(self) -> dict:
        return self.state.copy()


_keyed_broadcaster = KeyedModeBroadcaster()
_custom_broadcaster = CustomModeBroadcaster()


def stream_variable():
    """StreamVariable E2E test page."""

    # ==================== KEYED MODE ====================
    category_var = Variable('general')

    async def keyed_stream(category: str):
        queue = _keyed_broadcaster.subscribe()
        try:
            # Initial state
            initial_events = _keyed_broadcaster.get_events_list(category)
            yield StreamEvent.replace(*initial_events)

            while True:
                event = await queue.get()

                if isinstance(event, _RefreshSignal):
                    yield StreamEvent.replace(*_keyed_broadcaster.get_events_list(category))
                elif isinstance(event, _RecoverableErrorSignal):
                    raise ReconnectException()
                elif isinstance(event, _FatalErrorSignal):
                    raise ValueError('Fatal error occurred')
                elif event.get('__remove__'):
                    yield StreamEvent.remove(event['__remove__'])
                elif event.get('category') == category:
                    yield StreamEvent.add(event)
        finally:
            _keyed_broadcaster.unsubscribe(queue)

    keyed_events = StreamVariable(keyed_stream, variables=[category_var], key_accessor='id')

    @action
    async def add_keyed_event(ctx: ActionCtx, category: str):
        _keyed_broadcaster.add_event(category)

    @action
    async def remove_last_event(ctx: ActionCtx):
        if _keyed_broadcaster.events:
            last_id = _keyed_broadcaster.events[-1]['id']
            _keyed_broadcaster.remove_event(last_id)

    @action
    async def clear_keyed_events(ctx: ActionCtx):
        _keyed_broadcaster.clear()

    @action
    async def trigger_keyed_recoverable(ctx: ActionCtx):
        _keyed_broadcaster.trigger_recoverable_error()

    @action
    async def trigger_keyed_fatal(ctx: ActionCtx):
        _keyed_broadcaster.trigger_fatal_error()

    @action
    async def reset_keyed_test_state(ctx: ActionCtx):
        _keyed_broadcaster.reset_all()

    keyed_mode_section = Card(
        Stack(
            Button('Reset Keyed Test State', onclick=reset_keyed_test_state()),
            Stack(
                Text('Category:'),
                Select(items=['general', 'alerts'], value=category_var),
                direction='horizontal',
                hug=True,
            ),
            Stack(
                Button('Add Event', onclick=add_keyed_event(category_var)),
                Button('Remove Last', onclick=remove_last_event()),
                Button('Clear All', onclick=clear_keyed_events()),
                direction='horizontal',
                hug=True,
            ),
            Stack(
                Button('Recoverable Error', onclick=trigger_keyed_recoverable()),
                Button('Fatal Error', onclick=trigger_keyed_fatal()),
                direction='horizontal',
                hug=True,
            ),
            Text('Events:'),
            For(
                items=keyed_events,
                renderer=Stack(
                    Text(keyed_events.list_item.get('id')),
                    Text(keyed_events.list_item.get('message')),
                    direction='horizontal',
                    hug=True,
                ),
                key_accessor='id',
                placeholder=Text('No events'),
            ),
            hug=True,
        ),
        title='Keyed Mode',
    )

    # ==================== CUSTOM JSON MODE ====================

    async def custom_stream():
        queue = _custom_broadcaster.subscribe()
        try:
            yield StreamEvent.json_snapshot(_custom_broadcaster.get_state())

            while True:
                msg = await queue.get()
                if msg['type'] == 'snapshot':
                    yield StreamEvent.json_snapshot(msg['data'])
                elif msg['type'] == 'patch':
                    yield StreamEvent.json_patch(msg['data'])
        finally:
            _custom_broadcaster.unsubscribe(queue)

    custom_state = StreamVariable(custom_stream, variables=[])

    @action
    async def increment_count(ctx: ActionCtx):
        _custom_broadcaster.increment_count()

    @action
    async def add_item(ctx: ActionCtx, key: str):
        _custom_broadcaster.add_item(key, f'value-{key}')

    @action
    async def set_status(ctx: ActionCtx, status: str):
        _custom_broadcaster.set_status(status)

    @action
    async def reset_custom(ctx: ActionCtx):
        _custom_broadcaster.reset()

    @action
    async def reset_custom_test_state(ctx: ActionCtx):
        _custom_broadcaster.reset_all()

    item_key_var = Variable('a')
    status_var = Variable('active')

    custom_mode_section = Card(
        Stack(
            Button('Reset Custom Test State', onclick=reset_custom_test_state()),
            Stack(
                Button('Increment Count', onclick=increment_count()),
                Button('Reset', onclick=reset_custom()),
                direction='horizontal',
                hug=True,
            ),
            Stack(
                Text('Add Item Key:'),
                Select(items=['a', 'b', 'c'], value=item_key_var),
                Button('Add Item', onclick=add_item(item_key_var)),
                direction='horizontal',
                hug=True,
            ),
            Stack(
                Text('New Status:'),
                Select(items=['idle', 'active', 'error'], value=status_var),
                Button('Apply Status', onclick=set_status(status_var)),
                direction='horizontal',
                hug=True,
            ),
            Text('State:'),
            Stack(
                Text('Count:'),
                Text(custom_state.get('count')),
                direction='horizontal',
                hug=True,
            ),
            Stack(
                Text('Current Status:'),
                Text(custom_state.get('status')),
                direction='horizontal',
                hug=True,
            ),
            Stack(
                Text('Items:'),
                Text(custom_state.get('items')),
                direction='horizontal',
                hug=True,
            ),
            hug=True,
        ),
        title='Custom JSON Mode',
    )

    return Stack(keyed_mode_section, custom_mode_section)
