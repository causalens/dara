from typing import Literal, Union

from dara.core.definitions import ComponentInstance, JsComponentDef, StyledComponentInstance
from dara.core.interactivity.client_variable import ClientVariable
from dara.core.visual.themes.definitions import ThemeDef

ThemeProviderDef = JsComponentDef(name='ThemeProvider', js_module='@darajs/core', py_module='dara.core')


class ThemeProvider(StyledComponentInstance):
    """
    ThemeProvider can be used to provide a different theme to a subtree of components.

    ```python
    from dara.core import ConfigurationBuilder
    from dara.core.visual.components import ThemeProvider
    from dara.core.visual.themes import Light

    config = ConfigurationBuilder()

    # Define a theme by cloning Light and modifying it
    theme = Light.model_copy()
    theme.colors.text = 'red'

    def ThemePage():
        return Stack(
            Text('This text is default color'),
            ThemeProvider(
                Text('This text is red'),
                theme=theme
            )
        )

    config.router.add_page(path='theme', content=ThemePage)
    """

    theme: Union[ThemeDef, ClientVariable, Literal['light', 'dark']]
    base: Union[ClientVariable, Literal['light', 'dark']] = 'light'

    def __init__(self, *children: ComponentInstance, **kwargs):
        components = list(children)
        if 'children' not in kwargs:
            kwargs['children'] = components
        super().__init__(**kwargs)
