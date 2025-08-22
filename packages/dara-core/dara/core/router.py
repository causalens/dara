from typing import Callable, List, Literal, Optional

from pydantic import BaseModel, Field

from dara.core.definitions import ComponentInstance


class BaseRoute(BaseModel):
    case_sensitive: bool = False
    id: Optional[str] = None
    metadata: dict = Field(default_factory=dict)


class HasChildRoutes(BaseModel):
    children: List['BaseRoute'] = Field(default_factory=list)

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

    Fluent API:

    """

    pass
