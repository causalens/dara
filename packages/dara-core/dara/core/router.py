import inspect
import re
from abc import abstractmethod
from typing import Annotated, Any, Callable, Dict, List, Literal, Optional, TypedDict, Union
from urllib.parse import quote
from uuid import uuid4

from pydantic import (
    BaseModel,
    BeforeValidator,
    Field,
    PrivateAttr,
    SerializeAsAny,
    SerializerFunctionWrapHandler,
    field_validator,
    model_serializer,
)

from dara.core.base_definitions import Action
from dara.core.definitions import ComponentInstance, JsComponentDef, StyledComponentInstance, transform_raw_css
from dara.core.interactivity import Variable
from dara.core.persistence import PersistenceStore  # noqa: F401

# Matches :param or :param? (captures the name without the colon)
PARAM_REGEX = re.compile(r':([\w-]+)\??')

# Matches a trailing * (wildcard)
STAR_REGEX = re.compile(r'\*$')


def find_patterns(path: str) -> List[str]:
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
    param_name: str

    async def init(self, variable: 'Variable'):
        # noop
        pass


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


class RouteData(BaseModel):
    """
    Data structure representing a route in the router
    """

    content: Optional[ComponentInstance] = None
    on_load: Optional[Action] = None
    definition: Optional['BaseRoute'] = None


class BaseRoute(BaseModel):
    case_sensitive: bool = False
    """
    Whether the route is case sensitive
    """

    id: Optional[str] = Field(default=None, pattern=r'^[a-zA-Z0-9-_]+$')
    """
    Unique identifier for the route.
    Must only contain alphanumeric characters, dashes and underscores.
    """

    name: Optional[str] = None
    """
    Name of the route, used for window.title display. If not set, defaults to
    the route path.
    """

    metadata: dict = Field(default_factory=dict, exclude=True)
    """
    Metadata for the route. This is used to store arbitrary data that can be used by the application.
    """

    on_load: SerializeAsAny[Optional[Action]] = Field(default=None)
    """
    Action to execute when the route is loaded.
    Guaranteed to be executed before the route content is rendered.
    """

    uid: str = Field(default_factory=lambda: uuid4().hex, exclude=True)
    """
    Internal unique identifier for the route
    """

    compiled_data: Optional[RouteData] = Field(default=None, exclude=True, repr=False)
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
        If the route has a name, it will be returned. Otherwise, the route function name.
        """
        if self.name:
            return self.name

        if content := getattr(self, 'content', None):
            return content.__name__

        return self.full_path or self.get_identifier()

    @abstractmethod
    def compile(self):
        path = self.full_path
        if path:
            validate_full_path(path)

    @property
    def route_data(self) -> RouteData:
        if self.compiled_data is None:
            raise ValueError(f'Route {self.full_path} has not been compiled')
        return self.compiled_data

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

    @model_serializer(mode='wrap')
    def ser_model(self, nxt: SerializerFunctionWrapHandler) -> dict:
        props = nxt(self)
        props['__typename'] = self.__class__.__name__
        props['full_path'] = self.full_path
        # ID defaults to full path when serializing
        if not props.get('id'):
            props['id'] = quote(self.get_identifier())
        if not props.get('name'):
            props['name'] = self.get_name()
        return props


class HasChildRoutes(BaseModel):
    children: SerializeAsAny[List['BaseRoute']] = Field(default_factory=list)

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
        name: Optional[str] = None,
        id: Optional[str] = None,
        metadata: Optional[dict] = None,
        on_load: Optional[Action] = None,
    ):
        """
        Standard route with a unique URL segment and content to render

        :param path: URL segment
        :param content: component to render
        :param case_sensitive: whether the route is case sensitive
        :param name: unique name for the route, used for window.name display. If not set, defaults to the route path.
        :param id: unique id for the route
        :param metadata: metadata for the route
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
        on_load: Optional[Action] = None,
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
        - MarketingHome and MarketingContact will be rendered into the MarketingLayout outlet
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
            on_load=on_load,
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
        on_load: Optional[Action] = None,
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
        route = PrefixRoute(path=path, case_sensitive=case_sensitive, id=id, metadata=metadata, on_load=on_load)
        route._attach_to_parent(self)
        self.children.append(route)
        return route

    def add_index(
        self,
        *,
        content: Callable[..., ComponentInstance],
        case_sensitive: bool = False,
        name: Optional[str] = None,
        id: Optional[str] = None,
        metadata: Optional[dict] = None,
        on_load: Optional[Action] = None,
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
        :param name: unique name for the route, used for window.name display. If not set, defaults to the route path.
        :param id: unique id for the route
        :param metadata: metadata for the route
        """
        if metadata is None:
            metadata = {}
        route = IndexRoute(
            content=content, case_sensitive=case_sensitive, id=id, metadata=metadata, on_load=on_load, name=name
        )
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
    content: Callable[..., ComponentInstance] = Field(exclude=True)

    def compile(self):
        super().compile()
        self.compiled_data = RouteData(
            content=execute_route_func(self.content, self.full_path), on_load=self.on_load, definition=self
        )


class PageRoute(BaseRoute, HasChildRoutes):
    """
    Standard route with a unique URL segment and content to render
    """

    path: str
    content: Callable[..., ComponentInstance] = Field(exclude=True)

    def __init__(self, *children: BaseRoute, **kwargs):
        routes = list(children)
        if 'children' not in kwargs:
            kwargs['children'] = routes
        super().__init__(**kwargs)

    def compile(self):
        super().compile()
        self.compiled_data = RouteData(
            content=execute_route_func(self.content, self.full_path), on_load=self.on_load, definition=self
        )
        for child in self.children:
            child.compile()


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

    content: Callable[..., ComponentInstance] = Field(exclude=True)

    def __init__(self, *children: BaseRoute, **kwargs):
        routes = list(children)
        if 'children' not in kwargs:
            kwargs['children'] = routes
        super().__init__(**kwargs)

    def compile(self):
        super().compile()
        self.compiled_data = RouteData(
            on_load=self.on_load, content=execute_route_func(self.content, self.full_path), definition=self
        )
        for child in self.children:
            child.compile()


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

    def compile(self):
        super().compile()
        self.compiled_data = RouteData(on_load=self.on_load, definition=self)
        for child in self.children:
            child.compile()


class Router(HasChildRoutes):
    """
    Router is the main class for defining routes in a Dara application.
    You can choose to construct a Router with the object API or a fluent API.

    Fluent API (building routes gradually using methods):

    ```python
    from dara.core.router import Router

    router = Router()

    # Add home and public pages
    router.add_index(content=HomePage)
    router.add_page(path='about', content=AboutPage)

    # Add a layout that wraps authenticated routes
    dashboard_layout = router.add_layout(content=DashboardLayout)
    dashboard_layout.add_page(path='dashboard', content=DashboardHome)
    dashboard_layout.add_page(path='profile', content=UserProfile)

    # Add a prefix group for blog routes
    blog_group = router.add_prefix(path='blog')
    blog_group.add_index(content=BlogHome)  # renders at '/blog'
    blog_group.add_page(path='post/:id', content=BlogPost)  # renders at '/blog/post/:id'
    ```

    Object API (defining children directly):

    ```python
    from dara.core.router import Router, IndexRoute, PageRoute, LayoutRoute, PrefixRoute

    router = Router(children=[
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

    def to_route_map(self) -> Dict[str, RouteData]:
        """
        Convert the route tree into a dictionary of route data keyed by unique route identifiers.
        """
        routes: Dict[str, RouteData] = {}

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

    def get_navigable_routes(self) -> List[NavigableRoute]:
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

    def _print_routes(self, routes: List['BaseRoute'], prefix: str = ''):
        """Helper method to recursively print route tree structure"""
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
                    content_name = getattr(route_content, '__name__', str(route_content))
                    route_info += f' [{content_name}]'
            elif isinstance(route, LayoutRoute):
                # Layout route: show in angle brackets
                if route_content:
                    content_name = getattr(route_content, '__name__', str(route_content))
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
                    content_name = getattr(route_content, '__name__', str(route_content))
                    route_info += f' [{content_name}]'

            print(current_prefix + route_info)

            # Recursively print children if they exist
            route_children = getattr(route, 'children', None)
            if route_children:
                self._print_routes(route_children, next_prefix)


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


def execute_route_func(func: Callable[..., ComponentInstance], path: Optional[str]):
    assert path is not None, 'Path should not be None, internal error'

    path_params = find_patterns(path)

    kwargs = {}

    signature = inspect.signature(func)

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
    return func(**kwargs)


def make_legacy_page_wrapper(content):
    def legacy_page_wrapper():
        return content

    return legacy_page_wrapper


def convert_template_to_router(template):
    """
    Convert old template system to new Router structure.

    The conversion maps:
    - Template.layout becomes the content of a root LayoutRoute, but with transformations:
      - RouterContent components are replaced with Outlet components
      - RouterContent.routes are extracted and become PageRoute/IndexRoute children
    - Routes with route='/' become IndexRoute, others become PageRoute
    - Route paths are normalized (leading slashes removed)

    :param template: Template object with layout component containing RouterContent
    :return: Router instance with converted structure
    """
    from dara.core.definitions import TemplateRouterContent
    from dara.core.visual.components.router_content import RouterContent

    router = Router()
    extracted_routes: List[TemplateRouterContent] = []

    # Transform the layout: replace RouterContent with Outlet and extract routes
    def transform_component(component):
        """Recursively transform components, replacing RouterContent with Outlet"""
        # For other components, recursively transform their children/content
        if isinstance(component, ComponentInstance):
            if isinstance(component, RouterContent):
                extracted_routes.extend(component.routes)
                return Outlet()

            for attr in component.model_fields_set:
                value = getattr(component, attr, None)
                if isinstance(value, ComponentInstance):
                    setattr(component, attr, transform_component(value))
                elif isinstance(value, list) and len(value) > 0 and isinstance(value[0], ComponentInstance):
                    setattr(component, attr, [transform_component(item) for item in value])

        return component

    # Transform the template layout
    transformed_layout = transform_component(template.layout)

    # Create a wrapper function for the transformed layout
    def layout_wrapper():
        return transformed_layout

    # Create root layout route using transformed template layout
    root_layout = router.add_layout(content=layout_wrapper)

    # Convert extracted routes to appropriate route types
    for route_content in extracted_routes:
        # Normalize route path: remove leading slash and handle root
        route_path = route_content.route
        if route_path.startswith('/'):
            route_path = route_path[1:]

        # the make_ function must be defined outside the lazy evaluation of loop variable issue
        legacy_page_wrapper = make_legacy_page_wrapper(route_content.content)

        # NOTE: here it's safe to use the name as the id, as in the old api the name was unique
        # but use 'index' for empty strings

        # Root path becomes index route
        if route_path in {'', '/'}:
            root_layout.add_index(
                content=legacy_page_wrapper,
                name=route_content.name,
                id=route_content.name or 'index',
                on_load=route_content.on_load,
            )
        else:
            root_layout.add_page(
                path=route_path,
                content=legacy_page_wrapper,
                name=route_content.name,
                id=route_content.name or 'index',
                on_load=route_content.on_load,
            )

    return router


# required to make pydantic happy
IndexRoute.model_rebuild()
PageRoute.model_rebuild()
LayoutRoute.model_rebuild()
PrefixRoute.model_rebuild()
RouteData.model_rebuild()
Router.model_rebuild()
