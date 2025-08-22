from typing import Callable, List, Literal, Optional

from pydantic import BaseModel, Field

from dara.core.definitions import ComponentInstance


class BaseRoute(BaseModel):
    case_sensitive: bool = False
    id: Optional[str] = None
    metadata: dict = Field(default_factory=dict)


class HasChildRoutes(BaseModel):
    children: List['BaseRoute'] = Field(default_factory=list)

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
        self.children.append(route)
        return route

    def add_index(
        self,
        *,
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
        route = IndexRoute(case_sensitive=case_sensitive, id=id, metadata=metadata)
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


class Router(HasChildRoutes):
    """
    Router is the main class for defining routes in a Dara application.
    You can choose to construct a Router with the object API or a fluent API.

    Fluent API (building routes gradually using methods):

    ```python
    from dara.core.router import Router

    router = Router()

    # Add a home page at '/'
    router.add_index(content=HomePage)

    # Add a regular page at '/about'
    router.add_page(path='about', content=AboutPage)

    # Add a layout that wraps child routes without adding URL segments
    dashboard_layout = router.add_layout(content=DashboardLayout)
    dashboard_layout.add_index(content=DashboardHome)  # renders at '/dashboard'
    dashboard_layout.add_page(path='settings', content=DashboardSettings)  # renders at '/settings'

    # Add a prefix group for related routes
    api_group = router.add_prefix(path='my-api')
    api_group.add_page(path='users', content=UsersPage)  # renders at '/my-api/users'
    api_group.add_page(path='posts/:id', content=PostDetail)  # renders at '/my-api/posts/:id'
    ```

    Object API (defining children directly):

    ```python
    from dara.core.router import Router, IndexRoute, PageRoute, LayoutRoute, PrefixRoute

    router = Router(children=[
        # Home page at '/'
        IndexRoute(content=HomePage),

        # Regular page at '/about'
        PageRoute(path='about', content=AboutPage),

        # Layout that wraps child routes
        LayoutRoute(
            content=DashboardLayout,
            children=[
                IndexRoute(content=DashboardHome),  # renders at '/dashboard'
                PageRoute(path='settings', content=DashboardSettings)  # renders at '/settings'
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
