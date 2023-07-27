---
title: Custom API Endpoints
---

The aim of this document is to show you how you can add custom endpoints to a Dara app.

## Defining an endpoint

To add a custom endpoint to your app you must create a handler function. A simple endpoint could be defined as the following

```python
from dara.core.http import get

@get('custom/')
def custom_handler():
    return 'Hello World'
```

:::tip

This endpoint could also be made `async`. To learn when this could be useful check out the [`FastAPI` Concurrency Docs](https://fastapi.tiangolo.com/async/#in-a-hurry).

:::

As you can see, you simply need to define a function to be executed by a request and add a decorator from `dara.core.http` module with the desired HTTP method - `get`, `patch`, `post`, `put` or `delete`. To learn more about HTTP requests and route handlers in `FastAPI` in general, check out the [`FastAPI` Tutorial](https://fastapi.tiangolo.com/tutorial/first-steps/#step-3-create-a-path-operation).

The decorators take the following arguments:

- `url: str` - path under which the endpoint will be available
- `dependencies: List[DependsType] = []` - list of [FastAPI dependencies](https://fastapi.tiangolo.com/tutorial/dependencies/)
- `authenticated: bool = True` - flag which when `True` adds necessary dependencies to `dependencies` to make the endpoint secure

## Registering an endpoint

There are two ways an endpoint can be registered in a Dara application.

### Implicit registration

A component can depend on an endpoint to function correctly. An example of such a component is the `dara.components.common.dropzone.UploadDropzone` component from the `dara-components`. It relies on an upload endpoint. This is defined as the following

```python
from dara.core.http import post

@post('/upload')
def upload(...):
    ...
```

```python
from dara.core.endpoints import upload

class UploadDropzone(ComponentInstance):
    required_routes = [upload]
```

The app will automatically include the required endpoints if the component is registered with the application, either explicitly or via the [import discovery process](./import-discovery.md).

### Explicit registration

There are cases where you need an endpoint for other reasons than for a component to use, for example to use programmatically from another application or from a Jupyter notebook.
In those cases you can explicitly register the endpoint in your app with `config.add_endpoint`.

```python title=main.py
from dara.core import ConfigurationBuilder
from dara.core.endpoints import upload

config = ConfigurationBuilder()
config.add_endpoint(upload)
```

## Endpoint configuration

There are times where the endpoint you create needs to access some values configured by the user, for example file paths. This can be achieved using `dara.core.definitions.EndpointConfiguration` classes.

```python
from dara.core.definitions import EndpointConfiguration

class GreetingsConfiguration(EndpointConfiguration):
    country: str

    @classmethod
    def default(cls):
        return cls(country='United Kingdom')
```

An endpoint configuration is a simple data class with properties which can be specified by the user. It also supports an optional `default` class method. When provided, the configuration
will be made optional, and the default implementation will be used if user does not provide a custom configuration instance.

```python title=main.py
from dara.core import ConfigurationBuilder
from dara.core.http import get

config = ConfigurationBuilder()

@get('/greetings')
def greetings_handler(config: GreetingsConfiguration):
    return f'Hello from {config.country}'


config.add_endpoint(greetings_handler)
```

The code above will add a `/greetings` endpoint, which will always return `Hello from United Kingdom`.
In order to customize the response a user could provide a configuration object:

```python title=main.py
from dara.core import ConfigurationBuilder
from dara.core.http import get

config = ConfigurationBuilder()

@get('/greetings')
def greetings_handler(config: GreetingsConfiguration):
    return f'Hello from {config.country}'

config.add_configuration(GreetingsConfiguration(country='USA'))
config.add_endpoint(greetings_handler)
```

With the code above the endpoint will instead always return `Hello from USA`.

What happens under the hood? Whenever the endpoint is ran, Dara will try to find configuration instances for each parameter annotated with an `EndpointConfiguration` subclass. If there is a custom instance provided by the user, it will be injected into the function. Otherwise Dara will try to run the `default()` method on the configuration class. This will result in a `NotImplementedError` if such function is not defined.

## Accessing user data

If an endpoint is authenticated, it is possible to access current user or session data inside the endpoint handler.

```python
from dara.core.auth import USER, SESSION
from dara.core.http import get

@get('/custom')
def custom_handler():
    # Both will be `None` if the endpoint is not secured
    user_data = USER.get()
    session_id = SESSION.get()
    ...
```
