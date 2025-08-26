from typing import Callable, List, Literal, Optional, Union

from pydantic import BaseModel, Field, PrivateAttr

from dara.core.definitions import ComponentInstance, JsComponentDef


class RouterPath(BaseModel):
    path: str
    """
    A URL pathname, beginning with '/'.
    """

    search: str
    """
    A URL search string, beginning with '?'.
    """

    hash: str
    """
    A URL hash string, beginning with '#'.
    """


class BaseRoute(BaseModel):
    case_sensitive: bool = False
    id: Optional[str] = None
    metadata: dict = Field(default_factory=dict)

    _parent: Optional['BaseRoute'] = PrivateAttr(default=None)

    def _attach_to_parent(self, parent):
        """Internal method to attach route to parent"""
        self._parent = parent
        # Recursively attach any existing children
        children = getattr(self, 'children', None)
        if children:
            for child in children:
                child._attach_to_parent(self)

    @property
    def full_path(self) -> Optional[str]:
        """
        Compute the full path from root to this route.
        Returns None if route is not attached to a router.
        """
        if not hasattr(self, '_parent') or self._parent is None:
            return None  # Route is not attached

        path_segments = []
        current = self

        while current is not None:
            route_path = getattr(current, 'path', None)
            if route_path:
                path_segments.append(route_path)
            current = getattr(current, '_parent', None)

        path_segments.reverse()
        full = '/' + '/'.join(path_segments) if path_segments else '/'
        return full.replace('//', '/')

    @property
    def is_attached(self) -> bool:
        """Check if this route is attached to a router"""
        return hasattr(self, '_parent') and self._parent is not None


class HasChildRoutes(BaseModel):
    children: List['BaseRoute'] = Field(default_factory=list)

    def __init__(self, *children: list[BaseRoute], **kwargs):
        routes = list(children)
        if 'children' not in kwargs:
            kwargs['children'] = routes
        super().__init__(**kwargs)

    def model_post_init(self, __context):
        """Automatically attach all children after construction"""
        for child in self.children:
            child._attach_to_parent(self)

    def add_page(
        self,
        *,
        path: str,
        content: Callable[..., ComponentInstance],
        case_sensitive: bool = False,
        id: Optional[str] = None,
        metadata: Optional[dict] = None,
    ):
        """
        Standard route with a unique URL segment and content to render

        :param path: URL segment
        :param content: component to render
        :param case_sensitive: whether the route is case sensitive
        :param id: unique id for the route
        :param metadata: metadata for the route
        """
        if metadata is None:
            metadata = {}

        route = PageRoute(
            path=path,
            content=content,
            case_sensitive=case_sensitive,
            id=id,
            metadata=metadata,
        )
        route._attach_to_parent(self)
        self.children.append(route)
        return route

    def add_layout(
        self,
        *,
        content: Callable[..., ComponentInstance],
        case_sensitive: bool = False,
        id: Optional[str] = None,
        metadata: Optional[dict] = None,
    ):
        """
        Layout route creates a route with a layout component to render without adding any segments to the URL

        ```python
        from dara.core.router import Router

        router = Router()

        # no path on this parent route, just the layout
        marketing_group = router.add_layout(content=MarketingLayout)
        marketing_group.add_index(content=MarketingHome)
        marketing_group.add_page(path='contact', content=MarketingContact)

        projects_group = router.add_prefix(path='projects')
        projects_group.add_index(content=ProjectsHome)
        # again, no path, just a component for the layout
        single_project_group = projects_group.add_layout(content=ProjectLayout)
        single_project_group.add_page(path=':pid', content=Project)
        single_project_group.add_page(path=':pid/edit', content=EditProject)
        ```

        Note that:
        - Home and Contact will be rendered into the MarketingLayout outlet
        - Project and EditProject will be rendered into the ProjectLayout outlet while ProjectsHome will not.

        :param content: layout component to render
        :param case_sensitive: whether the route is case sensitive
        :param id: unique id for the route
        :param metadata: metadata for the route
        """
        if metadata is None:
            metadata = {}

        route = LayoutRoute(
            content=content,
            case_sensitive=case_sensitive,
            id=id,
            metadata=metadata,
        )
        route._attach_to_parent(self)
        self.children.append(route)
        return route

    def add_prefix(
        self,
        *,
        path: str,
        case_sensitive: bool = False,
        id: Optional[str] = None,
        metadata: Optional[dict] = None,
    ):
        """
        Prefix route creates a group of routes with a common prefix without a specific component to render

        ```python
        from dara.core.router import Router

        router = Router()

        # no component, just a prefix
        projects_group = router.add_prefix(path='projects')
        projects_group.add_index(content=ProjectsHome)
        projects_group.add_page(path=':pid', content=ProjectHome)
        projects_group.add_page(path=':pid/edit', content=ProjectEdit)
        ```

        This creates the routes /projects, /projects/:pid, and /projects/:pid/edit without introducing a layout component.

        :param path: prefix path
        :param case_sensitive: whether the route is case sensitive
        :param id: unique id for the route
        :param metadata: metadata for the route
        """
        if metadata is None:
            metadata = {}
        route = PrefixRoute(path=path, case_sensitive=case_sensitive, id=id, metadata=metadata)
        route._attach_to_parent(self)
        self.children.append(route)
        return route

    def add_index(
        self,
        *,
        content: Optional[Callable[..., ComponentInstance]] = None,
        case_sensitive: bool = False,
        id: Optional[str] = None,
        metadata: Optional[dict] = None,
    ):
        """
        Index routes render into their parent's Outlet() at their parent URL (like a default child route).
        Index routes can't have children.

        ```python
        from dara.core.router import Router

        router = Router()
        # renders at '/'
        router.add_index(content=Home)

        dashboard_group = router.add_page(path='dashboard', content=Dashboard)
        # renders at '/dashboard'
        dashboard_group.add_index(content=DashboardHome)
        dashboard_group.add_page(path='settings', content=DashboardSettings)
        ```

        :param case_sensitive: whether the route is case sensitive
        :param id: unique id for the route
        :param metadata: metadata for the route
        """
        if metadata is None:
            metadata = {}
        route = IndexRoute(content=content, case_sensitive=case_sensitive, id=id, metadata=metadata)
        route._attach_to_parent(self)
        self.children.append(route)
        return route


class IndexRoute(BaseRoute):
    """
    Index routes render into their parent's Outlet() at their parent URL (like a default child route).
    Index routes can't have children.

    ```python
    from dara.core.router import Router

    router = Router()
    # renders at '/'
    router.add_index(content=Home)

    dashboard_group = router.add_page(path='dashboard', content=Dashboard)
    # renders at '/dashboard'
    dashboard_group.add_index(content=DashboardHome)
    dashboard_group.add_page(path='settings', content=DashboardSettings)
    ```
    """

    index: Literal[True] = True
    content: Optional[Callable[..., ComponentInstance]] = None


class PageRoute(BaseRoute, HasChildRoutes):
    """
    Standard route with a unique URL segment and content to render
    """

    path: str
    content: Callable[..., ComponentInstance]

    def __init__(self, *children: BaseRoute, **kwargs):
        routes = list(children)
        if 'children' not in kwargs:
            kwargs['children'] = routes
        super().__init__(**kwargs)


class LayoutRoute(BaseRoute, HasChildRoutes):
    """
    Layout route creates a route with a layout component to render without adding any segments to the URL

    ```python
    from dara.core.router import Router

    router = Router()

    # no path on this parent route, just the layout
    marketing_group = router.add_layout(content=MarketingLayout)
    marketing_group.add_index(content=MarketingHome)
    marketing_group.add_page(path='contact', content=MarketingContact)

    projects_group = router.add_prefix(path='projects')
    projects_group.add_index(content=ProjectsHome)
    # again, no path, just a component for the layout
    single_project_group = projects_group.add_layout(content=ProjectLayout)
    single_project_group.add_page(path=':pid', content=Project)
    single_project_group.add_page(path=':pid/edit', content=EditProject)
    ```

    Note that:
    - Home and Contact will be rendered into the MarketingLayout outlet
    - Project and EditProject will be rendered into the ProjectLayout outlet while ProjectsHome will not.
    """

    content: Callable[..., ComponentInstance]

    def __init__(self, *children: BaseRoute, **kwargs):
        routes = list(children)
        if 'children' not in kwargs:
            kwargs['children'] = routes
        super().__init__(**kwargs)


class PrefixRoute(BaseRoute, HasChildRoutes):
    """
    Prefix route creates a group of routes with a common prefix without a specific component to render

    ```python
    from dara.core.router import Router

    router = Router()

    # no component, just a prefix
    projects_group = router.add_prefix(path='projects')
    projects_group.add_index(content=ProjectsHome)
    projects_group.add_page(path=':pid', content=ProjectHome)
    projects_group.add_page(path=':pid/edit', content=ProjectEdit)
    ```

    This creates the routes /projects, /projects/:pid, and /projects/:pid/edit without introducing a layout component.
    """

    path: str

    def __init__(self, *children: BaseRoute, **kwargs):
        routes = list(children)
        if 'children' not in kwargs:
            kwargs['children'] = routes
        super().__init__(**kwargs)


class Router(HasChildRoutes):
    """
    Router is the main class for defining routes in a Dara application.
    You can choose to construct a Router with the object API or a fluent API.

    Fluent API (building routes gradually using methods):

    ```python
    from dara.core.router import Router

    router = Router()

    # Add a regular page at '/about'
    router.add_page(path='about', content=AboutPage)

    # Add a layout that wraps child routes without adding URL segments
    marketing_group = router.add_layout(content=MarketingLayout)
    marketing_group.add_index(content=MarketingHome) # renders at '/'
    marketing_group.add_page(path='contact', content=MarketingContact) # renders at '/contact'

    # Add a prefix group for related routes
    api_group = router.add_prefix(path='my-api')
    api_group.add_page(path='users', content=UsersPage)  # renders at '/my-api/users'
    api_group.add_page(path='posts/:id', content=PostDetail)  # renders at '/my-api/posts/:id'
    ```

    Object API (defining children directly):

    ```python
    from dara.core.router import Router, IndexRoute, PageRoute, LayoutRoute, PrefixRoute

    router = Router(children=[
        # Regular page at '/about'
        PageRoute(path='about', content=AboutPage),

        # Layout that wraps child routes without adding URL segments
        LayoutRoute(
            content=MarketingLayout,
            children=[
                IndexRoute(content=MarketingHome),  # renders at '/'
                PageRoute(path='contact', content=MarketingContact)  # renders at '/contact'
            ]
        ),

        # Prefix group for related routes
        PrefixRoute(
            path='my-api',
            children=[
                PageRoute(path='users', content=UsersPage),  # renders at '/myapi/users'
                PageRoute(path='posts/:id', content=PostDetail)  # renders at '/myapi/posts/:id'
            ]
        )
    ])
    ```

    Both approaches create the same routing structure. The fluent API is more readable for
    building routes step by step, while the object API is more declarative and compact.
    """

    def __init__(self, *children: BaseRoute, **kwargs):
        routes = list(children)
        if 'children' not in kwargs:
            kwargs['children'] = routes
        super().__init__(**kwargs)


OutletDef = JsComponentDef(name='Outlet', js_module='@darajs/core', py_module='dara.core')


class Outlet(ComponentInstance):
    """
    Outlet component is a placeholder for the content of the current route.
    """


LinkDef = JsComponentDef(name='Link', js_module='@darajs/core', py_module='dara.core')


class Link(ComponentInstance):
    """
    Link component is a wrapper around the NavLink component that displays a link to the specified route.
    """

    case_sensitive: bool = False

    children: List[ComponentInstance]

    end: bool = False
    """
    Changes the matching logic for the 'active' state to only match the end of the 'to' prop.
    If the URL is longer, it will not be considered active.

    For example, NavLink(to='/tasks') while on '/tasks/123' will:
    - with `end=False`, be considered active because of the partial match of the `/tasks` part
    - with `end=True`, be considered inactive because of the missing '123' part
    """

    prefetch: Literal['none', 'intent', 'render', 'viewport'] = 'none'
    """
    Defines the data and module prefetching behavior for the link.
    - none — default, no prefetching
    - intent — prefetches when the user hovers or focuses the link
    - render — prefetches when the link renders
    - viewport — prefetches when the link is in the viewport, very useful for mobile
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

    to: Union[str, RouterPath]
    """
    Can be a string or RouterPath object
    """

    # TODO: add scroll restoration if it works?
