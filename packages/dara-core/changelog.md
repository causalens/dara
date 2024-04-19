---
title: Changelog
---

## NEXT

-   **Backported** Fix an issue where internal requests did not handle auth errors properly so users would not immediately
be logged out when their session expired
-   **Backported** Fixed websocket reconnection logic so that it correctly retries for 10 seconds before bailing out and then retries the connection if the document becomes visible again.
-   **Backported** Internal (JS): implement a global `EventBus`, Dara internals now fire events to the EventBus which can be subscribed to.
Accompanying `EventCapturer` component can be wrapped around a part of the component tree to capture and handle these events.

## 1.7.7

-   Fixed an issue where `DataFrame`s with multiple indexes would fail to serialize correctly
-   Improved logging within the authentication system
-   Added the ability to handle chunked responses to internal dara messages used by the `WebsocketHandler.send_and_wait` method. The messages will be gathered into a list before being returned to the caller.

## 1.7.4

-   Added the ability to pass an asynchronous function to `ConfigurationBuilder.on_startup(...)`.
-   Fix an issue where `get_settings` would crash when attempting to generate a missing `.env` file. It now
    instead warns and falls back to using an in-memory set of default settings.
-   Fix an issue where the `BackendStore` would not respect existing value and overwrite it with the variable default,
    e.g. when an existing JSON file was present on disk with the `FileBackend`

## 1.7.3

-   Implement `FileBackend` for `BackendStore` in `dara.core.persistence` to allow for persistent file-based storage of `Variable` state in a JSON file
-   Add `scope` param to `BackendStore` which accepts either `'global'` or `'user'`. When scope=user, the store methods read/write/delete state for the current user only.
-   Add `get_all` to `BackendStore` to retrieve a key-value map of all state stored in the store. For user-scoped stores, this will be in the form of `{'user_id': 'value'}`; for global-scoped stores, this will be a dict of `{'global': 'value'}`
-   Resolve an issue with a previous fix to reconnect the websocket that prevented it from working on the 2nd/3rd/... times that the websocket was disconnected.

## 1.7.2

-   Fix an edge case where `Variable` state would not be initialized properly if previously registered under a different set of `RequestExtras`

## 1.7.1

-   Add defaults to `BackendStore` arguments - `uid` now defaults to a random UUID, `backend` defaults to `InMemoryBackend`
-   Add support for `BackendStore` in `config.add_registry_lookup`
-   Prevent `BackendStore` from serializing its backend implementation to the client
-   Internal: exclude `BackendStore` from being normalized
-   Internal: move `BackendStore` registration step from constructor to connected variable's constructor to allow for `RegistryLookup` to create another instance without registering
-   Internal (JS): fix `BackendStore` read requests not using custom `RequestExtras` provided in a context

## 1.7.0

-   Add `store` prop to (plain, i.e. non-derived/data) `Variable`. This enables customizing the "source of truth" for the `Variable`. By default it is stored in browser memory. In the initial implementation there is only one store available: `dara.core.persistence.BackendStore`. This enables making the variable server-side, where the client-side state is automatically synchronized with the backend state. The backend store accepts any backend implementation for storage, the initial implementation includes a simple `InMemoryBackend`.

Note that the details of the API such as methods and their signatures on the BackendStore or PersistenceBackend are subject to change as the feature is being developed and finalized.

```python
from dara.core import Variable
from dara.core.persistence import BackendStore, InMemoryBackend
from dara.components import Input

# Store have a unique identifier and a backend implementation for storage
collab_variable = Variable(default=1, store=BackendStore(uid='my_variable', backend=InMemoryBackend()))

# Input value will automatically be kept in sync 'live' for all users
Input(value=collab_variable)


# The store can be interacted with directly
store: BackendStore = collab_variable.store
# Write a new value to the store, all clients will be notified of the change
await store.write('new value')
# Read the current value from the store
value = await store.read()
```

-   Deps: upgrade FastAPI to `0.109.0`, fixes security vulnerability in `starlette` dependency

## 1.6.5

-   **Backported** Resolve an issue with a previous fix to reconnect the websocket that prevented it from working on the 2nd/3rd/... times that the websocket was disconnected.

## 1.6.3

-   Fix and issue where an error being thrown when processing a get_current_value request would crash the stream and prevent all future requests from being handled.

## 1.6.2

-   Fix an issue where `Node` is required even if the JS build is skipped explicitly via `--skip-jsbuild` flag
-   Fix an issue where the websocket connection was not properly recreated on reconnection

## 1.6.1

-   Address action execution blocking new requests due to an issue around BackgroundTask processing in starlette
-   Fix `get_current_value` not working for `DerivedDataVariable`

## 1.6.0

-   Fixed an issue where import discovery would consider the same symbols repeatedly causing it to run much longer than necessary
-   `suspend_render` setting on `fallback` provided to components is now inherited by all children of the component which the fallback is provided to, unless overriden by a different value.

## 1.5.3

-   Fixed an issue where the websocket channel would fail to be set correctly when using get_current_value after the user has reconnected their browser on a different websocket channel.

## 1.5.1

-   Fixed an issue where Local storage was not being cleared between sessions
-   Fixed an issue where the `@action` decorator would not work properly for instance methods, or class methods
-   Changed the session tie up to websocket channels to allow a single session to be tied to multiple channels
-   Add `--skip-jsbuild` cli flag, which skip the building JS assets process.

## 1.5.0

-   Internal (JS): added `RequestExtras` context to allow injecting additional e.g. headers into requests made by Dara in different parts of the component tree
-   Move import discovery warnings to the `--debug` logger

## 1.4.6

-   Added `execute_action` convenience function to `ActionCtx` to allow for executing an arbitrary `ActionImpl` instance. This can be useful in certain situations when an external API returns an action impl object to be executed, or for custom action implementations.
-   Internal: update `onUnhandledAction` API on `useAction` hook to be invoked for each action without a registered implementation rather than halting execution after the first unhandled action
-   The `--reload` flag on the `dara start` command will now correctly infer the parent directory of the module containing the configuration module in order to watch that directory for changes, rather than defaulting to the current working directory
-   Added `--reload-dir` flag which can be used multiple times to specify the exact folders to watch; when provided it will override the inferred watched directory

```
# Example structure
- decision-app/
    - decision_app/
        - main.py
        - pages/
        - utils/
    - pyproject.toml

# Will watch for changes in these directories: ['(...)/decision-app/decision_app']
dara start --reload
# Will watch for changes in these directories: ['(...)/decision-app/decision_app/pages']
dara start --reload-dir decision_app/pages
# Will watch for changes in these directories: ['(...)/decision-app/decision_app/utils', '(...)/decision-app/decision_app/pages']
dara start --reload-dir decision_app/pages decision_app/utils
```

-   Fixed an issue where the client app would refresh on WebSocket error&reconnect even without the `--reload` flag enabled
-   Moved WebSocket server-side errors to be displayed on the default dev logger rather than the opt-in `--debug` logger

## 1.4.5

-   Relax `python-dotenv` dependency from `^0.19.2` to `>=0.19.2`
-   Added `add_middleware` to `ConfigurationBuilder` to allow users to add custom middleware

## 1.4.4

-   Fixed an issue where the update action would fail if the updated variable was not already registered on the client. The action now registers the variable if it is not already registered.

## 1.4.3

-   `py_component` results are now normalized, which means multiple instances of the same variables within the returned components will be deduplicated. This should significantly reduce the amount of data sent over the wire in some cases.

## 1.4.2

-   Fixed an issue where `.get()` API on `Variable` would not behave correctly when used as the update target within actions (either legacy `UpdateVariable` or new `ActionCtx.update` method)

## 1.4.1

-   Fixed an issue where argument restoration for actions, derived variables and `py_component`s would attempt to restore a value to the annotated type even when the value was already of the correct type
-   Fixed an issue where Dara would fail to serialize responses including `NaN` or `inf` values, those are now serialized as `null` in the JSON response

## 1.4.0

-   Implement new action API in the form of the `@action` decorator. This decorator takes a function and returns an action that can be passed to a component's callback. It injects an `ActionCtx` object (aliased as `action.Ctx`) as the first argument of the function, which contains the input sent from the component and exposes action methods. This allows for full control over the action's behaviour, including the ability to conditionally execute specific actions with control flow, error handling etc. See the updated `actions` documentation page for more details on the new API and migration guide for the existing APIs.

```python
from dara.core import action, Variable
from dara.components import Select, Item

some_variable = Variable(1)
other_variable = Variable(2)

@action
async def my_action(ctx: action.Ctx, arg_1: int, arg_2: int):
    # Value coming from the component, in this case the selected item
    value = ctx.input
    # Your action logic...

    # Update `some_variable` to `value` multiplied by arg_1 and arg_2
    await ctx.update(variable=some_variable, value=value * arg_1 * arg_2)


Select(
    items=[Item(label='item1', value=1), Item(label='item2', value=2)],
    onchange=my_action(2, other_variable)
)
```

-   Added more shortcut actions for common operations, similar to existing `DerivedVariable.trigger()` - `AnyVariable.reset()`, `Variable.sync()`, `Variable.toggle()`, `Variable.update()`. See the updated `actions` documentation page for a full list of available actions.

-   Added `on_load` prop on the `ConfigurationBuilder.add_page` method. It accepts any valid action which will be executed as the page is loaded
-   **Deprecation Notice**: using `reset_vars_on_load` on `ConfigurationBuilder.add_page` is now deprecated, use `on_load` instead. The existing API will continue to work and will be removed in a future release.

-   **Deprecation Notice**: Passing in resolvers to the existing actions (`UpdateVariable`, `DownloadContent`, `NavigateTo`) is now deprecated and will be removed in a future release. The existing API should continue to work as-is, but users are encouraged to migrate to the new API.

## 1.3.1

-   Fixed usage of `resource` package which is not supported on Windows. Attempting to use `CGROUP_MEMORY_LIMIT_ENABLED` on Windows is now a noop and emits a warning.

## 1.3.0

-   Internal: allow handler implementation substitution for variables, `py_component`, upload resolver and action resolver on a registry entry level

## 1.2.3

-   **Backported** Fixed usage of `resource` package which is not supported on Windows. Attempting to use `CGROUP_MEMORY_LIMIT_ENABLED` on Windows is now a noop and emits a warning.

## 1.2.2

-   Fixed an issue where the default encoders for certain types such as `pandas.Timeseries`, `numpy.complex64` and `numpy.complex128` would output unserializable values

## 1.2.1

-   Fixed an issue where `DataVariable` would fail to initialize with data when created within a synchronous handler function

## 1.2.0

-   Introduced more granular cache configuration for Derived and Data variables. In addition to previously supported 'cache type' (i.e. `'global'`, `'session'`, `'user'` scopes as per `dara.core.CacheType` enum), you can now also specify a cache policy. Available cache policies are:

1. `keep-all` - previous default, keeps all cached values without clearing them. Useful for small-sized results that are used frequently, ideally with a known range of results. Should be used with caution for large-sized results.
2. `lru`: least-recently-used cache; can be configured to hold `max_size` values (globally or per user/session depending on `cache_type` set). This is the new default with `max_size=10`, as it will keep the most often accessed values in cache and discard the least often accessed ones.
3. `most-recent`: keeps only the most recent result in cache. Useful for situations where caching is generally not desired, but `most-recent` will still prevent re-computation on subsequent runs with the same inputs.
4. `ttl`: time-to-live cache; can be configured to hold values for `ttl` seconds. Useful for e.g. values which fetch from a remote resource where the results become stale/invalid after a certain amount of time.

```python
from dara.core import ConfigurationBuilder, Cache, Variable, DerivedVariable

config = ConfigurationBuilder()

# Assume we have a handler function that fetches data from a remote API
def fetch_weather_data(args):
    city, country_code = args
    response = requests.get(f"https://some-weather-api.example/weather?q={city},{country_code}")
    return response.json()

# Define the arguments as Variables
city = Variable(default="London")
country_code = Variable(default="GB")

# Use case: The weather data is likely to change every minute, so we set a TTL of 60 seconds
# This means that the weather data will be fetched from the remote API at most once every 60 seconds for a given city/country_code pair
dv_ttl = DerivedVariable(
    fetch_weather_data,
    variables=[city, country_code],
    cache=Cache.Policy.TTL(ttl=60)
)

# Assume we have a handler that takes a while to run and outputs a large amount of data
def expensive_computation(args):
    data = [i for i in range(1e10)]
    return data

# Defining input variables
input_var = Variable(default=1)

# Use case: The data is large, so we want to keep most relevant results in cache and evict least relevant ones, so we use LRU cache
# Only the 5 most recently accessed results (for each user!) will be kept in the cache to save space
expensive_dv = DerivedVariable(
    handler=expensive_computation,
    variables=[input_var],
    cache=Cache.Policy.LRU(max_size=5, cache_type=Cache.Type.USER)
)

# Backwards compatible - just specifying cache type using the enum or string will default to LRU with max_size=10
# These are equivalent:
some_dv = DerivedVariable(..., cache=Cache.Policy.LRU(cache_type=Cache.Type.USER))
some_dv = DerivedVariable(..., cache=Cache.Type.USER)
some_dv = DerivedVariable(..., cache='user')
```

## 1.1.9

-   Added serialize/deserialize support to numpy/pandas datatype
-   Added custom encoder support. User can add encoder to handle serialization/deserialization of a type

## 1.1.6

-   Internal: dedupe custom registry lookup calls

## 1.1.5

-   Lock `anyio` to `>=4.0.0`
-   Internal: added a ContextVar in the `dara.core.visual.dynamic_component` module to keep track of currently executed `py_component`

## 1.1.4

-   Fixed an issue where the sidebar logo path would be incorrect in embedded environments

## 1.1.3

-   Internal: added a ContextVar in the `any_variable` module to customize `get_current_value` behaviour.
-   Fixed `ComponentInstance`'s `__repr__` not being able to correctly serialize components in some cases

## 1.1.2

-   Internal: fix auth logic consistency in embedded environments

## 1.1.1

-   Exposed `DynamicComponent` as a Python class. Normally used under-the-hood by `@darajs/core` to render dynamic components, it can now be used directly in advanced use cases to serialize components and render them dynamically.

```python
from dara.core.visual.components import DynamicComponent
from dara.components import Text, DerivedVariable

derived_text = DerivedVariable(lambda: 'Hello World', variables=[])
text_cmp = Text(text=derived_text).dict()

config.add_page(name='Dynamic Render', content=DynamicComponent(component=text_cmp))
```

-   Experimental: added `config.add_registry_lookup` API. This is an experimental API that allows you to register a function that will be called when a certain registry is being accessed, meant to be use for advanced use cases where some registry data needs to be fetched from an external source.

## 1.1.0

-   Internal asset build system refactor, the generated build cache file now stores complete information required to run an asset build.
-   Fixed an issue where static assets were only being copied once when the output (e.g. `dist`) folder is created. They are now copied over at each server start.
-   Static assets are no longer copied over to the `static` folder before being copied into the output folder. The migration process now copies assets from each static folder directly into the output folder in the order the static folders were added.

## 1.0.1

-   Added custom websocket message support. Custom messages can be sent from custom JS components to the server and vice versa.

```python
from typing import Any
from dara.core import ConfigurationBuilder

config = ConfigurationBuilder()

config.add_ws_handler(kind='my_custom_type', handler=my_custom_handler)

# This will be called whenever a message of type 'my_custom_type' is received
def my_custom_handler(channel: str, message: Any):
    """
    channel: The channel the message was received on; unique to each client connection
    message: The content of the message received
    """
    print(f'Got message {message} on channel {channel}')
    # The reponse is sent back to the client
    return 'response'
```

```tsx
import { WebsocketCtx } from '@darajs/core';

function MyCustomComponent(props: any) {
    const { client } = useContext(WebsocketCtx);

    useEffect(() => {
        const sub = client.customMessages$().subscribe((message) => {
            // Handle custom messages from the server
            console.log('received message', message);
        });

        return () => {
            sub.unsubscribe();
        };
    }, [client]);

    const handleClick = () => {
        // Send a message to the server
        client.sendCustomMessage('my_custom_type', { some: 'content' });
    };
}
```

## 1.0.0-a.2

-   Added 'Built with Dara' to sidebars.
-   Removed extra dependency on `create-dara-app`

## 1.0.0-a.1

-   Initial release
