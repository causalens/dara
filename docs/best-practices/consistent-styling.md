---
title: Consistent Styling
---

You may want to give your app a certain color scheme. Instead of specifying `color` in all your components with a hardcoded string, you should use a theme. This will ensure that you do not forget to add the color anywhere you may want it, and takes away the extra work in doing so.

### App Themes

A way to keep styling consistent is to set a theme with your configuration. Dara has some pre-built themes for you to use or you can define your own. You can find the pre-built themes [here](../getting-started/app-building.md#themes) and how to define your own theme [here](../advanced/custom-themes).

### Themes

The Bokeh extension also allows you to set a theme to give a specific look to your Bokeh plots.

```python
from dara.components import set_default_bokeh_theme
from dara.components.bokeh import dark_theme

set_default_bokeh_theme(dark_theme)
```

This will prevent you from needing to set the `background` attribute on all your Bokeh figures to the color you desire.

:::caution
This capability is exclusive to this extension. The other extensions do not have this capability.
:::

### CSS & Reusable Components

If you only want to change the color of say, one type of component, you can use the principle of [reusable components](./reusing-components).

```python
from dara.components import Button

def GreenButton(content: str, **kwargs) -> Button:
    """
    Displays button in green
    """
    kwargs['raw_css'] = {'background-color': '#00FF00'}
    return Button(content, **kwargs)

```
