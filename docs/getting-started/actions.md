---
title: Actions
---

Actions are a way to add interactivity to your Dara app in response to some user interaction. Components accept actions as arguments to their callbacks annotated with type `Action`, usually named `onclick`, `onchange` or similar. Actions can be used to update variables, trigger notifications, navigate to a different page, and more.

A valid argument to an action parameter is one of the following three options:

- An instance of an `@action`-decorated function (as in the example above).
- An instance of an individual static action object.
- A list of a combination of the above two options.

In this section you will learn all the different ways to create actions and how to use them.

## `@action` decorator

The primary way to create actions in Dara is the `@action` decorator. This decorator takes a function and returns an action that can be passed to a component's callback.
It injects an `ActionCtx` object as the first argument of the function, which contains the input sent from the component and exposes action methods to update the state of the application.

:::note

The action methods on `ActionCtx` are `async` and must be `await`-ed, so your decorated function should be `async` as well.
To learn more about `async` and `await` in Python, check out [this blogpost](https://realpython.com/async-io-python/).

:::

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

The example above shows how to use the `@action` decorator to create an action that updates a `Variable` with the value of the selected item in a `Select` component multiplied by the static `2` argument and current value of `other_variable`.

Similarly to `py_component`s, the `@action`-decorated function can take a mixture of regular Python variables and Dara `Variable`-based arguments in any combination. The `@action` decorator will automatically resolve the `Variable`-based arguments so your function will receive the current value of the `Variable` instead of the `Variable` instance.

The `ActionCtx` instance injected into the decorated function has the following attributes:

### `input`

`input` represents the value coming from the component. Differs depending on the component which the action is attached to. For example, for a `Select` component it is the value of the selected item, for `Button` it will always be `None`.

### `update`

```python
async def update(
    variable: Variable | UrlVariable | DataVariable,
    value: Any
)
```

`update` is a method to trigger an update of a `Variable`, `DataVariable` or `UrlVariable`. It takes the following arguments:

- `variable` - a `Variable`, `DataVariable` or `UrlVariable` instance to update with a new value upon triggering the action
- `value` - the new value to update the `Variable`, `DataVariable` or `UrlVariable` with

Note that the value passed to `update` must be a valid value for the variable type. In particular, updating a `DataVariable` should be done with a `pandas.DataFrame` instance or `None`.

To see how `update` works, consider the example below:

```python
from dara.core import action, ConfigurationBuilder, Variable
from dara.components import Button, Stack, Text

config = ConfigurationBuilder()

my_var = Variable(5)

@action
async def increment(ctx: action.Ctx, previous_value: int):
    await ctx.update(variable=my_var, value=previous_value + 1)

def test_page():
    return Stack(
        Text(my_var),
        Button(
            'Add One',
            onclick=increment(my_var)
        ),
    )

config.add_page(name='Increment Variable', content=test_page())
```

The example's action is the function `increment` and it takes the current value of the Variable and adds one to it, assuming it is an integer. If you were to click on the button, the `Variable`'s value would be updated to six.
The action is called with `my_var` as an argument, which means the current `my_var` value will be available as `previous_value` within the `increment` function body.

For simple cases check out [update](#daracoreinteractivityplain_variablevariableupdate), [toggle](#daracoreinteractivityplain_variablevariabletoggle) and [sync](#daracoreinteractivityplain_variablevariablesync) shortcut actions.

### `trigger`

```python
async def trigger(
    variable: DerivedVariable,
    force: bool = True
)
```

`trigger` is a method to force a recalculation of a `DerivedVariable`. It takes the following arguments:

- `variable` - a `DerivedVariable` instance to force a recalculation of,
- `force` - a boolean indicating whether to force a recalculation of the `DerivedVariable` even if its dependencies have not changed

To see how `trigger` works, consider the following example:

```python

from dara.core import action, ConfigurationBuilder, Variable, DerivedVariable
from dara.components import Input, Stack, Button, Text

config = ConfigurationBuilder()

my_var = Variable(1)
der_var = DerivedVariable(lambda x: float(x) ** 2 , variables=[my_var], deps=[])

@action
async def trigger_my_var(ctx: action.Ctx):
    await ctx.trigger(variable=my_var)

def test_page():
    return Stack(
        # Display variable
        Stack(Text('Value:'), Input(value=my_var), direction='horizontal'),

        # When clicking this button der_var syncs and calculates latest the
        Button('Trigger Derived Variable', onclick=trigger_my_var()),
        Stack(Text('Value Squared:'), Text(der_var), direction='horizontal'),
    )


config.add_page(name='Trigger Variable', content=test_page())

```

In the above example, the value of the variable passed to Input component is squared only when the 'Trigger Derived Variable' button is clicked.

For simple cases check out [trigger](#daracoreinteractivityderived_variablederivedvariabletrigger) shortcut action.

### `reset_variables`

```python
async def reset_variables(
    variables: List[AnyVariable] | AnyVariable
)
```

`reset_variables` is a method to reset any variable, or a list of variables to its default value. It takes the following arguments:

- `variables` - a variable or a list of any of these to reset to its default value

See the following example:

```python
from dara.core import action, ConfigurationBuilder, Variable
from dara.components import Stack, Button, Text

config = ConfigurationBuilder()

my_var = Variable(0)

@action
async def increment(ctx: action.Ctx, previous_value: int):
    await ctx.update(variable=my_var, value=previous_value + 1)

@action
async def reset(ctx: action.Ctx):
    await ctx.reset_variables(variables=my_var)

def test_page():
    return Stack(
        Text(my_var),
        # when clicked, 1 is added to my_var
        Button('Add', onclick=increment(my_var)),
        # when clicked my_var goes back to its initial value: 0
        Button('Reset', onclick=reset()),
    )

config.add_page(name='Reset Variable', content=test_page())
```

For simple cases check out [reset](#daracoreinteractivityany_variableanyvariablereset) shortcut action.

### `notify`

```python
async def notify(
    message: str,
    title: str,
    status: NotificationStatusString | NotificationStatus,
    key: str | None = None
)
```

`notify` is a method to display a notification toast on the client. It takes the following arguments:

- `message` - the message to display in the notification
- `title` - the title of the notification
- `status` - the status of the notification, can be one of members of the `NotificationStatus` enum or its string value
- `key` - a unique key for the notification, if not provided the title will be used as such; used to uniquely identify notifications to prevent the same notification from being displayed multiple times

See the following example:

```python
from dara.core import action, ConfigurationBuilder

from dara.components import Stack, Button

config = ConfigurationBuilder()

@action
async def notify(ctx: action.Ctx):
    await ctx.notify(message='This is the notification message', title='Example', status='SUCCESS')

def test_page():
    return Stack(
        Button(
            'Notify',
            onclick=notify()
        )
    )


config.add_page(name='Notify Example', content=test_page())
```

### `navigate`

```python
async def navigate(
    url: str,
    new_tab: bool = False
)
```

`navigate` is a method to navigate to a new URL. It takes the following arguments:

- `url` - the URL to navigate to
- `new_tab` - a boolean indicating whether to open the URL in a new tab

See the following example:

```python
from dara.core import action, ConfigurationBuilder, Variable
from dara.components import Stack, Button, Select

config = ConfigurationBuilder()

@action
async def navigate_static(ctx: action.Ctx):
    # passing url as a static string
    await ctx.navigate(url='/another-page')

def test_page():
    return Stack(
        Button('Go to Another Page', onclick=navigate_static()),
    )

@action
async def navigate_dynamic(ctx: action.Ctx):
    # using the selected value as the url
    await ctx.navigate(url=ctx.input)

def another_page():
    # passing url as a function based on component value
    return Stack(
        Select(
            value=Variable('/test-page'),
            items=['/test-page', '/another-page', 'https://www.google.com/'],
            onchange=navigate_dynamic(),
        )
    )


config.add_page(name='Test Page', content=test_page())
config.add_page(name='Another Page', content=another_page())
```

In the example above, on 'Test Page', clicking on a button 'Go to Another Page' takes you to the 'Another Page' page. This demonstrates how you can pass a static URL to the `navigate` action method. On the 'Another Page' page, you can see how to control `navigate` by using a dynamic URL - in this case the selected value of a `Select` component.

### `logout`

```python
async def logout()
```

`logout` is a method to log the user out of the application. It takes no arguments.
It is a shortcut for `navigate('/logout')`.

### `download_file`

```python
async def download_file(
    path: str,
    cleanup: bool = False
)
```

`download_file` is a method to download a file from the server. It takes the following arguments:

- `path` - the path to the file to download
- `cleanup` - a boolean indicating whether to delete the file after it has been downloaded

See the following example:

```python
import os
import pandas
from dara.core import action, ConfigurationBuilder, DataVariable
from dara.components import Button, Stack
from dara.core.definitions import ComponentInstance

# generate data, alternatively you could load it from a file
df = pandas.DataFrame(data={'x': [1, 2, 3], 'y':[4, 5, 6]})
my_var = DataVariable(df)

config = ConfigurationBuilder()


@action
async def download_csv(ctx: action.Ctx, data: pandas.DataFrame):
    # Assume write_file creates a file based on the data and returns the path to it
    file_path = write_file(data)
    # The file will be downloaded to the client and deleted from the server afterwards
    await ctx.download_file(path=file_path, cleanup=True)

def test_page() -> ComponentInstance:
    return Stack(
        Button(
            'Download File', onclick=download_csv(my_var)
        ),
    )


config.add_page(name='Download Content', content=test_page)
```

### `download_variable`

```python
async def download_variable(
    variable: AnyVariable,
    file_name: str | None = None,
    type: Literal['csv', 'xlsx', 'json'] = 'csv'
)
```

`download_variable` is a method to download the content of a variable as a file. It takes the following arguments:

- `variable` - the variable to download
- `file_name` - the name of the file to download, if not provided will default to `Data`
- `type` - the type of the file to download, can be one of `csv`, `xlsx` or `json`

:::note

The variable content must be a valid value for the given type.

:::

See the following example:

```python
from dara.core import action, ConfigurationBuilder, Variable
from dara.components import Stack, Button

config = ConfigurationBuilder()

my_var = Variable('example')

@action
async def download(ctx: action.Ctx):
    await ctx.download_variable(variable=my_var, file_name='test_file', type='json')

def test_page():
    return Stack(
        Button(
            'Download Variable',
            onclick=download(),
        )
    )


config.add_page(name='Download Variable', content=test_page())
```

## Shortcut actions

Shortcut actions are convenience methods on variable instances that can be used to perform common actions.
Beside being more concise and easier to read, they are also more performant as they do not require a roundtrip to the server in order
to execute the `@action`-annotated function.

:::warning

The shortcut actions simply return an action object, they do not execute the action. In order to execute the action you must pass it to a component's callback.

For this reason shortcut actions should not be used within an `@action`-annotated function. Attempting to do so will raise an exception.

:::

The following shortcut actions are available:

### `dara.core.interactivity.any_variable.AnyVariable.reset`

`reset` is a convenience method to reset the given variable to its default value.

See the following example:

```python
from dara.core import action, ConfigurationBuilder, Variable
from dara.components import Stack, Button, Text

config = ConfigurationBuilder()

my_var = Variable(0)

@action
async def reset_action(ctx: action.Ctx):
    await ctx.reset_variables(variables=my_var)

def test_page():
    return Stack(
        Text(my_var),
        Button('Reset @action', onclick=reset_action()),
        Button('Reset Shortcut', onclick=my_var.reset()),
    )

config.add_page(name='Reset Variable', content=test_page())
```

In the above example, the `Reset @action` button and the `Reset Shortcut` button have the same functionality - both reset the `my_var` variable to its default value.

### `dara.core.interactivity.plain_variable.Variable.sync`

`sync` is a convenience method to update a given `Variable` with the value sent by the component it is attached to.

```python
from dara.core import action, Variable
from dara.components import Select, Item

some_variable = Variable()
items=[Item(label='item1', value=1), Item(label='item2', value=2)],

@action
async def sync_action(ctx: action.Ctx):
    await ctx.update(variable=some_variable, value=ctx.input)

# Long form
Select(
    items=items,
    onchange=sync_action()
)
# Short form
Select(
    items=items,
    onchange=some_variable.sync()
)
```

In the above example, the `sync_action` action and the `sync` shortcut action have the same functionality - both update the `some_variable` variable with the value of the selected item in the `Select` component.
Note that if you would like to transform the value coming from the component before updating the variable, you should use the `@action` decorator instead.

:::tip

This method is also available for `UrlVariable` in addition to `Variable`.

:::

### `dara.core.interactivity.plain_variable.Variable.update`

`update` is a convenience method to update a given `Variable` with a new static value.

```python
from dara.core import action, Variable
from dara.components import Button

var = Variable(default=False)

@action
async def manual_action(ctx: action.Ctx):
    await ctx.update(variable=var, value=True)

Button('set to True', onclick=manual_action())
Button('set to True', onclick=var.update(value=True))
```

In the above example, the `manual_action` action and the `update` shortcut action have the same functionality - both update the `var` variable with the value `True`.
The shortcut action is useful in scenarios where you want to update a variable with a static value, without the need to compute it in an `@action`-annotated function.

:::tip

This method is also available for `UrlVariable` and `DataVariable` in addition to `Variable`.

:::

### `dara.core.interactivity.plain_variable.Variable.toggle`

`toggle` is a convenience method to toggle a given `Variable` between `True` and `False`.

```python
from dara.core import action, Variable
from dara.components import Button

var = Variable(default=False)

@action
async def toggle_action(ctx: action.Ctx, var_value: boolean):
    await ctx.update(variable=var, value=not var_value)

Button('toggle', onclick=toggle_action(var))
Button('toggle', onclick=var.toggle())
```

In the above example, the `toggle_action` action and the `toggle` shortcut action have the same functionality - both toggle the `var` variable between `True` and `False`.

:::tip

This method is also available for `UrlVariable` in addition to `Variable`.

:::

### `dara.core.interactivity.derived_variable.DerivedVariable.trigger`

`trigger` is a convenience method to trigger a recalculation of a given `DerivedVariable`.

```python
from dara.core import action, ConfigurationBuilder, Variable, DerivedVariable
from dara.components import Input, Stack, Button, Text

config = ConfigurationBuilder()

my_var = Variable(1)
der_var = DerivedVariable(lambda x: float(x) ** 2 , variables=[my_var], deps=[])

@action
async def trigger_my_var(ctx: action.Ctx):
    await ctx.trigger(variable=der_var)

def test_page():
    return Stack(
        # Display variable
        Stack(Text('Value:'), Input(value=my_var), direction='horizontal'),
        Stack(Text('Value Squared:'), Text(der_var), direction='horizontal'),
        Button('Trigger Derived Variable', onclick=trigger_my_var()),
        Button('Trigger shortcut', onclick=der_var.trigger()),
    )


config.add_page(name='Trigger Variable', content=test_page())
```

In the above example, the `trigger_my_var` action and the `trigger` shortcut action have the same functionality - both trigger a recalculation of the `der_var` variable.

:::tip

This method is also available for `DerivedDataVariable` in addition to `DerivedVariable`.

:::

## Action implementation objects

Action implementation objects are instances of an `ActionImpl` subclass. Under the hood, the shortcut actions simply return the corresponding action implementation object. The `ActionCtx` methods are also implemented by sending an implementation object to the client, which then executes the action.

You can use action implementation objects directly in few cases as a shortcut if it is not covered by the shortcut actions presented above.
As an example, you could use the `NavigateToImpl` to navigate to a static URL:

```python
from dara.core import NavigateToImpl
from dara.components import Button

Button('navigate', onclick=NavigateToImpl(url='/static-page'))
```

This allows Dara to skip the roundtrip to the server to execute the action, which is more performant.

The following action implementation objects are available:

- `dara.core.interactivity.actions.UpdateVariableImpl`
- `dara.core.interactivity.actions.TriggerVariable`
- `dara.core.interactivity.actions.NavigateToImpl`
- `dara.core.interactivity.actions.Logout` - shortcut for `NavigateToImpl(url='/logout')`
- `dara.core.interactivity.actions.ResetVariables`
- `dara.core.interactivity.actions.Notify`
- `dara.core.interactivity.actions.DownloadContentImpl`
- `dara.core.interactivity.actions.DownloadVariable`

:::info

Few of the actions above are called with the `-Impl` suffix. This is because the original names are reserved for the deprecated action API. Once the deprecated API is removed, the suffixes will be removed - as an example `UpdateVariableImpl` will become `UpdateVariable`.

See the [Deprecated action API](#deprecated-action-api) section for more details.

:::

## Composing actions

As mentioned above, an action can be one of the following:

- An instance of an `@action`-decorated function.
- An instance of an individual static action object.
- A list of a combination of the above two options.

This means that one way you can compose actions by passing a list of actions to a component's callback. The actions will be executed in the order they are passed to the callback.

```python
from dara.core import action, Variable
from dara.components import Button

var = Variable(default=0)

@action
async def action1(ctx: action.Ctx, previous_value: int):
    await ctx.update(variable=var, value=1)


# Mixing an @action-annotated action with shortcut actions/action implementation objects
Button('composing different action types', onclick=[action1(var), var.reset()])
```

At the moment, for backwards compatibility with the [deprecated action API](#deprecated-action-api) the list of actions can be a mix of `@action`-decorated functions and action implementation objects (standalone or returned by shortcut actions). In the future this will be restricted to lists of implementation objects only. This is to prevent multiple round-trips to the server as each `@action`-decorated function requires a server call.

The decorated actions can be composed together by simply calling one action from another. This is useful when you want to trigger multiple actions from a single component callback.

```python

from dara.core import action, Variable

var = Variable(default=0)

@action
async def action1(ctx: action.Ctx, previous_value: int):
    await ctx.update(variable=var, value=previous_value + 1)

@action
async def action2(ctx: action.Ctx):
    await ctx.update(variable=var, value=2)

@action
async def action3(ctx: action.Ctx, previous_value: int):
    # Directly calling action1 and action2 from action3
    await action1(ctx, previous_value)
    await action2(ctx)


Button('action1', onclick=action1(var))
Button('action2', onclick=action2())
Button('action3', onclick=action3(var))
```

:::note

When calling an `@action`-decorated action from within another action, all the arguments must be passed explicitly. Invoking an action within another action simply calls the inner decorated function.

:::

You can also invoke `ActionImpl` instances directly from within an `@action`-decorated function. This is useful when you want to wrap an action coming from an external library with your own logic.

```python
from dara.core import action, NavigateToImpl, Variable

# Assume an external library defined a function which returns an ActionImpl
def external_action(object_id: str):
    return NavigateTo(url=f'https://example.com/objects/{object_id}')

object_id_var = Variable(default=0)

# You can define your own action which wraps the external action
@action
async def my_action(ctx: action.Ctx, object_id: str):
    # You can call the external action directly from within your action
    external_impl = external_action(object_id)
    await ctx.execute_action(external_impl)

Button('Navigate to External', onclick=my_action(object_id_var))
```

## Deprecated action API

In previous versions of Dara, actions such as `UpdateVariable`, `NavigateTo`, `DownloadContent` and `SideEffect` accepted a `resolver` parameter. This would allow you to pass a function that would be executed on the server when the action is triggered. This API is now deprecated and will be removed in a future version of Dara. You should use the `@action` decorator instead for cases where custom logic is required, or use the [shortcut actions](#shortcut-actions) or [action implementation objects](#action-implementation-objects) for simple cases.

For backwards compatibility the deprecated API is still available, but it is recommended to migrate to the new API as soon as possible. For the transition period, the resolvers are transformed into `@action`-annotated functions under the hood.

Below are example of how to use the deprecated API and how to migrate to the new API.

### `UpdateVariable`

The `UpdateVariable` API takes the following arguments:

- `resolver`: a function to resolve the new value for the `Variable`, `DataVariable` or `UrlVariable`. The resolver takes one argument: a context of type `UpdateVariable.Ctx`. The new value is given by the component and can be obtained with `ctx.inputs.new`. While the current value, or now previous value of the variable you are updating, can be obtained with `ctx.inputs.old`.
- `variable`: the `Variable`, `DataVariable` or `UrlVariable` to update with a new value upon triggering the action
- `extras`: any extra variables to resolve and pass to the resolver function, you can obtain a list of the resolved values of all the extras passed with `ctx.extras` in the resolver function

```python
from dara.core import ConfigurationBuilder, Variable, UpdateVariable
from dara.components import Button, Stack

config = ConfigurationBuilder()

my_var = Variable(5)

def add_one(ctx: UpdateVariable.Ctx):
    return ctx.inputs.old + 1

def test_page():
    return Stack(
        Text(my_var),
        Button(
            'Add One',
            onclick=UpdateVariable(add_one, variable=my_var)
        ),
    )

config.add_page(name='Increment Variable', content=test_page())
```

The example's resolver is the function `add_one` and it takes the current value of the Variable and adds one to it, assuming it is an integer. If you were to click on the button, the `Variable`'s value would be updated to six.

To migrate to the new API, you can use the [`update` method](#update) of the injected context within an `@action`-decorated function.

For simpler cases, you can use the [`update`](#daracoreinteractivityplain_variablevariableupdate), [`sync`](#daracoreinteractivityplain_variablevariablesync) and [`toggle`](#daracoreinteractivityplain_variablevariabletoggle) shortcut actions.

### `NavigateTo`

The `NavigateTo` API takes the following arguments:

- `url` - can be a static string, or it can be a function that will be called with the element that triggered the action
- `new_tab` - a boolean indicating whether to open the URL in a new tab

In the example below, on 'Test Page', clicking on a button 'Go to Another Page' takes you to the 'Another Page' page. This demonstrates how you can pass a static url to the `NavigateTo` action. On the 'Another Page' page, you can see how to control `NavigateTo` by passing url as a function based on component value.

```python
from dara.core import ConfigurationBuilder, NavigateTo, Variable
from dara.components import Stack, Button, Select

config = ConfigurationBuilder()


def test_page():
    return Stack(
        # passing url as a static string
        Button('Go to Another Page', onclick=NavigateTo('/another-page')),
    )


def another_page():
    # passing url as a function based on component value
    return Stack(
        Select(
            value=Variable('/test-page'),
            items=['/test-page', '/another-page', 'https://www.google.com/'],
            onchange=NavigateTo(lambda ctx: ctx.inputs.value),
        )
    )


config.add_page(name='Test Page', content=test_page())
config.add_page(name='Another Page', content=another_page())
```

To migrate to the new API, you can use the [`navigate` method](#navigate) of the injected context within an `@action`-decorated function.

For simpler cases (e.g. static URLs) you can use the `dara.core.interactivity.actions.NavigateToImpl` action implementation object directly.

### `DownloadContent`

The `DownloadContent` action accepts a resolver function that is called when the action is triggered. The resolver function takes one argument: a context of type `DownloadContent.Ctx`. The resolver function should return a string with a path to the file to download.

```python
import os
import pandas
from dara.core import ConfigurationBuilder
from dara.core.interactivity.actions import DownloadContent
from dara.components import Button, Stack
from dara.core.definitions import ComponentInstance
from dara.core.interactivity import DataVariable

# generate data, alternatively you could load it from a file
df = pandas.DataFrame(data={'x': [1, 2, 3], 'y':[4, 5, 6]})
my_var = DataVariable(df)

config = ConfigurationBuilder()

def return_csv(ctx: DownloadContent.Ctx) -> str:
    # The file can be created and saved dynamically here, it should then return a string with a path to it
    # To get the component value, e.g. a select component would return the selected value
    component_value = ctx.inputs.value

    # Getting the value of data passed as extras to the action
    data = ctx.extras[0]

    # save the data to csv
    data.to_csv('<PATH_TO_CSV.csv>')
    return '<PATH_TO_CSV.csv>'


def test_page() -> ComponentInstance:
    return Stack(
        Button(
            'Download File', onclick=DownloadContent(resolver=return_csv, extras=[my_var], cleanup_file=False)
        ),
    )


config.add_page(name='Download Content', content=test_page)
```

To migrate to the new API, you can use the [`download_file` method](#download_file) of the injected context within an `@action`-decorated function.

For simpler cases (e.g. static file paths) you can use the `dara.core.interactivity.actions.DownloadContentImpl` action implementation object directly.

### `SideEffect`

The `SideEffect` action can execute an arbitrary Python function. The example below demonstrates how to print variables values to the logs.

```python
from dara.core import ConfigurationBuilder, Variable, SideEffect
from dara.components import Stack, Select

config = ConfigurationBuilder()

x = Variable(0)
y = Variable(1)
z = Variable(2)


def side_effect(ctx: SideEffect.Ctx):
    value = ctx.inputs.value
    x, y, z = ctx.extras

    print('value:', value)
    print(f'x:{x}, y:{y}, z:{z}')


def test_page():
    return Stack(Select(value=Variable(3), items=[3, 4, 5], onchange=SideEffect(side_effect, extras=[x, y, z])))


config.add_page(name='Side Effect', content=test_page())
```

To migrate to the new API, you can use the `@action` decorator to create an action that calls the function you want to execute. `SideEffect` will no longer exist in future Dara versions.

To learn more about actions checkout the [Action reference documentation](../../reference/dara/core/interactivity/actions).
