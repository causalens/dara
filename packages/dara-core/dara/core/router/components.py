from typing import Annotated, Any, Literal, Optional, Union

from pydantic import BaseModel, BeforeValidator

from dara.core.definitions import ComponentInstance, JsComponentDef, StyledComponentInstance, transform_raw_css


class RouterPath(BaseModel):
    path: str
    """
    A URL pathname, beginning with '/'.
    """

    search: Optional[str] = None
    """
    A URL search string, beginning with '?'.
    """

    hash: Optional[str] = None
    """
    A URL hash string, beginning with '#'.
    """


OutletDef = JsComponentDef(name='Outlet', js_module='@darajs/core', py_module='dara.core')


class Outlet(ComponentInstance):
    """
    Outlet component is a placeholder for the content of the current route.
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

    # TODO: not implemented yet
    # prefetch: Literal['none', 'intent', 'render', 'viewport'] = 'none'
    # """
    # Defines the data and module prefetching behavior for the link.
    # - none — default, no prefetching
    # - intent — prefetches when the user hovers or focuses the link
    # - render — prefetches when the link renders
    # - viewport — prefetches when the link is in the viewport, very useful for mobile
    # """

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

    to: Union[str, RouterPath]
    """
    Can be a string or RouterPath object
    """

    active_css: Annotated[Optional[Any], BeforeValidator(transform_raw_css)] = None
    inactive_css: Annotated[Optional[Any], BeforeValidator(transform_raw_css)] = None

    # TODO: add scroll restoration if it works?

    def __init__(self, *children: ComponentInstance, **kwargs):
        components = list(children)
        if 'children' not in kwargs:
            kwargs['children'] = components
        super().__init__(**kwargs)
