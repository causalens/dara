from typing import Annotated, Any, Literal, Optional, Union

from pydantic import BeforeValidator

from dara.core.base_definitions import RouterPath
from dara.core.definitions import (
    ComponentInstance,
    JsComponentDef,
    StyledComponentInstance,
    transform_raw_css,
)
from dara.core.interactivity import ClientVariable
from dara.core.visual.components import RawString

OutletDef = JsComponentDef(name='Outlet', js_module='@darajs/core', py_module='dara.core')


class Outlet(ComponentInstance):
    """
    Outlet component is a placeholder for the content of the current route.
    """


NavigateDef = JsComponentDef(name='Navigate', js_module='@darajs/core', py_module='dara.core')


class Navigate(ComponentInstance):
    """
    Navigate component immediately redirects to the specified route when rendered.
    Can be useful for defining default redirects in some pages.

    ```python
    from dara.core.router import Navigate

    def MyPage():
        # always redirects to /some-route
        return Navigate(to='/some-route')
    ```
    """

    to: Union[str, RouterPath, ClientVariable]

    replace: bool = False
    """
    Replaces the current entry in the history stack instead of pushing a new one.

    ```
    # with a history stack like this
    A -> B

    # normal link click pushes a new entry
    A -> B -> C

    # but with `replace`, B is replaced by C
    A -> C
    ```
    """

    relative: Literal['route', 'path'] = 'route'
    """
    Defines the relative path behavior for the link.

    ```python
    Navigate(to='..') # default, relative='route'
    Navigate(to='..', relative='path')
    ```

    Consider a route hierarchy where a parent route pattern is "blog" and a child route pattern is "blog/:slug/edit".
    - route — default, resolves the link relative to the route pattern. In the example above, a relative link of "..." will remove both :slug/edit segments back to "/blog".
    - path — relative to the path so "..." will only remove one URL segment up to "/blog/:slug"
    Note that index routes and layout routes do not have paths so they are not included in the relative path calculation.
    """


LinkDef = JsComponentDef(name='Link', js_module='@darajs/core', py_module='dara.core')


class Link(StyledComponentInstance):
    """
    Link component is a wrapper around the NavLink component that displays a link to the specified route.
    """

    case_sensitive: bool = False

    end: bool = True
    """
    Changes the matching logic for the 'active' state to only match the end of the 'to' prop.
    If the URL is longer, it will not be considered active. Defaults to True.

    For example, NavLink(to='/tasks') while on '/tasks/123' will:
    - with `end=False`, be considered active because of the partial match of the `/tasks` part
    - with `end=True`, be considered inactive because of the missing '123' part
    """

    # TODO: consider making it True by default in Dara v2
    prefetch: bool = False
    """
    Whether to prefetch the navigation data when user intends to navigate to the link.
    When set to True, whenever the user hovers or focuses the link, the navigation data will be prefetched
    and cached for a short period of time to speed up navigation.
    Defaults to False.
    """

    relative: Literal['route', 'path'] = 'route'
    """
    Defines the relative path behavior for the link.

    ```python
    Link(to='..') # default, relative='route'
    Link(to='..', relative='path')
    ```

    Consider a route hierarchy where a parent route pattern is "blog" and a child route pattern is "blog/:slug/edit".
    - route — default, resolves the link relative to the route pattern. In the example above, a relative link of "..." will remove both :slug/edit segments back to "/blog".
    - path — relative to the path so "..." will only remove one URL segment up to "/blog/:slug"
    Note that index routes and layout routes do not have paths so they are not included in the relative path calculation.
    """

    replace: bool = False
    """
    Replaces the current entry in the history stack instead of pushing a new one.

    ```
    # with a history stack like this
    A -> B

    # normal link click pushes a new entry
    A -> B -> C

    # but with `replace`, B is replaced by C
    A -> C
    ```
    """

    to: Union[str, RouterPath, ClientVariable]
    """
    Can be a string or RouterPath object
    """

    # core anchor element attributes
    target: Optional[str] = None
    download: Optional[str] = None
    rel: Optional[str] = None
    referrer_policy: Optional[str] = None

    active_css: Annotated[Optional[Any], BeforeValidator(transform_raw_css)] = None
    inactive_css: Annotated[Optional[Any], BeforeValidator(transform_raw_css)] = None

    def __init__(self, *children: Union[str, ComponentInstance], **kwargs):
        components = list(children)
        if 'children' not in kwargs:
            kwargs['children'] = components

        if len(kwargs['children']) > 0:
            kwargs['children'] = [RawString(content=x) if isinstance(x, str) else x for x in kwargs['children']]

        super().__init__(**kwargs)


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
