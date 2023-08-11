---
title: Changelog
---

## NEXT

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
