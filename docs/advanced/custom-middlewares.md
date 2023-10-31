---
title: Custom middlewares
---

The aim of this document is to show you how you can add custom middlewares to a Dara app.

## Defining a middleware

A middleware can be a custom class or a function. A simple middleware class could be defined as the following

```python
class CustomMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        # Do something before the request is processed
        response = await self.app(scope, receive, send)
        # Do something after the request is processed
        return response
```

As you can see, you simply need to define a class with a `__call__` method which takes the following arguments:

- `scope: dict` - the ASGI scope
- `receive: Callable` - the ASGI receive function
- `send: Callable` - the ASGI send function

The `__call__` method must return a response.

A middleware can also be a simple function. Such a middleware function could be defined as the following

```python
async def custom_middleware(request, call_next):
    # Do something before the request is processed
    response = await call_next(request)
    # Do something after the request is processed
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
