---
title: Stream Variables
---

# Stream Variables

Sometimes your application needs to display data that updates in real-time—live events, notifications, sensor readings, or progress from a long-running process. Instead of repeatedly asking the server "is there new data?" (polling), `StreamVariable` lets the server push updates to your app as they happen.

## How It Works

A `StreamVariable` opens a persistent connection to the server. When your Python code has new data, it sends it immediately to the browser. The browser accumulates these updates and your UI refreshes automatically.

Think of it like a news ticker: instead of refreshing the page to check for news, updates appear as soon as they're published.

## Basic Usage

A `StreamVariable` takes an async generator function that yields `StreamEvent`s:

```python
from dara.core import StreamVariable, StreamEvent, Variable
from dara.components import Stack, Text, For, Card

# Dependency variable - changing this restarts the stream
category = Variable('general')

async def events_stream(category: str):
    """Stream events filtered by category."""
    # Clear any existing items
    yield StreamEvent.clear()

    # Add initial events
    for event in await fetch_initial_events(category):
        yield StreamEvent.add(event)

    # Listen for new events (this runs until the stream closes)
    async for event in subscribe_to_events(category):
        yield StreamEvent.add(event)

# Create the StreamVariable
events = StreamVariable(
    events_stream,
    variables=[category],  # When category changes, stream restarts
    key_accessor='id',     # Unique identifier for each item
)

# Display the events
page = Stack(
    For(
        items=events,
        renderer=Card(
            Text(events.list_item.get('message'))
        ),
        key_accessor='id'
    )
)
```

When the user changes the `category` variable, the current stream closes and a new one opens with the new category value.

## Handling Reconnection (Important)

:::warning
Your stream function **must be idempotent**—it should produce the correct state even when called multiple times.
:::

Streams can disconnect and reconnect at any time:
- Network interruptions
- Browser tab going to sleep
- Server restarts or deployments
- Mobile devices switching networks

When this happens, your stream function runs again **from the beginning**. If your function isn't designed for this, users will see incorrect data (duplicates, missing items, or stale state).

### The Pattern

Always follow this pattern:

1. **Set initial state atomically** — Use `StreamEvent.replace()` or `StreamEvent.json_snapshot()` to set the full state in one update
2. **Stream live updates** — Then listen for new events

```python
async def events_stream(category: str):
    # 1. Set initial state atomically (no flash of empty content)
    initial_events = await fetch_events_from_database(category)
    yield StreamEvent.replace(*initial_events)

    # 2. Stream live updates
    async for event in subscribe_to_new_events(category):
        yield StreamEvent.add(event)
```

Using `replace()` instead of `clear()` + `add()` avoids a flash of empty content on reconnection—the UI atomically swaps to the new state.

This way, whether a user connects for the first time or reconnects after a network blip, they always end up with the correct state.

### Common Mistakes

```python
# BAD: No initial state - reconnection causes duplicates
async def bad_stream():
    async for event in subscribe():
        yield StreamEvent.add(event)

# BAD: Only streaming live events - reconnection loses history
async def also_bad_stream():
    yield StreamEvent.clear()
    async for event in subscribe():  # misses events that happened before connect
        yield StreamEvent.add(event)

# OK but has flash of empty content on reconnection:
async def ok_stream():
    yield StreamEvent.clear()
    for event in await get_all_events():
        yield StreamEvent.add(event)
    async for event in subscribe():
        yield StreamEvent.add(event)

# BEST: Atomic replace, then stream
async def good_stream():
    yield StreamEvent.replace(*await get_all_events())  # atomic, no flash
    async for event in subscribe():
        yield StreamEvent.add(event)
```

## Stream Events

`StreamEvent` is how you send data from your Python function to the browser. There are two modes depending on your use case.

### Keyed Mode (Lists of Items)

When your data is a collection of items with unique IDs (like events, users, or products), use keyed mode by setting `key_accessor` on your `StreamVariable`:

```python
events = StreamVariable(stream_func, variables=[...], key_accessor='id')
```

Then use these events in your stream function:

| Event | Description |
|-------|-------------|
| `StreamEvent.replace(*items)` | **Recommended for initial state.** Atomically replace all items—avoids flash of empty content. |
| `StreamEvent.replace()` | Clear all items (equivalent to `clear()` but explicit about intent). |
| `StreamEvent.add(item)` | Add or update an item. If an item with the same key exists, it's replaced. |
| `StreamEvent.add(item1, item2, ...)` | Add multiple items at once. |
| `StreamEvent.remove(key)` | Remove an item by its key. |
| `StreamEvent.remove(key1, key2, ...)` | Remove multiple items. |
| `StreamEvent.clear()` | Remove all items. |

```python
async def notifications_stream(user_id: str):
    # Set initial state atomically (recommended)
    initial_notifs = await get_notifications(user_id)
    yield StreamEvent.replace(*initial_notifs)

    # Listen for changes
    async for change in subscribe_to_changes(user_id):
        if change.type == 'new':
            yield StreamEvent.add(change.notification)
        elif change.type == 'read':
            # Update the notification (same key, new data)
            yield StreamEvent.add({**change.notification, 'read': True})
        elif change.type == 'deleted':
            yield StreamEvent.remove(change.notification_id)
```

### Custom State Mode (Arbitrary Data)

For more complex state that isn't a simple list, omit `key_accessor` and use JSON operations:

| Event | Description |
|-------|-------------|
| `StreamEvent.json_snapshot(data)` | Replace the entire state with new data. |
| `StreamEvent.json_patch(operations)` | Apply incremental changes using JSON Patch (RFC 6902). |

```python
async def dashboard_stream(dashboard_id: str):
    # Set initial state
    yield StreamEvent.json_snapshot({
        'metrics': {'users': 0, 'requests': 0},
        'status': 'initializing'
    })

    async for update in subscribe_to_metrics(dashboard_id):
        # Update specific fields without replacing everything
        yield StreamEvent.json_patch([
            {'op': 'replace', 'path': '/metrics/users', 'value': update.users},
            {'op': 'replace', 'path': '/metrics/requests', 'value': update.requests},
            {'op': 'replace', 'path': '/status', 'value': 'live'}
        ])

dashboard = StreamVariable(dashboard_stream, variables=[dashboard_id_var])

# Access nested values
Text(dashboard.get('status'))
Text(dashboard.get('metrics', 'users'))
```

## Accessing Nested Values

Use `.get()` to access nested properties in your stream's state:

```python
# For custom state mode
dashboard = StreamVariable(dashboard_stream, variables=[])

Text(dashboard.get('status'))              # Access 'status' field
Text(dashboard.get('metrics', 'users'))    # Access nested 'metrics.users'
```

## Using with `For` Component

`StreamVariable` works seamlessly with the `For` component for rendering lists:

```python
from dara.core import StreamVariable, StreamEvent, For
from dara.components import Stack, Text, Card

events = StreamVariable(events_stream, variables=[category], key_accessor='id')

page = Stack(
    Text('Live Events:'),
    For(
        items=events,
        renderer=Card(
            Stack(
                Text(events.list_item.get('title'), bold=True),
                Text(events.list_item.get('message')),
            )
        ),
        key_accessor='id',
        placeholder=Text('No events yet')
    )
)
```

## Broadcasting Updates

A common pattern is broadcasting updates to multiple connected clients. Here's a simple broadcaster using `asyncio.Queue`:

```python
import asyncio
from dara.core import StreamVariable, StreamEvent, Variable, action

class EventBroadcaster:
    def __init__(self):
        self._subscribers: set[asyncio.Queue] = set()
        self._events: list[dict] = []

    def subscribe(self) -> asyncio.Queue:
        queue = asyncio.Queue()
        self._subscribers.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue):
        self._subscribers.discard(queue)

    def broadcast(self, event: dict):
        self._events.append(event)
        for queue in self._subscribers:
            queue.put_nowait(event)

    def get_events(self) -> list[dict]:
        return self._events.copy()

# Global broadcaster instance
broadcaster = EventBroadcaster()

async def live_events_stream():
    queue = broadcaster.subscribe()
    try:
        # Send existing events
        yield StreamEvent.clear()
        for event in broadcaster.get_events():
            yield StreamEvent.add(event)

        # Wait for new events
        while True:
            event = await queue.get()
            yield StreamEvent.add(event)
    finally:
        broadcaster.unsubscribe(queue)

events = StreamVariable(live_events_stream, variables=[], key_accessor='id')

# Action to add a new event (broadcasts to all connected clients)
@action
async def add_event(ctx: action.Ctx):
    event = {'id': str(uuid.uuid4()), 'message': 'New event!', 'time': datetime.now().isoformat()}
    broadcaster.broadcast(event)
```

## Error Handling

Your stream function can encounter two types of errors:

### Recoverable Errors (ReconnectException)

For temporary issues—network timeouts, upstream service unavailable, connection drops—raise `ReconnectException`. The client will automatically retry with exponential backoff:

```python
from dara.core import ReconnectException

async def events_stream(category: str):
    yield StreamEvent.replace(*await get_initial_events(category))

    try:
        async for event in upstream_api.subscribe(category):
            yield StreamEvent.add(event)
    except ConnectionError:
        # Network issue - recoverable, trigger reconnect
        raise ReconnectException()
    except TimeoutError:
        # Upstream slow - recoverable
        raise ReconnectException()
```

### Fatal Errors (any other exception)

For permanent issues—invalid configuration, authentication failures, resource not found—raise a regular exception. The error message is shown to the user and the stream stops:

```python
async def events_stream(api_key: str):
    if not api_key:
        # Fatal - missing config, don't retry
        raise ValueError('API key is required')

    try:
        yield StreamEvent.replace(*await api.get_events())
        async for event in api.subscribe():
            yield StreamEvent.add(event)
    except AuthenticationError:
        # Fatal - bad credentials, don't retry
        raise ValueError('Invalid API credentials - check your settings')
    except ResourceNotFoundError:
        # Fatal - resource doesn't exist
        raise ValueError('The requested resource no longer exists')
```

The key distinction: use `ReconnectException` when retrying might succeed (transient issues), and regular exceptions when retrying won't help (permanent issues).

## Limitations

There are a few things to keep in mind:

- **No `run_as_task` DerivedVariables**: StreamVariable cannot depend on a `DerivedVariable` with `run_as_task=True`. Task-based variables resolve asynchronously which is incompatible with streaming.

- **No nested StreamVariables**: A StreamVariable cannot depend on another StreamVariable. If you need to combine streams, compose the generators in Python:

  ```python
  # Instead of StreamVariable depending on StreamVariable, compose generators:
  async def combined_stream(id):
      async for event in source_stream_a(id):
          yield StreamEvent.add(transform(event))
      async for event in source_stream_b(id):
          yield StreamEvent.add(transform(event))
  ```

## When to Use StreamVariable

Use `StreamVariable` when:

- Data updates frequently and users need to see changes immediately
- You're displaying live feeds, notifications, or real-time metrics
- You want to avoid polling overhead

Consider alternatives when:

- Data changes infrequently—use `DerivedVariable` with a `polling_interval` instead
- You need to fetch data once—use a regular `DerivedVariable`
- The data is user-specific and changes only on user action—use `Variable` or `DerivedVariable`
