import inspect
import re
from abc import abstractmethod
from collections.abc import Callable
from typing import Any, Literal, Optional, TypedDict
from urllib.parse import quote
from uuid import uuid4

from pydantic import (
    BaseModel,
    Field,
    PrivateAttr,
    SerializeAsAny,
    SerializerFunctionWrapHandler,
    field_validator,
    model_serializer,
)

from dara.core.base_definitions import Action
from dara.core.definitions import ComponentInstance
from dara.core.interactivity import Variable
from dara.core.persistence import PersistenceStore  # noqa: F401

from .dependency_graph import DependencyGraph

# Matches :param or :param? (captures the name without the colon)
PARAM_REGEX = re.compile(r':([\w-]+)\??')

# Matches a trailing * (wildcard)
STAR_REGEX = re.compile(r'\*$')


def find_patterns(path: str) -> list[str]:
    """
    Extract param names from a React-Router-style path.

    Examples:
    >>> find_patterns("/:foo/:bar")
    ['foo', 'bar']
    >>> find_patterns("/:foo/:bar?")
    ['foo', 'bar']
    >>> find_patterns("/foo/*")
    ['*']
    >>> find_patterns("/*")
    ['*']
    """
    params = PARAM_REGEX.findall(path)

    if STAR_REGEX.search(path):
        params.append('*')

    return params


def validate_full_path(value: str):
    if value.startswith('/api'):
        raise ValueError(f'/api is a reserved prefix, router paths cannot start with it - found "{value}"')

    params = find_patterns(value)

    seen_params = set()
    for param in params:
        if param in seen_params:
            raise ValueError(
                f'Duplicate path param found - found "{param}" more than once in "{value}". Param names must be unique'
            )
        seen_params.add(param)


class _PathParamStore(PersistenceStore):
    """
    Internal store for path parameters.
    Should not be used directly, Variables with this store can only be used within
    a page with matching path params.
    """

    param_name: str

    async def init(self, variable: 'Variable'):
        # noop
        pass


class _RouteMatchStore(PersistenceStore):
    """
    Internal store for route matches.
    Should not be used directly, Dara will use this internally to keep a variable
    in sync with the current route matches.
    """

    async def init(self, variable: 'Variable'):
        # noop
        pass


class RouteMatch(BaseModel):
    """
    Data structure representing a route match in the router
    """

    id: str
    """
    Route ID, as set when defining the route
    """

    pathname: str
    """
    Full pathname of the route
    """

    params: dict[str, Any]
    """
    Mapping of dynamic path params to their values
    """

    definition: 'BaseRoute'
    """
    Definition of the route
    """


class RouteData(BaseModel):
    """
    Data structure representing a route in the router
    """

    content: ComponentInstance | None = None
    on_load: Action | None = None
    definition: Optional['BaseRoute'] = None
    dependency_graph: DependencyGraph | None = Field(default=None, exclude=True)


class BaseRoute(BaseModel):
    """
    Base class for all route types.
    """

    case_sensitive: bool = False
    """
    Whether the route is case sensitive
    """

    id: str | None = Field(default=None, pattern=r'^[a-zA-Z0-9-_]+$')
    """
    Unique identifier for the route.
    Must only contain alphanumeric characters, dashes and underscores.
    """

    name: str | None = None
    """
    Name of the route, used for window.title display. If not set, defaults to
    the route path.
    """

    metadata: dict = Field(default_factory=dict, exclude=True)
    """
    Metadata for the route. This is used to store arbitrary data that can be used by the application.
    """

    fallback: SerializeAsAny[ComponentInstance | None] = Field(default=None)
    """
    Fallback component to render while `on_load` is running.
    If not set, Dara will wait until `on_load` completes before completing the navigation.
    If provided, Dara will navigate immediately and show the fallback component while `on_load` is running.

    Note that this impacts the navigation when nested routes are involved. For example,
    when navigating from `/a` to `/b/c` (assuming `b` and `c` both have `on_load` actions),
    Dara will hold the navigation until both `b` and `c` have completed their `on_load` actions.
    If only one of them is slow, you might want to consider setting an explicit `fallback` for it
    if it's desirable to navigate to the other route immediately.
    """

    on_load: SerializeAsAny[Action | None] = Field(default=None)
    """
    Action to execute when the route is loaded.
    Guaranteed to be executed before the route content is rendered.
    """

    uid: str = Field(default_factory=lambda: uuid4().hex, exclude=True)
    """
    Internal unique identifier for the route
    """

    compiled_data: RouteData | None = Field(default=None, exclude=True, repr=False)
    """
    Internal compiled data for the route
    """

    _parent: Optional['BaseRoute'] = PrivateAttr(default=None)
    """
    Internal parent pointer for the route
    """

    @field_validator('id', mode='before')
    @classmethod
    def convert_id(cls, value: Any):
        # will be failed by string validation
        if not isinstance(value, str):
            return value
        # matches legacy page.name handling
        return value.lower().strip().replace(' ', '-')

    def _attach_to_parent(self, parent):
        """Internal method to attach route to parent"""
        self._parent = parent
        # Recursively attach any existing children
        children = getattr(self, 'children', None)
        if children:
            for child in children:
                child._attach_to_parent(self)

    @property
    def parent(self):
        """
        Parent route of this route.
        Note that for routes not yet attached to a router or parent, this will return None.
        """
        return self._parent

    def get_identifier(self):
        """
        Get the unique identifier for the route.
        If the route has an id, it will be returned. Otherwise, the route path and internal uid will be used.
        """
        if self.id:
            return self.id

        if path := self.full_path:
            return path.replace('/', '_') + '_' + self.uid

        raise ValueError('Identifier cannot be determined, route is not attached to a router')

    def get_name(self):
        """
        Get the human-readable name of the route.
        If the route has a name, it will be returned.
        Otherwise, attempts to derive from content function name or generates from path.
        """
        if self.name:
            return self.name

        if content := getattr(self, 'content', None):
            # If content is callable, use its name
            if callable(content):
                return content.__name__
            # If content is ComponentInstance, generate name from path
            elif isinstance(content, ComponentInstance):
                path = self.full_path
                if path and path != '/':
                    # Convert path to readable name (e.g., '/about/team' -> 'About Team')
                    return ' '.join(
                        word.capitalize() for word in path.strip('/').replace('-', ' ').replace('_', ' ').split('/')
                    )

        return self.full_path or self.get_identifier()

    @abstractmethod
    def compile(self):
        """
        Compile the route, validating it and generating compiled data
        """
        path = self.full_path
        if path:
            validate_full_path(path)

    @property
    def route_data(self) -> RouteData:
        """
        Compiled route data for this route.
        Raises ValueError if the route has not been compiled yet.
        """
        if self.compiled_data is None:
            raise ValueError(f'Route {self.full_path} has not been compiled')
        return self.compiled_data

    @property
    def full_path(self) -> str | None:
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

    @model_serializer(mode='wrap')
    def ser_model(self, nxt: SerializerFunctionWrapHandler) -> dict:
        props = nxt(self)
        props['__typename'] = self.__class__.__name__
        props['full_path'] = self.full_path
        props['id'] = quote(self.get_identifier())
        props['name'] = self.get_name()

        assert self.compiled_data is not None
        props['dependency_graph'] = self.compiled_data.dependency_graph
        return props


class HasChildRoutes(BaseModel):
    """
    Mixin class for objects that can have child routes.
    """

    children: SerializeAsAny[list['BaseRoute']] = Field(default_factory=list)
    """
    List of child routes.
    Should not be set directly. Use `set_children` or one of the `add_*` methods instead.
    """

    def __init__(self, *children: list[BaseRoute], **kwargs):
        routes = list(children)
        if 'children' not in kwargs:
            kwargs['children'] = routes
        super().__init__(**kwargs)

    def model_post_init(self, __context):
        """Automatically attach all children after construction"""
        for child in self.children:
            child._attach_to_parent(self)

    def set_children(self, children: list[BaseRoute]):
        """
        Set the children of the router.

        :param children: list of child routes
        """
        self.children = children
        for child in self.children:
            child._attach_to_parent(self)

    def add_page(
        self,
        *,
        path: str,
        content: Callable[..., ComponentInstance] | ComponentInstance,
        case_sensitive: bool = False,
        name: str | None = None,
        id: str | None = None,
        metadata: dict | None = None,
        on_load: Action | None = None,
        fallback: ComponentInstance | None = None,
    ):
        """
        Standard route with a unique URL segment and content to render

        :param path: URL segment
        :param content: component to render
        :param case_sensitive: whether the route is case sensitive
        :param name: unique name for the route, used for window.name display. If not set, defaults to the route path.
        :param id: unique id for the route
        :param metadata: metadata for the route
        :param on_load: action to execute when the route is loaded
        :param fallback: fallback component to render while `on_load` is running
        """
        if metadata is None:
            metadata = {}

        route = PageRoute(
            path=path,
            content=content,
            case_sensitive=case_sensitive,
            name=name,
            id=id,
            metadata=metadata,
            on_load=on_load,
            fallback=fallback,
        )
        route._attach_to_parent(self)
        self.children.append(route)
        return route

    def add_layout(
        self,
        *,
        content: Callable[..., ComponentInstance] | ComponentInstance,
        case_sensitive: bool = False,
        id: str | None = None,
        metadata: dict | None = None,
        on_load: Action | None = None,
        fallback: ComponentInstance | None = None,
    ):
        """
        Layout route creates a route with a layout component to render without adding any segments to the URL

        ```python
        from dara.core import ConfigurationBuilder

        config = ConfigurationBuilder()

        # no path on this parent route, just the layout
        marketing_group = config.router.add_layout(content=MarketingLayout)
        marketing_group.add_index(content=MarketingHome)
        marketing_group.add_page(path='contact', content=MarketingContact)

        projects_group = config.router.add_prefix(path='projects')
        projects_group.add_index(content=ProjectsHome)
        # again, no path, just a component for the layout
        single_project_group = projects_group.add_layout(content=ProjectLayout)
        single_project_group.add_page(path=':pid', content=Project)
        single_project_group.add_page(path=':pid/edit', content=EditProject)
        ```

        Note that:
        - MarketingHome and MarketingContact will be rendered into the MarketingLayout outlet
        - Project and EditProject will be rendered into the ProjectLayout outlet while ProjectsHome will not.

        :param content: layout component to render
        :param case_sensitive: whether the route is case sensitive
        :param id: unique id for the route
        :param metadata: metadata for the route
        :param on_load: action to execute when the route is loaded
        :param fallback: fallback component to render while `on_load` is running
        """
        if metadata is None:
            metadata = {}

        route = LayoutRoute(
            content=content,
            case_sensitive=case_sensitive,
            id=id,
            metadata=metadata,
            on_load=on_load,
            fallback=fallback,
        )
        route._attach_to_parent(self)
        self.children.append(route)
        return route

    def add_prefix(
        self,
        *,
        path: str,
        case_sensitive: bool = False,
        id: str | None = None,
        metadata: dict | None = None,
        on_load: Action | None = None,
        fallback: ComponentInstance | None = None,
    ):
        """
        Prefix route creates a group of routes with a common prefix without a specific component to render

        ```python
        from dara.core import ConfigurationBuilder

        config = ConfigurationBuilder()

        # no component, just a prefix
        projects_group = config.router.add_prefix(path='projects')
        projects_group.add_index(content=ProjectsHome)
        projects_group.add_page(path=':pid', content=ProjectHome)
        projects_group.add_page(path=':pid/edit', content=ProjectEdit)
        ```

        This creates the routes /projects, /projects/:pid, and /projects/:pid/edit without introducing a layout component.

        :param path: prefix path
        :param case_sensitive: whether the route is case sensitive
        :param id: unique id for the route
        :param metadata: metadata for the route
        :param on_load: action to execute when the route is loaded
        :param fallback: fallback component to render while `on_load` is running
        """
        if metadata is None:
            metadata = {}
        route = PrefixRoute(
            path=path, case_sensitive=case_sensitive, id=id, metadata=metadata, on_load=on_load, fallback=fallback
        )
        route._attach_to_parent(self)
        self.children.append(route)
        return route

    def add_index(
        self,
        *,
        content: Callable[..., ComponentInstance] | ComponentInstance,
        case_sensitive: bool = False,
        name: str | None = None,
        id: str | None = None,
        metadata: dict | None = None,
        on_load: Action | None = None,
        fallback: ComponentInstance | None = None,
    ):
        """
        Index routes render into their parent's Outlet() at their parent URL (like a default child route).
        Index routes can't have children.

        ```python
        from dara.core import ConfigurationBuilder

        config = ConfigurationBuilder()

        # renders at '/'
        config.router.add_index(content=Home)

        dashboard_group = config.router.add_page(path='dashboard', content=Dashboard)
        # renders at '/dashboard'
        dashboard_group.add_index(content=DashboardHome)
        dashboard_group.add_page(path='settings', content=DashboardSettings)
        ```

        :param case_sensitive: whether the route is case sensitive
        :param name: unique name for the route, used for window.name display. If not set, defaults to the route path.
        :param id: unique id for the route
        :param metadata: metadata for the route
        """
        if metadata is None:
            metadata = {}
        route = IndexRoute(
            content=content,
            case_sensitive=case_sensitive,
            id=id,
            metadata=metadata,
            on_load=on_load,
            name=name,
            fallback=fallback,
        )
        route._attach_to_parent(self)
        self.children.append(route)
        return route


class IndexRoute(BaseRoute):
    """
    Index routes render into their parent's Outlet() at their parent URL (like a default child route).
    Index routes can't have children.

    ```python
    from dara.core import ConfigurationBuilder

    config = ConfigurationBuilder()

    # renders at '/'
    config.router.add_index(content=Home)

    dashboard_group = config.router.add_page(path='dashboard', content=Dashboard)
    # renders at '/dashboard'
    dashboard_group.add_index(content=DashboardHome)
    dashboard_group.add_page(path='settings', content=DashboardSettings)
    ```
    """

    index: Literal[True] = True
    content: Callable[..., ComponentInstance] | ComponentInstance = Field(exclude=True)

    def compile(self):
        super().compile()
        content = _execute_route_func(self.content, self.full_path)

        # Analyze component dependencies
        dependency_graph = DependencyGraph.from_component(content)

        self.compiled_data = RouteData(
            content=content, on_load=self.on_load, definition=self, dependency_graph=dependency_graph
        )


class PageRoute(BaseRoute, HasChildRoutes):
    """
    Standard route with a unique URL segment and content to render.
    """

    path: str
    content: Callable[..., ComponentInstance] | ComponentInstance = Field(exclude=True)

    def __init__(self, *children: BaseRoute, **kwargs):
        routes = list(children)
        if 'children' not in kwargs:
            kwargs['children'] = routes
        super().__init__(**kwargs)

    def compile(self):
        super().compile()
        content = _execute_route_func(self.content, self.full_path)

        # Analyze component dependencies
        dependency_graph = DependencyGraph.from_component(content)

        self.compiled_data = RouteData(
            content=content, on_load=self.on_load, definition=self, dependency_graph=dependency_graph
        )
        for child in self.children:
            child.compile()


class LayoutRoute(BaseRoute, HasChildRoutes):
    """
    Layout route creates a route with a layout component to render without adding any segments to the URL

    ```python
    from dara.core import ConfigurationBuilder


    config = ConfigurationBuilder()

    # no path on this parent route, just the layout
    marketing_group = config.router.add_layout(content=MarketingLayout)
    marketing_group.add_index(content=MarketingHome)
    marketing_group.add_page(path='contact', content=MarketingContact)

    projects_group = config.router.add_prefix(path='projects')
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

    content: Callable[..., ComponentInstance] | ComponentInstance = Field(exclude=True)

    def __init__(self, *children: BaseRoute, **kwargs):
        routes = list(children)
        if 'children' not in kwargs:
            kwargs['children'] = routes
        super().__init__(**kwargs)

    def compile(self):
        super().compile()

        content = _execute_route_func(self.content, self.full_path)
        dependency_graph = DependencyGraph.from_component(content)

        self.compiled_data = RouteData(
            on_load=self.on_load, content=content, definition=self, dependency_graph=dependency_graph
        )
        for child in self.children:
            child.compile()


class PrefixRoute(BaseRoute, HasChildRoutes):
    """
    Prefix route creates a group of routes with a common prefix without a specific component to render

    ```python
    from dara.core import ConfigurationBuilder

    config = ConfigurationBuilder()

    # no component, just a prefix
    projects_group = config.router.add_prefix(path='projects')
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

    def compile(self):
        super().compile()
        self.compiled_data = RouteData(on_load=self.on_load, definition=self)
        for child in self.children:
            child.compile()


class Router(HasChildRoutes):
    """
    Router is the main class for defining routes in a Dara application.
    You can choose to construct a Router with the object API or a fluent API, depending on your needs and preference.

    Fluent API (building routes gradually using methods):

    ```python
    from dara.core import ConfigurationBuilder

    config = ConfigurationBuilder()

    # Add home and public pages
    config.router.add_index(content=HomePage)
    config.router.add_page(path='about', content=AboutPage)

    # Add a layout that wraps authenticated routes
    dashboard_layout = config.router.add_layout(content=DashboardLayout)
    dashboard_layout.add_page(path='dashboard', content=DashboardHome)
    dashboard_layout.add_page(path='profile', content=UserProfile)

    # Add a prefix group for blog routes
    blog_group = config.router.add_prefix(path='blog')
    blog_group.add_index(content=BlogHome)  # renders at '/blog'
    blog_group.add_page(path='post/:id', content=BlogPost)  # renders at '/blog/post/:id'
    ```

    Object API (defining children directly):

    ```python
    from dara.core import ConfigurationBuilder
    from dara.core.router import IndexRoute, PageRoute, LayoutRoute, PrefixRoute

    config = ConfigurationBuilder()
    config.router.set_children([
        # Home page
        IndexRoute(content=HomePage),

        # Public pages
        PageRoute(path='about', content=AboutPage),

        # Layout that wraps authenticated routes
        LayoutRoute(
            content=DashboardLayout,
            children=[
                PageRoute(path='dashboard', content=DashboardHome),
                PageRoute(path='profile', content=UserProfile)
            ]
        ),

        # Prefix group for blog routes
        PrefixRoute(
            path='blog',
            children=[
                IndexRoute(content=BlogHome),  # renders at '/blog'
                PageRoute(path='post/:id', content=BlogPost)  # renders at '/blog/post/:id'
            ]
        )
    ])
    ```

    Both approaches create the same routing structure. The fluent API is more readable for
    building routes step by step, while the object API is more declarative and compact.
    """

    route_matches: Variable[list[RouteMatch]] = Field(default_factory=lambda: Variable([], store=_RouteMatchStore()))
    """
    Variable containing current list of route matches.
    Note that this will be updated by Dara automatically, so you should not modify it directly.
    """

    def __init__(self, *children: BaseRoute, **kwargs):
        routes = list(children)
        if 'children' not in kwargs:
            kwargs['children'] = routes
        super().__init__(**kwargs)

    def compile(self):
        """
        Compile the route tree into a data structure ready for matching:
        - executes all page functions
        - validates route paths
        """
        for child in self.children:
            child.compile()

    def to_route_map(self) -> dict[str, RouteData]:
        """
        Convert the route tree into a dictionary of route data keyed by unique route identifiers.
        """
        routes: dict[str, RouteData] = {}

        def _walk(route: BaseRoute):
            identifier = route.get_identifier()

            routes[identifier] = route.route_data

            if isinstance(route, HasChildRoutes):
                for child in route.children:
                    _walk(child)

        for route in self.children:
            _walk(route)

        return routes

    class NavigableRoute(TypedDict):
        path: str
        name: str
        id: str
        metadata: dict

    def get_navigable_routes(self) -> list[NavigableRoute]:
        """
        Get a flattened list of all navigable routes (PageRoute and IndexRoute only).

        This method filters out layout and prefix routes to return only routes that
        represent actual pages users can navigate to, making it perfect for building menus.

        Returns:
            List of dictionaries containing route information:
            - path: Full URL path
            - name: Route name (for display)
            - id: Route identifier
            - metadata: Route metadata
        """
        navigable_routes = []

        def _collect_navigable(route: BaseRoute):
            # Only include routes that represent actual navigable pages
            if isinstance(route, (PageRoute, IndexRoute)):
                route_info = {
                    'path': route.full_path,
                    'name': route.get_name(),
                    'id': route.get_identifier(),
                    'metadata': route.metadata,
                }
                navigable_routes.append(route_info)

            # Recursively process children
            if isinstance(route, HasChildRoutes):
                for child in route.children:
                    _collect_navigable(child)

        for route in self.children:
            _collect_navigable(route)

        return navigable_routes

    def print_route_tree(self):
        """
        Print a visual representation of the route tree showing:
        - Route hierarchy with indentation
        - Full paths for each route
        - Content/layout functions
        - Index routes marked with (index)

        Example output:
        ```
        Router
        ├─ / (index) [HomePage]
        ├─ /about [AboutPage]
        ├─ <MarketingLayout>
        │  ├─ / (index) [MarketingHome]
        │  └─ /contact [MarketingContact]
        └─ /my-api/
           ├─ /my-api/users [UsersPage]
           └─ /my-api/posts/:id [PostDetail]
        ```
        """
        print('Router')
        self._print_routes(self.children, prefix='')

    def _print_routes(self, routes: list['BaseRoute'], prefix: str = ''):
        """Helper method to recursively print route tree structure"""

        def _format_content(content: Callable[..., ComponentInstance] | ComponentInstance):
            if isinstance(content, ComponentInstance):
                return content.__class__.__name__
            return content.__name__

        for i, route in enumerate(routes):
            is_last = i == len(routes) - 1

            # Determine the tree characters
            if is_last:
                current_prefix = prefix + '└─ '
                next_prefix = prefix + '   '
            else:
                current_prefix = prefix + '├─ '
                next_prefix = prefix + '│  '

            # Build the route description based on route type
            route_content = getattr(route, 'content', None)
            route_path = getattr(route, 'path', None)

            if isinstance(route, IndexRoute):
                # Index route: show path with (index) marker
                full_path = route.full_path or '/'
                route_info = f'{full_path} (index)'
                if route_content:
                    content_name = _format_content(route_content)
                    route_info += f' [{content_name}]'
            elif isinstance(route, LayoutRoute):
                # Layout route: show in angle brackets
                if route_content:
                    content_name = _format_content(route_content)
                    route_info = f'<{content_name}>'
                else:
                    route_info = '<Layout>'
            elif isinstance(route, PrefixRoute):
                # Prefix route: show path with trailing slash
                full_path = route.full_path or f'/{route_path}'
                if not full_path.endswith('/'):
                    full_path += '/'
                route_info = full_path
            else:
                # Page route: show path and content
                full_path = route.full_path or f'/{route_path}'
                route_info = full_path
                if route_content:
                    content_name = _format_content(route_content)
                    route_info += f' [{content_name}]'

            print(current_prefix + route_info)

            # Recursively print children if they exist
            route_children = getattr(route, 'children', None)
            if route_children:
                self._print_routes(route_children, next_prefix)


def _execute_route_func(
    content: Callable[..., ComponentInstance] | ComponentInstance, path: str | None
) -> ComponentInstance:
    """
    Executes a route function or returns a ComponentInstance directly.
    For callables, injects path params into the function signature based on patterns in the path.
    For ComponentInstance objects, returns them directly (ignoring any path params).
    """
    assert path is not None, 'Path should not be None, internal error'

    # If content is already a ComponentInstance, return it directly
    if isinstance(content, ComponentInstance):
        return content

    # Handle callable case (existing logic)
    path_params = find_patterns(path)
    kwargs = {}
    signature = inspect.signature(content)

    for name, param in signature.parameters.items():
        typ = param.annotation

        if name in {'self', 'cls'}:
            continue

        # Reserved name 'splat' for the '*' param
        if name == 'splat' and '*' in path_params:
            kwargs[name] = Variable(store=_PathParamStore(param_name='*'))
            continue

        if name not in path_params:
            raise ValueError(
                f'Invalid page function signature. Kwarg "{name}: {typ}" found but param ":{name}" is missing in path "{path}"'
            )
        if not (inspect.isclass(typ) and issubclass(typ, Variable)):
            raise ValueError(
                f'Invalid page function signature. Kwarg "{name}" found with invalid signature "{type}". Page functions can only accept kwargs annotated with "Variable" corresponding to path params defined on the route'
            )
        kwargs[name] = Variable(store=_PathParamStore(param_name=name))
    return content(**kwargs)


# required to make pydantic happy
IndexRoute.model_rebuild()
PageRoute.model_rebuild()
LayoutRoute.model_rebuild()
PrefixRoute.model_rebuild()
RouteData.model_rebuild()
Router.model_rebuild()
