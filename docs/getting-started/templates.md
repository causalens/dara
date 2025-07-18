---
title: Templates
description: Learn how to use templates to control the layout and routing of your Dara application
---

Templates are a core part of the main configuration as they determine the following key aspects of your application:

1. The overall **layout** of your app
2. A **router** according to your app's pages

## Default Templates

The framework comes with a few pre-built templates - `default`, `blank`, `top` and `top-menu`. To use either of them you can set the `config.template` attribute.

You can take the following application to see what the two frameworks look like.

```python
from dara.core import ConfigurationBuilder
from dara.components import Stack

# Create a configuration builder
config = ConfigurationBuilder()

# Register pages
config.add_page('First Page', Stack())
config.add_page('Second Page', Stack())
```

### Blank

```
config.template = 'blank'
```

![Blank Layout](../assets/getting_started/templates_blank.png)

This template's layout is blank so there is no menu. However, it does configure a router so you can navigate to pages directly with the url. Navigating to the url `/second-page` will land you on the page labeled 'Second Page'.

### Default

```
config.template = 'default'
```

![Default Layout](../assets/getting_started/templates_default.png)

This template's layout has a side menu, along with configuring a router. You can click on the menu label 'Second Page' and it wil land you on the page labeled 'Second Page'. Your url will automatically change to `/second-page`.

:::tip
If you want to build your own templates, check out [**Advanced: Custom Templates**](../advanced/custom-templates) to learn how. It also goes into more depth about how templates work.
:::

### Top layouts

```
# no menu
config.template = 'top'
# include menu
config.template = 'top-menu'
```

Those templates are similar to the `default` template, but the menu is at the top of the page instead of the side. The `top-menu` template includes a menu, while the `top` template does not.


## Next Steps

Now that you've learned how your layout and router are configured, you will walk through a quick end to end example that covers everything you have learned up until this point.
