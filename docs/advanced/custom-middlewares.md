---
title: Custom middlewares
---

The aim of this document is to show you how you can add custom middlewares to a Dara app.
You may want to add custom middlewares to a Dara app to add some custom logic to the request/response processing pipeline.
You can read more about Middlewares in [the FastAPI documentation](https://fastapi.tiangolo.com/tutorial/middleware/)
and also [advanced middlewares](https://fastapi.tiangolo.com/advanced/middleware/).

## Defining a middleware

A middleware can be a custom class or a function.
For example, a simple middleware class that enforces that all incoming requests must be `https` could be defined as the following.

```python
from starlette.datastructures import URL
from starlette.responses import RedirectResponse
from starlette.types import ASGIApp, Receive, Scope, Send

class CustomHTTPSRedirectMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] in ("http") and scope["scheme"] in ("http"):
            url = URL(scope=scope)
            netloc = url.hostname if url.port in (80, 443) else url.netloc
            url = url.replace(scheme='https', netloc=netloc)
            response = RedirectResponse(url, status_code=307)

            await response(scope, receive, send)
        else:
            await self.app(scope, receive, send)

```

As you can see, you simply need to define a class with a `__call__` method which takes the following arguments:

- `scope: dict` - the ASGI scope
- `receive: Callable` - the ASGI receive function
- `send: Callable` - the ASGI send function

The `__call__` method must return a response.

A middleware can also be a simple function.
For example,a simple middleware function that calculates the processing time of a request and sets it in the headers could be defined as the following.

```python
import time
from fastapi import Request

async def custom_middleware(request: Request, call_next):
    start_time = time.time()

    response = await call_next(request)

    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)

    return response
```

As you can see, you simply need to define a function which takes the following arguments:

- `request: Request` - the request object
- `call_next: Callable` - the next middleware in the chain

The function must return a response.

## Registering a middleware

A custom middleware can be added to a Dara app by using the `add_middleware` method of the `ConfigurationBuilder`. This method takes the following arguments:

- `middleware: Union[type, Callable]` - the middleware to add, which can be a class or a function
- `options: dict = None` - the optional keyword arguments to pass to the middleware

The following example shows how to add a custom middleware to a Dara app

```python
from dara.core.config import ConfigurationBuilder
from my.custom.middleware import CustomMiddlewareClass, custom_middleware_function

config = ConfigurationBuilder()
config.add_middleware(CustomMiddleware)
config.add_middleware(custom_middleware_function)
```
