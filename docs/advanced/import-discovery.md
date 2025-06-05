---
title: Import Discovery
---

In order to use components or actions within your app, they have to be registered in your app configuration ahead of time. This is because the Dara framework needs to be able to install the required JavaScript packages. Registering the components manually, while possible, is a tedious task.

```python
from dara.core import ConfigurationBuilder
from dara.components import Text

config = ConfigurationBuilder()

# repeat for any component used ...
config.add_component(Text)
```

Fortunately, this is not necessary in the vast majority of cases, as Dara has an `import discovery system` to register the components for you.

## How it works

When running a Dara app (e.g. via `dara start` CLI), all globals available in the root module (the module containing `ConfigurationBuilder`) are scanned. Any components and actions found are collected and automatically registered in your application.

In addition, the source module of any global is inspected - that means we can recurse into that module to discover other components required if:

- the source module is a sub-module of the project (e.g. imagine an import from test_dara.submodule to test_dara.main),
- the global in question is decorated with `@py_component` or `@discover` - more on why that's required in the caveats section

In any other cases the source modules are not scanned. This is to prevent Dara from having to scan all of the modules which would have a severe performance penalty.

## Caveats

While the import discovery algorithm works in the majority of simple cases, there are edge cases where some components would not be discovered in a more naive implementation. This section is mostly useful for library authors creating extensions, plugins, or other 3rd party Dara packages.

1. Component dependencies

There are cases where a component utilizes other components in a way that is not visible to the import discovery algorithm. As an example, imagine a Button component using Text in its initializer:

```python
class Button(ComponentInstance):
    def __init__(child, ...):
        if isinstance(child, str):
            child = Text(child)
```

Similarly, function components can use other components:

```python
def functional_component(...) -> Stack:
    return Stack(Text(...), ...)

@py_component
def dynamic_component(...) -> Stack:
    return Stack(Text(...), ...)
```

If these code snippets are placed in a sub-module of the project, the module would be scanned since all sub-modules are always considered in the algorithm.
In the case of defining those components in an external package, import discovery algorithm would not pick up and register `Text` component, resulting in an error.

This is why the second recursion condition was introduced. `@py_component` decorators will make the discovery algorithm scan their source module by default. For the cases of other components the `@discover` decorator was introduced

```python
from dara.core.definitions import discover

@discover
class Button(ComponentInstance):
    def __init__(child, ...):
        if isinstance(child, str):
            child = Text(child)

@discover
def functional_component(...) -> Stack:
    return Stack(Text(...), ...)
```

As a rule of thumb, if you are developing a reusable Dara package you should mark any components which depend on other components with the `@discover` decorator.

2. Local JS components

Local JS components (or actions) are not handled by the import discovery algorithm. They have to be explicitly registered with:

```python
class LocalComponent(ComponentInstance):
    ...

config.add_component(LocalComponent, local=True)
```

The local flag marks the component as a local one, meaning it does not need to define the `js_module` field - this is normally required to defined the `npm` JavaScript package containing the component implementation. This is because the local module is defined via the `dara.config.json` file. This is described in detail in the [custom JS page](./custom-js.mdx).

3. Importing component *instances*

In some cases, you may want to import a component instance from another module, e.g.

```python
# file: my_project/my_component.py
from dara.components import UploadDropzone

dropzone = UploadDropzone()

# file: my_project/main.py
from dara.core import ConfigurationBuilder
from .my_component import dropzone

config = ConfigurationBuilder()
config.add_page(name='Upload Dropzone', content=dropzone)
```

This is supported, and import discovery will pick up that `dropzone` is an instance of `UploadDropzone` and register it in the app.
It will not, however, recurse into the `my_component.py` module to discover any other components. In general it is recommended to instead define components or parts of the page as functions and import those:

```python
# file: my_project/my_component.py
def dropzone() -> UploadDropzone:
    return UploadDropzone()

# file: my_project/main.py
from dara.core import ConfigurationBuilder
from .my_component import dropzone

config = ConfigurationBuilder()
config.add_page(name='Upload Dropzone', content=dropzone())
```
