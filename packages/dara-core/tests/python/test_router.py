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

        # Extract routes for testing using isinstance assertions for type safety
        home = router.children[0]
        about = router.children[1]
        marketing_layout = router.children[2]
        api_prefix = router.children[3]

        assert isinstance(home, IndexRoute)
        assert isinstance(about, PageRoute)
        assert isinstance(marketing_layout, LayoutRoute)
        assert isinstance(api_prefix, PrefixRoute)

        marketing_home = marketing_layout.children[0]
        marketing_contact = marketing_layout.children[1]
        users = api_prefix.children[0]
        posts = api_prefix.children[1]

        assert isinstance(marketing_home, IndexRoute)
        assert isinstance(marketing_contact, PageRoute)
        assert isinstance(users, PageRoute)
        assert isinstance(posts, PageRoute)

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

        level1 = router.children[0]
        assert isinstance(level1, PrefixRoute)

        level2 = level1.children[0]
        assert isinstance(level2, PrefixRoute)

        deep_route = level2.children[0]
        assert isinstance(deep_route, PageRoute)

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


class TestRouteTreePrinting:
    """Test the print_route_tree functionality"""

    def test_print_route_tree_realistic_app(self, capsys):
        """Test route tree with a realistic application structure"""
        router = Router()

        # Home page
        router.add_index(content=HomePage)

        # Public pages
        router.add_page(path='about', content=AboutPage)

        # Blog section
        blog_group = router.add_prefix(path='blog')
        blog_group.add_index(content=BlogHomePage)
        blog_group.add_page(path='post/:id', content=BlogPostPage)

        # Dashboard with authentication layout
        dashboard_layout = router.add_layout(content=DashboardLayout)
        dashboard_layout.add_page(path='dashboard', content=DashboardHomePage)
        dashboard_layout.add_page(path='settings', content=SettingsPage)

        # Admin section
        admin_group = router.add_prefix(path='admin')
        admin_group.add_index(content=AdminHomePage)
        users_group = admin_group.add_prefix(path='users')
        users_group.add_page(path='create', content=UserCreatePage)

        # Call print_route_tree
        router.print_route_tree()

        # Capture output
        captured = capsys.readouterr()

        # Verify new format structure
        assert 'Router' in captured.out
        assert '/ (index) [HomePage]' in captured.out
        assert '/about [AboutPage]' in captured.out
        assert '/blog/' in captured.out
        assert '/blog (index) [BlogHomePage]' in captured.out
        assert '/blog/post/:id [BlogPostPage]' in captured.out
        assert '<DashboardLayout>' in captured.out
        assert '/dashboard [DashboardHomePage]' in captured.out
        assert '/settings [SettingsPage]' in captured.out
        assert '/admin/' in captured.out
        assert '/admin (index) [AdminHomePage]' in captured.out
        assert '/admin/users/' in captured.out
        assert '/admin/users/create [UserCreatePage]' in captured.out

        # Verify tree structure characters exist
        assert '├─' in captured.out
        assert '└─' in captured.out
        assert '│' in captured.out


# Additional mock functions for the realistic test
def BlogHomePage():
    return ComponentInstance()


def BlogPostPage():
    return ComponentInstance()


def DashboardLayout():
    return ComponentInstance()


def DashboardHomePage():
    return ComponentInstance()


def SettingsPage():
    return ComponentInstance()


def AdminHomePage():
    return ComponentInstance()


def UserCreatePage():
    return ComponentInstance()
