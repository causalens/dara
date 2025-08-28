from dara.core.definitions import ComponentInstance, JsComponentDef
from dara.core.router import Link

MenuLinkDef = JsComponentDef(name='MenuLink', js_module='@darajs/core', py_module='dara.core')


class MenuLink(Link):
    """
    Styled version of Link component, ready to be used with e.g. the built-in SideBarFrame component.
    Accepts all the same props as the Link component, can be used as a drop-in replacement.

    ```python
    from dara.core.visual.components import MenuLink, SideBarFrame
    from dara.core.router import Router, Outlet

    router = Router()

    def RootLayout():
        routes = router.get_navigable_routes()

        return SideBarFrame(
            side_bar=Stack(
                *[MenuLink(Text(path['name']), to=path['path']) for path in routes],
            ),
            content=Outlet(),
        )

    root = router.add_layout(content=RootLayout)
    ```
    """

    def __init__(self, *children: ComponentInstance, **kwargs):
        els = list(children)
        if 'children' not in kwargs:
            kwargs['children'] = els
        super().__init__(**kwargs)
