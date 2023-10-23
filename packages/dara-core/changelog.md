---
title: Changelog
---

## 1.1.11

-   **Backported**: Fix an issue where argument restoration for actions, derived variables and `py_component`s would attempt to restore a value to the annotated type even when the value was already of the correct type
-   **Backported**: Fixed an issue where the default encoders for certain types such as `pandas.Timeseries`, `numpy.complex64` and `numpy.complex128` would output unserializable values

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
