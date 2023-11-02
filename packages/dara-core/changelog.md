---
title: Changelog
---
## 1.2.4

-   **Backported:** Fix an issue where argument restoration for actions, derived variables and `py_component`s would attempt to restore a value to the annotated type even when the value was already of the correct type

## 1.2.3

-   Fixed usage of `resource` package which is not supported on Windows. Attempting to use `CGROUP_MEMORY_LIMIT_ENABLED` on Windows is now a noop and emits a warning.

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
