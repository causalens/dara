---
title: Loading States
---

# Loading States

In many applications, there are moments when components need to wait for data or perform some other asynchronous operations. These scenarios, often referred to as "loading states," play a crucial role in an app's user experience. The framework provides a set of properties and components specifically designed for handling these loading states, ensuring that your application remains interactive and engaging, even when it's waiting for data.

## Fallback Components

Every component undergoes a "loading" state while it's fetching data or performing a calculation. To maintain a smooth user experience during this time, a fallback display is shown.

By default, every component, or the `@py_component` decorator, has the `Fallback.Default` component assigned to its `fallback` prop. This prop is optional – if you don't specify it, the default value is used.

The `fallback` prop can currently take one of three fallback components: `Fallback.Default`, `Fallback.Row` and `Fallback.Custom`.

- `Fallback.Default`: This fallback component is the default option. It occupies the entire height of the component's reserved space by default, maintaining the layout consistency while the component is loading data.

- `Fallback.Row`: This fallback component is designed to be the height of a single line of content, resembling the height of an input component, by default.

- `Fallback.Custom`: This fallback component accepts any other Dara component as its `component` prop. This allows you to specify a custom component to render while the component is loading data.

Both `Fallback.Default` and `Fallback.Row` can be styled [like any other component](./styling-components.md). This gives you the flexibility to customize the appearance of your component during its loading state, including tweaking their sizing and other styles.

```python
import anyio
from dara.core import Fallback, DerivedVariable, py_component
from dara.components import Text

async def get_data(ctx):
    await anyio.sleep(5)
    return 'Hello World'

derived_text = DerivedVariable(get_data, variables=[])

# Using the default fallback component, these two are equivalent
Text(derived_text)
Text(derived_text, fallback=Fallback.Default())

# Customizing the default fallback component, e.g. to only take half available space rather than all of it
Text(derived_text, fallback=Fallback.Default(width='50%', height='50%'))

# Using the row fallback component instead
Text(derived_text, fallback=Fallback.Row())

# Customizing the row fallback component, to fix its width in addition to the height
Text(derived_text, fallback=Fallback.Row(width='20ch'))

# Also works for a py_component
@py_component(fallback=Fallback.Row())
def my_component(name: str):
    return f'Hello World, {name}'
```

Alternatively, you can use the `Fallback.Custom` component to pass in a custom component:

```python
from dara.core import Fallback, py_component
from dara.components import Text

@py_component(fallback=Fallback.Custom(component=Text('Loading...')))
def my_component(name: str):
    return f'Hello World, {name}'
```

## Suspend Render

The `suspend_render`prop determines how the component behaves when it's waiting for new data to process and update its display. The behavior varies based on the value provided to the `suspend_render` prop:

- If `suspend_render` is set to `True`, the component will 'pause' its display and show the fallback component every time it's processing new data. Once the new data is ready, the component will update and display the new state.

- If `suspend_render` is set to `False`, the component will continue to show the current state while it's processing new data. The fallback component will only be displayed the first time the component is rendered and is waiting for initial data. This provides a seamless experience for users as the display doesn't change unless new data is ready. Note that this is not always desirable, as it can lead to stale data being displayed for a long time.

- If `suspend_render` is a positive number, it represents a threshold in milliseconds. The component will behave as if `suspend_render` is set to `False`, but if the new data isn't ready within the given timeout, it will 'pause' its display and show the fallback component.

For instance, let's assume `suspend_render` is set to `500` (milliseconds). This means the component will continue showing its current state for up to half a second while it's waiting for new data. If the new data isn't ready after half a second, the fallback component will be displayed until the data is ready.

In essence, the `suspend_render` prop provides a way to control how the component handles updates, and combined with tweaking the size of the fallback component ensures a smoother user experience.

```python
from dara.core import Fallback, py_component, DerivedVariable
from dara.components import Select

items = DerivedVariable(fetch_items, variables=[])

# Always suspend during state updates - loading state will always be shown
Select(items=items, fallback=Fallback.Row(suspend_render=True))

# Never suspend - loading state will only be shown on first render, afterwards stale old items will be shown
# while new ones are being fetched
Select(items=items, fallback=Fallback.Row(suspend_render=False))

# Suspend after 500ms - first show stale items, then loading state will only be shown if new items are not ready after 500ms
Select(items=items, fallback=Fallback.Row(suspend_render=500))

# Also available on py_components - will display previous py_component for 500ms while new one is being fetched
@py_component(fallback=Fallback.Default(suspend_render=500))
def my_component(items):
    return str(items)
```
