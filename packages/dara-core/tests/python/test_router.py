import pytest

from dara.core.configuration import ConfigurationBuilder
from dara.core.defaults import default_template
from dara.core.definitions import ComponentInstance
from dara.core.interactivity.plain_variable import Variable
from dara.core.router import IndexRoute, LayoutRoute, Outlet, PageRoute, PrefixRoute, Router, convert_template_to_router
from dara.core.visual.components.router_content import RouterContent
from dara.core.visual.components.sidebar_frame import SideBarFrame
from dara.core.visual.template import TemplateBuilder


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

    def test_set_children(self):
        router = Router()
        router.set_children(
            [
                IndexRoute(content=HomePage),
                PageRoute(path='about', content=AboutPage),
                LayoutRoute(
                    content=MarketingLayout,
                    children=[
                        IndexRoute(content=MarketingHome),
                        PageRoute(path='contact', content=MarketingContact),
                    ],
                ),
                PrefixRoute(
                    path='my-api',
                    children=[
                        PageRoute(path='users', content=UsersPage),
                        PageRoute(path='posts/:id', content=PostDetail),
                    ],
                ),
            ]
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

    def test_set_children_attachment(self):
        router = Router()
        router.set_children(
            [
                PrefixRoute(
                    path='level1',
                    children=[
                        PageRoute(path='level2/deep', content=AboutPage),
                    ],
                ),
            ]
        )
        level1 = router.children[0]
        assert isinstance(level1, PrefixRoute)
        assert len(level1.children) == 1
        assert level1.full_path == '/level1'
        assert level1.is_attached
        level2 = level1.children[0]
        assert isinstance(level2, PageRoute)
        assert level2.full_path == '/level1/level2/deep'
        assert level2.is_attached


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


class TestTemplateToRouterConversion:
    """Test conversion from old template system to new Router structure"""

    def test_default_template_conversion(self):
        """Test converting a template with RouterContent to Router"""
        # Create template routes (what would be in RouterContent)
        builder = ConfigurationBuilder()
        builder.add_page('Home', HomePage())
        builder.add_page('About', AboutPage())
        config = builder._to_configuration()

        template = default_template(config)

        # Convert to router
        router = convert_template_to_router(template)

        # Verify structure: should be a root LayoutRoute with PageRoute children
        assert len(router.children) == 1

        root_layout = router.children[0]
        assert isinstance(root_layout, LayoutRoute)

        # The layout content should be transformed (where frame's content is converted RouterContent → Outlet)
        layout_result = root_layout.content
        assert isinstance(layout_result, SideBarFrame)
        assert isinstance(layout_result.content, Outlet)

        # Should have page children extracted from RouterContent.routes
        assert len(root_layout.children) == 2

        home_route = root_layout.children[0]
        about_route = root_layout.children[1]

        assert isinstance(home_route, PageRoute)
        assert isinstance(about_route, PageRoute)

        assert home_route.path == 'home'
        assert home_route.full_path == '/home'

        assert about_route.path == 'about'
        assert about_route.full_path == '/about'

    def test_template_with_index_route_conversion(self):
        """Test converting template with index route (root path)"""

        builder = ConfigurationBuilder()
        builder.add_page('', HomePage())
        builder.add_page('About', AboutPage())
        config = builder._to_configuration()

        template = default_template(config)

        router = convert_template_to_router(template)

        root_layout = router.children[0]
        assert isinstance(root_layout, LayoutRoute)
        assert len(root_layout.children) == 2

        index_route = root_layout.children[0]
        about_route = root_layout.children[1]

        assert isinstance(index_route, IndexRoute)
        assert index_route.full_path == '/'

        assert isinstance(about_route, PageRoute)
        assert about_route.path == 'about'
        assert about_route.full_path == '/about'

    def test_custom_template_conversion(self):
        """Test conversion of a custom template"""
        builder = ConfigurationBuilder()

        class Stack(ComponentInstance):
            children: list[ComponentInstance]

        def template_renderer(config):
            builder = TemplateBuilder(name='side-bar')

            # Using the TemplateBuilder's helper method - add_router_from_pages
            # to construct a router of page definitions
            router = builder.add_router_from_pages(list(config.pages.values()))

            builder.layout = Stack(
                children=[
                    Stack(children=[RouterContent(routes=router.content)]),
                ]
            )

            return builder.to_template()

        builder.add_template_renderer('custom', template_renderer)
        builder.template = 'custom'

        builder.add_page('Home', HomePage())

        config = builder._to_configuration()

        template = template_renderer(config)

        router = convert_template_to_router(template)

        # Should extract routes from nested RouterContent
        root_layout = router.children[0]
        assert isinstance(root_layout, LayoutRoute)
        assert len(root_layout.children) == 1

        root_layout_result = root_layout.content
        assert isinstance(root_layout_result, Stack)
        assert len(root_layout_result.children) == 1

        root_layout_result_child = root_layout_result.children[0]
        assert isinstance(root_layout_result_child, Stack)
        assert len(root_layout_result_child.children) == 1

        router_content = root_layout_result_child.children[0]
        assert isinstance(router_content, Outlet)

        home_route = root_layout.children[0]
        assert isinstance(home_route, PageRoute)
        assert home_route.path == 'home'
        assert home_route.full_path == '/home'
        assert isinstance(home_route.content, ComponentInstance)


class TestRouterParamValidation:
    def test_repeated_param(self):
        router = Router()
        root = router.add_page(path='blog/:id', content=AboutPage)
        root.add_page(path='post/:id', content=AboutPage)

        # Not allowed because it would create /blog/:id/post/:id
        # and name matching would be ambiguous
        with pytest.raises(ValueError):
            router.compile()

    def test_repeated_param_in_other_route(self):
        """
        The same param name is fine in other routes
        """
        router = Router()
        router.add_page(path='blog/:id', content=AboutPage)
        router.add_page(path='post/:id', content=AboutPage)
        router.compile()

    def test_api_prefix(self):
        router = Router()
        router.add_page(path='api/users', content=AboutPage)
        # api prefix is not allowed
        with pytest.raises(ValueError):
            router.compile()

    def test_invalid_param_name(self):
        def page(id: Variable[str]):
            return ComponentInstance()

        # Valid router
        router = Router()
        router.add_page(path='blog/:id', content=page)
        router.compile()

        # Invalid router
        router = Router()
        router.add_page(path='blog/:blogId', content=page)

        with pytest.raises(ValueError, match='blogId'):
            router.compile()

    def test_invalid_annotation(self):
        def page(id: str):
            return ComponentInstance()

        # Invalid router
        router = Router()
        router.add_page(path='blog/:id', content=page)

        with pytest.raises(ValueError, match='id'):
            router.compile()

    def test_missing_annotation(self):
        def page(id):
            return ComponentInstance()

        # Invalid router
        router = Router()
        router.add_page(path='blog/:id', content=page)

        with pytest.raises(ValueError, match='id'):
            router.compile()

    def test_inject_parent_param(self):
        def parent_page(parent_id: Variable[str]):
            return ComponentInstance()

        def child_page(parent_id: Variable[str], child_id: Variable[str]):
            return ComponentInstance()

        router = Router()
        parent = router.add_page(path='parent/:parent_id', content=parent_page)
        parent.add_page(path='child/:child_id', content=child_page)
        # should be fine
        router.compile()

        # But accessing child id in parent should fail
        invalid_router = Router()
        # reversed child/parent pages
        invalid_parent = invalid_router.add_page(path='parent/:parent_id', content=child_page)
        invalid_parent.add_page(path='child/:child_id', content=parent_page)
        with pytest.raises(ValueError):
            invalid_router.compile()

    def test_star_param_injection(self):
        def page(splat: Variable[str]):
            return ComponentInstance()

        router = Router()
        router.add_page(path='files/*', content=page)
        # should compile fine, splat is reserved for *
        router.compile()

    def test_star_param_without_star_in_path(self):
        def page(splat: Variable[str]):
            return ComponentInstance()

        router = Router()
        router.add_page(path='files', content=page)

        with pytest.raises(ValueError, match='splat'):
            router.compile()

    def test_duplicate_param_in_same_path(self):
        def page(id: Variable[str]):
            return ComponentInstance()

        router = Router()
        # /foo/:id/:id is invalid because of duplicate param names
        router.add_page(path='foo/:id/:id', content=page)

        with pytest.raises(ValueError, match='id'):
            router.compile()


class TestCompilation:
    """Test compilation of routes"""

    def test_param_injection(self):
        """
        Test injected parameter is formed correctly on compilation
        """

        class Text(ComponentInstance):
            text: Variable[str]

        def page(id: Variable[str]):
            return Text(text=id)

        router = Router()
        router.add_page(path='blog/:id', content=page)

        # Compile the router
        router.compile()

        # Check that the page was compiled
        assert router.children[0].compiled_data is not None
        assert router.children[0].compiled_data.content is not None
        content = router.children[0].compiled_data.content

        assert isinstance(content, Text)
        assert content.text.store is not None
        typename = content.text.store.model_dump()['__typename']
        param_name = content.text.store.model_dump()['param_name']
        assert typename == '_PathParamStore'
        assert param_name == 'id'

    def test_component_content(self):
        """
        Test that content can be a component instance, not just a function
        """
        router = Router()

        class Text(ComponentInstance):
            text: Variable[str]

        router.add_page(path='blog/:id', content=Text(text=Variable('text')))
        router.compile()

        # Check that the page was compiled correctly
        assert router.children[0].compiled_data is not None
        assert router.children[0].compiled_data.content is not None
        content = router.children[0].compiled_data.content

        assert isinstance(content, Text)
