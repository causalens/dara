---
title: Reusing Components
---

Any function or class that returns a component can be thought of, and used as, a component. These structures can be used over and over again for different inputs.

This is particularly useful when you notice that certain components or patterns are used across multiple pages. Just as you can extract repeating parts of logic into functions, you can do the same with components.

An example of a very simple reusable component would be:

```python
from dara.components import Text

def BoldText(text: str, **kwargs) -> Text:
    """
    Displays text in bold
    """
    kwargs['bold'] = True
    return Text(text, **kwargs)

```

This is a purely visual component, but you could also reuse components with business logic like plotting.

```python
from bokeh.plotting import figure
from dara.components import Bokeh

def LinePlot(x: list, y: list, **kwargs) -> Bokeh:
    """
    Displays a line plot with a set of Bokeh tools
    """
    p = figure(**kwargs)
    p.line(x, y, line_width=2)

    p.toolbar_location = 'above'
    p.tools = "zoom,save"
    return Bokeh(p)
```

For clean organization, these reusable components should be saved outside of your page files and `main.py` and imported when you need them. You can use a structure like the following:

```python
- my_app/
    - components/
        - styled.py # purely visual components like BoldText
        - plotting.py # plotting components like LinePlot
        - ...
    - pages/
        - page1.py
        - page2.py
    - main.py
```
