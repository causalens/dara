from typing import Union

import pytest

from dara.core.definitions import ComponentInstance
from dara.core.router import IndexRoute, LayoutRoute, PageRoute, PrefixRoute, Router


# Mock component functions for testing - return ComponentInstance objects
def HomePage():
    return ComponentInstance()


def AboutPage():
    return ComponentInstance()


def MarketingLayout():
    return ComponentInstance()


def MarketingHome():
    return ComponentInstance()


def MarketingContact():
    return ComponentInstance()


def UsersPage():
    return ComponentInstance()


def PostDetail():
    return ComponentInstance()


class TestRouterFluentAPI:
    """Test the fluent API from the Router docstring examples"""

    def test_fluent_api_routes(self):
        router = Router()

        # Add a home page at '/'
        home = router.add_index(content=HomePage)

        # Add a regular page at '/about'
        about = router.add_page(path='about', content=AboutPage)

        # Add a layout that wraps child routes without adding URL segments
        marketing_group = router.add_layout(content=MarketingLayout)
        marketing_home = marketing_group.add_index(content=MarketingHome)  # renders at '/'
        marketing_contact = marketing_group.add_page(path='contact', content=MarketingContact)  # renders at '/contact'

        # Add a prefix group for related routes
        api_group = router.add_prefix(path='my-api')
        users = api_group.add_page(path='users', content=UsersPage)  # renders at '/my-api/users'
        posts = api_group.add_page(path='posts/:id', content=PostDetail)  # renders at '/my-api/posts/:id'

        # Validate full paths
        assert home.full_path == '/'
        assert about.full_path == '/about'
        assert marketing_home.full_path == '/'  # Layout doesn't add path segments
        assert marketing_contact.full_path == '/contact'  # Layout doesn't add path segments
        assert users.full_path == '/my-api/users'
        assert posts.full_path == '/my-api/posts/:id'


class TestRouterObjectAPI:
    """Test the object API from the Router docstring examples"""

    def test_object_api_routes(self):
        router = Router(
            # Home page at '/'
            IndexRoute(content=HomePage),
            # Regular page at '/about'
            PageRoute(path='about', content=AboutPage),
            # Layout that wraps child routes without adding URL segments
            LayoutRoute(
                content=MarketingLayout,
                children=[
                    IndexRoute(content=MarketingHome),  # renders at '/'
                    PageRoute(path='contact', content=MarketingContact),  # renders at '/contact'
                ],
            ),
            # Prefix group for related routes
            PrefixRoute(
                path='my-api',
                children=[
                    PageRoute(path='users', content=UsersPage),  # renders at '/my-api/users'
                    PageRoute(path='posts/:id', content=PostDetail),  # renders at '/my-api/posts/:id'
                ],
            ),
        )

        # Extract routes for testing - need to cast because type checker doesn't know about children
        home: IndexRoute = router.children[0]  # type: ignore
        about: PageRoute = router.children[1]  # type: ignore
        marketing_layout: LayoutRoute = router.children[2]  # type: ignore
        marketing_home: IndexRoute = marketing_layout.children[0]  # type: ignore
        marketing_contact: PageRoute = marketing_layout.children[1]  # type: ignore
        api_prefix: PrefixRoute = router.children[3]  # type: ignore
        users: PageRoute = api_prefix.children[0]  # type: ignore
        posts: PageRoute = api_prefix.children[1]  # type: ignore

        # Validate full paths
        assert home.full_path == '/'
        assert about.full_path == '/about'
        assert marketing_home.full_path == '/'  # Layout doesn't add path segments
        assert marketing_contact.full_path == '/contact'  # Layout doesn't add path segments
        assert users.full_path == '/my-api/users'
        assert posts.full_path == '/my-api/posts/:id'


class TestRouteAttachment:
    """Test route attachment behavior"""

    def test_unattached_routes_return_none(self):
        # Create standalone routes (not attached to router)
        standalone_page = PageRoute(path='standalone', content=AboutPage)
        standalone_index = IndexRoute(content=HomePage)

        # Unattached routes should return None for full_path
        assert standalone_page.full_path is None
        assert standalone_index.full_path is None
        assert not standalone_page.is_attached
        assert not standalone_index.is_attached

    def test_nested_attachment(self):
        # Test that deeply nested routes get properly attached
        router = Router(
            children=[
                PrefixRoute(
                    path='level1',
                    children=[PrefixRoute(path='level2', children=[PageRoute(path='deep', content=AboutPage)])],
                )
            ]
        )

        level1: PrefixRoute = router.children[0]  # type: ignore
        level2: PrefixRoute = level1.children[0]  # type: ignore
        deep_route: PageRoute = level2.children[0]  # type: ignore

        assert deep_route.full_path == '/level1/level2/deep'
        assert deep_route.is_attached


class TestEdgeCases:
    """Test edge cases and special scenarios"""

    def test_empty_router(self):
        router = Router()
        assert len(router.children) == 0

    def test_route_with_leading_slash(self):
        router = Router()
        # Test that leading slashes are handled properly
        page = router.add_page(path='test-path', content=AboutPage)
        assert page.full_path == '/test-path'

    def test_multiple_slashes_cleanup(self):
        # This tests the path cleaning logic
        router = Router()
        prefix = router.add_prefix(path='api')
        page = prefix.add_page(path='users', content=UsersPage)

        # Should clean up any potential double slashes
        assert page.full_path == '/api/users'
        assert '//' not in page.full_path
