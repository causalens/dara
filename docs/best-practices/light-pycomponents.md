---
title: Light PyComponents
---

The `@py_component` decorator is used to create a dynamic layout based on the current state of an application's variables. They rely on the state, and do not define the state. 

Ideally, when loading results you want as much as the page to be displayed as possible. There are two ways to achieve this, and both should be used whenever possible.

### Use `DerivedVariable`s for Heavy Computation

You should aim to keep heavy computation out of `dara.core.visual.dynamic_component.py_component`s and leave the heavy lifting to the `dara.core.interactivity.derived_variable.DerivedVariable`s.

`DerivedVariable`s are better equipped for expensive computations because the results can be cached and you have more control over when they are recalculated thanks to the `deps` argument. `py_component`s should only handle changes to the UI. 

The flow of a new calculation should be: 

`Variable`s &rarr; `DerivedVariable`s &rarr; `py_component`s 

If no calculation is needed and only visual updates are required, the flow should be: 

`Variable`s &rarr; `py_component`s

### Minimize the Content of Your `py_component`s

You should aim to have relatively small `py_component`s. 

If we define our whole page to be one single `py_component`, the whole page will not display until the state is resolved and all components are rendered.

Below are two pages that will render the exact same visual result. However, the first page will respond to change more quickly and seamlessly than the second page.

The first page will only re-render `layout1` if `a` or `b` change and will only re-render `layout2` if `c` or `d` change. The second example will re-render the whole page if any of `a`, `b`, `c`, or `d` change.

```python
class Page:
    def __init__(self):
        self.a = Variable(1)
        self.b = Variable(2)
        
        self.c = Variable(3)
        self.d = Variable(4)
        
        self.output1 = DerivedVariable(
            my_long_calculation1,
            variables=[self.a, self.b]
        )
        self.output2 = DerivedVariable(
            my_long_calculation2,
            variables=[self.c, self.d]
        )
        
    def __call__(self):
        return Card(
            self.layout1(output1),
            self.layout2(output2)
        )
        
    @py_component
    def layout(self, output1):
        return Stack(Text(output1))
        
    @py_component
    def layout2(self, output2):
        return Stack(Text(output2))

```

```python
class Page:
    def __init__(self):
        self.a = Variable(1)
        self.b = Variable(2)
        
        self.c = Variable(3)
        self.d = Variable(4)
        
        self.output1 = DerivedVariable(
            my_long_calculation1,
            variables=[self.a, self.b]
        )
        self.output2 = DerivedVariable(
            my_long_calculation2,
            variables=[self.c, self.d]
        )
    
    def __call__(self):
        return self.layout(output1, output2)
        
    @py_component
    def layout(self, output1, output2):
        return Card(
            Stack(Text(output1)),
            Stack(Text(output2))
        )

```

### Use `DerivedDataVariable`s for Data Processing

Often times you may want to manipulate a dataset based on user input. While it may be tempting to do this processing in a `py_component`, your app will have better performance if this logic is extracted to a `DerivedDataVariable`.

Additionally, `Table` objects only accept `DataVariable`s or `DerivedDataVariable`s so by using a `DerivedDataVariable`, you will not have to arbitrarily wrap your `pandas.DataFrame` in a `DataVariable` in order to utilize a table.

The following page that filters a table by its columns:

```python
import pandas
from typing import List
from dara.core import py_component, DataVariable, Variable
from dara.components import Table, Select, Stack

def DataPage(data: pandas.DataFrame):
    selected_columns_var = Variable(['X'])

    @py_component
    def display_table(selected_columns: List[str]):
        return Table(data=DataVariable(data[selected_columns]))

    return Stack(
        Select(items=['X', 'Y', 'Z'], value=selected_columns_var, multiselect=True),
        display_table(selected_columns_var),
    )
```

should be refactored to the following page that achieves the same outcome but in a cleaner way:

```python
import pandas
from typing import List
from dara.core import DerivedDataVariable, Variable
from dara.components import Table, Select, Stack

def DataPage(data: pandas.DataFrame):
    selected_columns_var = Variable(['X'])
    selected_data = DerivedDataVariable(
        lambda x: data[x], variables=[selected_columns_var]
    )

    return Stack(
        Select(items=['X', 'Y', 'Z'], value=selected_columns_var, multiselect=True),
        Table(data=selected_data),
    )
```