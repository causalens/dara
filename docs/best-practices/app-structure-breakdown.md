---
title: App Structure
---

## Separating Pages

If your app requires multiple pages, it is best to keep each page's respective logic in separate files. The pages can be imported into `main.py` to be registered by the `dara.core.configuration.ConfigurationBuilder` instance.

For an app with two pages, one to display your data and one to evaluate your model's performance, you'd want the following file structure:

```python
- my_app/
    -  main.py
    -  pages/
        -  data_page.py
        -  performance_page.py
```

And you'd import the pages from `my_app.pages` into `main.py`.

```python title=my_app/main.py
from dara.core import ConfigurationBuilder

# Create a configuration builder
config = ConfigurationBuilder()

# Add your pages
config.add_page('Data Exploration', DataPage())
config.add_page('Model Performance', PerformancePage())
```

The definition of the pages themselves will come later in this section.

Pages can be class-based or functional as long as they return a component instance.

### Functional pages

Since a page is just a function returning a component, you can move the components and its internal logic to a function:

```python title=my_app/definitions.py

global_var = 'Hello'
```

```python title=my_app/pages/page1.py
from dara.core.definitions import ComponentInstance
from dara.components import Stack, Text

# import any external state
from my_app.definitions import global_var

def page1(global_var: str) -> ComponentInstance:
    # define an internal state inside the function
    internal_var = 'World'

    # compose the layout
    return Stack(Text(global_var), Text(internal_var))
```

You can then import the pages into your main file and use the `add_page` method to add them to the application.

```python title=my_app/main.py
from my_app.pages.page1 import page1

config.add_page('Page 1', page1())
```

### Class-based pages

Alternatively you could write the page as a class. Showing the previous example but using a class-based page:

```python title=my_app/definitions.py

global_var = 'Hello'
```

```python my_app/pages/page1.py
from dara.core.definitions import ComponentInstance
from dara.components import Stack, Text

# import any external state
from my_app.definitions import global_var

class Page1:
    def __init__(self):
        # define an internal state inside the class
        self.internal_var = 'World'

    def layout(self) -> ComponentInstance:
        # compose the layout
        return Stack(Text(global_var), Text(self.internal_var))

    def __call__(self) -> ComponentInstance:
        return self.layout()
```

One small difference is that the `__call__` method is used to return the component instance. This means that when adding it as a page you will need to call the `__call__` method if it requires any arguments.

```python title=my_app/main.py
from my_package.pages.page1 import Page1

config.add_page('Page 1', Page1())
```

Most of the time there is no real difference between writing your pages as functions versus writing your pages as classes. It is a matter of preference and dependent on your use case. However, there are certain advantages of using class-based components which derive from the benefits of using python classes in general.

One advantage is that classes can define the page in its `__call__` method but can also return other outputs if necessary from its other methods and attributes. Another advantage is the ability to customize parts of the page or component by simple sub-classing. There is a caveat of the class method though in that it couples your layout with your state.

Regardless of what you choose, both allow for making small, reusable components that can be used throughout your app. Which technique you prefer is up to you and your use case.

## Global Variables

It is helpful to have your global state in one place and to keep it out of `main.py` for organization and readability. To do this you can define a `definitions.py` file where you keep global variables like any model instantiations or loading datasets.

You can also define global `dara.core.interactivity.plain_variable.Variable`s, `dara.core.interactivity.derived_variable.DerivedVariable`s, `dara.core.interactivity.server_variable.ServerVariable`s here. These variables should be used across multiple pages. If they are only being used in one place they should be defined in the page they are being used.

Following this practice, you'd have the following structure:

```python
- my_app/
    -  definitions.py
    -  main.py
    -  pages/
        -  data_page.py
        -  performance_page.py
```

With your `definitions.py` file resembling the following:

```python title=my_app/definitions.py
import pickle
import pandas
from dara.core import ServerVariable

# Server Variables
my_data = ServerVariable(pandas.read_csv('data.csv'))
# Model Variables
my_model = pickle.load(open('my_model.pkl', 'r'))
features = ['X', 'Z']
target = 'Y'
```

And you could import your definitions into your pages with the following:

```python title=my_app/pages/data_page.py
from dara.components import Table
from my_app.definitions import my_data

def DataPage():
    return Table(data=my_data)
```

If you had many global variables, your definitions can be put into separate files under a definitions folder like the following:

```python
- my_app/
    -  main.py
    -  definitions/
        - data_definitions.py
        - model_definitions.py
        - ...
    -  pages/
        -   data_page.py
        -   performance_page.py
```

## Utility and Resolver Functions

Your app will ultimately perform some logic based on how the user interacts with the app. You app may also build some larger and more complex components. It helps to separate this logic outside of where you are defining the base of your component whether in the same file as a another function or as a function in a separate file.

### Resolver Functions

When the user interacts with the app and updates the values of the `Variable`s in your app, this will update `DerivedVariable`s or trigger [actions]((../getting-started/actions)).

In the following example, the user can choose a number of metrics to apply to their model which will be displayed to them in a `Table` via a `DerivedVariable`. The resolver of this `DerivedVariable` is not simple and cannot be resolved through a Python `lambda` function. Therefore it is best practice to move it out of your component logic.

```python title=my_app/pages/performance_page.py
import pandas
from typing import List
from dara.components import Table, Select, Stack
from sklearn.metrics import accuracy_score, mean_absolute_error, mean_squared_error

from my_app.definitions import my_data, my_model, features, target

def resolve_metric_data(metrics: List[str]):
    metric_data = {}
    y_pred = my_model.predict(my_data[feature_names])
    y_true = my_data[[target]]
    for metric in metrics:
        if metric == 'Accuracy':
            metric_data.append(
                {'Metric': metric, 'Value': accuracy_score(y_true, y_pred)}
            )
        elif metric == 'Mean Absolute Error':
            metric_data.append(
                {'Metric': metric, 'Value': mean_absolute_error(y_true, y_pred)}
            )
        elif metric == 'Root Mean Squared Error':
            metric_data.append(
                {'Metric': metric, 'Value': mean_squared_error(y_true, y_pred)}
            )
    return pandas.DataFrame(metric_data)

def PerformancePage():
    metric_var = Variable(['Accuracy'])
    metric_data_var = DerivedVariable(
        resolve_metric_data, variables=[metric_var]
    )
    return Stack(
        Select(
            items=['Accuracy', 'Mean Absolute Error', 'Root Mean Squared Error'],
            value=metric_var,
            multiselect=True,
        ),
        Table(data=metric_data_var),
    )
```

If the performance page were to grow, it could be beneficial to move any resolver functions to a separate file and import them from there. As this could be the case for each page, you can keep these utility files in one folder and group the resolvers or any helper functions as you see fit. Since your pages are already in one folder, you can create a folder called `utils` and move the resolver into a file in that folder called `model_utils.py`.

Following this best practice, you'd have the following app structure:

```python
- my_app/
    -  definitions.py
    -  main.py
    -  pages/
        -  data_page.py
        -  performance_page.py
    -  utils/
        -  model_utils.py
        ...
```

And your page's code would look like the following:

```python title=my_app/pages/performance_page.py
from dara.components import Table, Select, Stack

from my_app.utils.model_utils import resolve_metric_data

def PerformancePage():
    metric_var = Variable(['Accuracy'])
    metric_data_var = DerivedVariable(
        resolve_metric_data, variables=[metric_var]
    )
    return Stack(
        Select(
            items=['Accuracy', 'Mean Absolute Error', 'Root Mean Squared Error'],
            value=metric_var,
            multiselect=True,
        ),
        Table(metric_data_var),
    )
```

:::tip
If your resolvers are performing heavy logic, it could benefit to spin up this logic in a separate process. This is possible by setting the `task_module` attribute on your `ConfigurationBuilder` to the location of where you keep your resolvers. You must also set `run_as_task=True` when you instantiate your `DerivedVariable`.

In this example, you would achieve this through the following

```python title=my_app/main.py
...

config.task_module = 'my_app.model_utils'
```

```python title=my_app/pages/performance_page.py
...

def PerformancePage():
    metric_var = Variable(['Accuracy'])
    metric_data_var = DerivedVariable(
        resolve_metric_data,
        variables=[metric_var],
        run_as_task=True,
    )
    ...
```

:::

### Utility Functions

Logic does not have to be based on user-input in order to qualify for separating it from where the component is being built. A common example is plotting in Bokeh as it can take several lines of code to make a plot that you want to show in your app.

In the following example, you are expanding your data page to plot the features of the data versus the target. To keep in line with the following example, you will define the logic of the plot in a separate file so your app will have the following structure:

```python
- my_app/
    -  definitions.py
    -  main.py
    -  pages/
        -  data_page.py
        -  performance_page.py
    -  utils/
        -  model_utils.py
        -  data_utils.py
```

And your code would look like the following:

```python title=my_app/utils/data_utils.py
import pandas
from bokeh.layouts import row
from bokeh.plotting import figure
from bokeh.models import HoverTool

from dara.core import py_component
from dara.components import Bokeh

@py_component
def plot_features(data: pandas.DataFrame):
    scatter_X = figure(title='X vs Y')
    scatter_X.scatter(data['X'], data['Y'], color='red')
    scatter_X.xaxis.axis_label = 'X'
    scatter_X.yaxis.axis_label = 'Y'

    hover = HoverTool(tooltips=[('X', '$x'), ('Y', '$y')])
    scatter_X.tools.append(hover)

    scatter_Z = figure(title='Z vs Y')
    scatter_Z.scatter(data['Z'], data['Y'], color='blue')
    scatter_Z.xaxis.axis_label = 'Z'
    scatter_Z.yaxis.axis_label = 'Y'

    hover = HoverTool(tooltips=[('Z', '$x'), ('Y', '$y')])
    scatter_Z.tools.append(hover)

    return Bokeh(row(scatter_X, scatter_Z))
```

```python title=my_app/pages/data_page.py
from dara.components import Table, Stack

from my_app.definitions import my_data
from my_app.utils.data_utils import plot_features

def DataPage():
    return Stack(
        Table(my_data),
        plot_features(my_data)
    )
```

#### Shared Utility Functions

In your data page, you want to add a scatter plot of each score versus the other scores. This means that scatter plots are used multiple times throughout your app and to avoid redundant code you could make a helper function that makes a general scatter plot given some necessary arguments.

```python title=my_app/utils/plotting_utils.py
import pandas
from bokeh.plotting import figure
from bokeh.models import HoverTool

def scatter_plot(
    X: pandas.Series, Y: pandas.Series, x_name: str, y_name: str, color: str
):
    scatter_fig = figure(f'{x_name} vs {y_name}')
    scatter_fig.scatter(X, Y, color=color)
    scatter_fig.xaxis.axis_label = x_name
    scatter_fig.yaxis.axis_label = y_name

    hover = HoverTool(tooltips=[(x_name, '$x'), (y_name, '$y')])
    scatter_fig.tools.append(hover)

    return scatter_fig
```

Your app would now have the following structure:

```python
- my_app/
    -  definitions.py
    -  main.py
    -  pages/
        -  data_page.py
        -  performance_page.py
    -  utils/
        -  model_utils.py
        -  data_utils.py
        -  plotting_utils.py
```

And you could update `data_utils.py` with the following:

```python title=my_app/utils/data_utils.py
import pandas
from bokeh.layouts import row
from dara.core import py_component
from dara.components import Bokeh

from my_app.utils.plotting_utils import scatter_plot

@py_component
def plot_features(data: pandas.DataFrame):
    scatter_X = scatter_plot(
        data['X'], data['Y'], 'X', 'Y', 'red'
    )

    scatter_Z = scatter_plot(
        data['Z'], data['Y'], 'Z', 'Y', 'blue'
    )

    return Bokeh(row(scatter_X, scatter_Z))
```

Where you move your resolvers and utility functions is up to you but there are some suggested ways:

#### 1. Horizontal: Organizing by app-function

This method involves organizing your app by it's functionality ie pages, resolvers, helpers, and layouts. This is the way the example was executed and you ended up with the following structure:

```python
- my_app/
    -  definitions.py
    -  main.py
    -  pages/
        -  data_page.py
        -  performance_page.py
    -  utils/
        -  model_utils.py
        -  data_utils.py
        -  plotting_utils.py
```

Keep in mind it is good practice to separate helpers and resolvers that are shared amongst pages versus helpers and resolvers that are specific to a page.

Business logic like resolvers, ML processes, and data processes can even be separated from layout-specific utils. So the example above could have been structured like the following:

```python
- my_app/
    -  definitions.py
    -  main.py
    -  pages/
        -  data_page.py
        -  performance_page.py
    -  core_logic/
        -  model_utils.py  # processing data
    -  layout_utils/
        -  plotting_utils.py  # general plotting utils
        -  data_utils.py  # layout utils specific to the data page
```

#### 2. Vertical: Organizing by pages and ideas

This method organizes your app by its pages or the things the app is aiming to achieve.

This example could have also been executed this way if you had the following structure:

```python
- my_app/
    -  definitions.py
    -  main.py
    -  data_exploration/
        -  data_page.py
        -  data_utils.py
    -  performance/
        -  performance_page.py
        -  model_utils.py
    -  shared_utils/
        - plotting_utils.py
```

## Summary

When building your app remember to

- Separate your pages into multiple files when building a multi-page app.
- Separate your global variables into a separate file and to check that these variables are truly global in that they are used across multiple pages. It is not necessary to attach your global variables to your page classes as attributes or make copies of them in your page functions unless you are modifying them.
- Keep local variables in the page they are being used in and do not import them to other pages.
- Make use of helper functions when building large and complex components. Keep these helper functions in a separate file to keep your code legible and modular.
- Use `lambda` functions when you can for your variable and action resolvers but when the logic is too complex for a `lambda`, define a new function. If it could be reused elsewhere, put it in a place outside of where you are building your component.
