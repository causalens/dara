---
title: Actions
---

You can update Variables through Dara actions which can be passed to any component prop accepting an `Action`.

## `UpdateVariable`

The `dara.core.interactivity.actions.UpdateVariable` action can trigger the update of a `Variable`, `DataVariable` or `UrlVariable`.

It takes the following arguments:

- `resolver`: a function to resolve the new value for the `Variable`, `DataVariable` or `UrlVariable`. The resolver takes one argument: a context of type `UpdateVariable.Ctx`. The new value is given by the component and can be obtained with `ctx.inputs.new`. While the current value, or now previous value of the variable you are updating, can be obtained with `ctx.inputs.old`.
- `variable`: the `Variable`, `DataVariable` or `UrlVariable` to update with a new value upon triggering the action
- `extras`: any extra variables to resolve and pass to the resolver function, you can obtain a list of the resolved values of all the extras passed with `ctx.extras` in the resolver function

To see how the `UpdateVariable` works, consider the example below:

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

The `Button` component has a parameter `onclick` which is the component's callback. You can pass it an action, which in this case is an `UpdateVariable` instance.

The example's resolver is the function `add_one` and it takes the current value of the `Variable` and adds one to it, assuming it is an integer. If you were to click on the button, the `Variable`'s value would be updated to six. The new value in the resolver is not used as `Button`s do not provide a new value to the `Variable` and it will be equal to `None`. Other components like `Input`s do provide a new value. For `Input` components, the new value is whatever is typed into the `Input` box.

Other components like `Select`s have corresponding callbacks. The callback for a `Select` component is the `onchange` argument.

In summary, to trigger an update based on user interaction simply pass an action to your component's callback.

## `TriggerVariable`

The `dara.core.interactivity.actions.TriggerVariable` action can force a recalculation of a `DerivedVariable`. To see how it works, consider the following example:

```python

from dara.core import ConfigurationBuilder, Variable, DerivedVariable, TriggerVariable
from dara.components import Input, Stack, Button, Text

config = ConfigurationBuilder()

my_var = Variable(1)
der_var = DerivedVariable(lambda x: float(x) ** 2 , variables=[my_var], deps=[])


def test_page():
    return Stack(
        # Display variable
        Stack(Text('Value:'), Input(value=my_var), direction='horizontal'),

        # When clicking this button der_var syncs and calculates latest the
        Button('Trigger Derived Variable', onclick=TriggerVariable(variable=der_var)),
        Stack(Text('Value Squared:'), Text(der_var), direction='horizontal'),
    )


config.add_page(name='Trigger Variable', content=test_page())

```

In the above example, the value of the variable passed to `Input` component is squared only when the 'Trigger Derived Variable' button is clicked.

The `TriggerVariable` action also has a short form meaning that you can simply call `.trigger()` on your `DerivedVariable` to create a `TriggerVariable` instance for that variable:

```python
Button('Trigger Derived Variable', onclick=der_var.trigger())
```

## `ResetVariables`

The `dara.core.interactivity.actions.ResetVariables` action resets a number of variables to their default values. See the following example:

```python
from dara.core import ConfigurationBuilder, Variable, ResetVariables, UpdateVariable
from dara.components import Stack, Button, Text

config = ConfigurationBuilder()

my_var = Variable(0)


def test_page():
    return Stack(
        Text(my_var),
        # when clicked, 1 is added to my_var
        Button('Add', onclick=UpdateVariable(lambda ctx: ctx.inputs.old + 1, my_var)),
        # when clicked my_var goes back to its initial value: 0
        Button('Reset', onclick=ResetVariables(variables=[my_var])),
    )

config.add_page(name='Reset Variable', content=test_page())
```

---

As mentioned, actions do not have to affect `Variable`s. They can also enable other kinds of interactivity.

## `Notify`

The `dara.core.interactivity.actions.Notify` action triggers the UI to display a toast notification with a title and a message. In the example below, you can trigger a notification by clicking on the 'Notify' button.

```python
from dara.core import ConfigurationBuilder
from dara.core.interactivity.actions import Notify, NotificationStatus

from dara.components import Stack, Button

config = ConfigurationBuilder()


def test_page():
    return Stack(
        Button(
            'Notify',
            onclick=Notify(
                message='This is the notification message', title='Example', status=NotificationStatus.SUCCESS
            ),
        )
    )


config.add_page(name='Notify Example', content=test_page())
```

## `NavigateTo`

The `dara.core.interactivity.actions.NavigateTo` action will trigger a change in route based on the url passed. The url can be a static string, or it can be a function that will be called with the element that triggered the action.

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

## `SideEffect`

The `dara.core.interactivity.actions.SideEffect` action can execute an arbitrary Python function. The example below demonstrates how to print variables values to the logs.

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

## `DownloadVariable`

The `dara.core.interactivity.actions.DownloadVariable` action downloads a given variable as a file. The example below will show you how to download the content of `my_var` as a `json` file:

```python
from dara.core import ConfigurationBuilder, DownloadVariable, Variable, get_icon
from dara.components import Stack, Button

config = ConfigurationBuilder()

my_var = Variable('example')


def test_page():
    return Stack(
        Button(
            'Download Variable',
            onclick=DownloadVariable(variable=my_var, file_name='test_file', type='json'),
        )
    )


config.add_page(name='Download Variable', content=test_page())
```

## `DownloadContent`

You can use `dara.core.interactivity.actions.DownloadContent` action to download a file. The example below demonstrates how to download generated data to a `csv` file.

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

To learn more about actions checkout the [Action documentation](../../reference/dara/core/interactivity/actions).
