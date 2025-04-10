from fastapi.encoders import jsonable_encoder
import pytest

from dara.core.definitions import (
    ComponentInstance,
    Page,
    TemplateRouterContent,
    TemplateRouterLink,
)
from dara.core.visual.template import TemplateBuilder


class Frame(ComponentInstance):
    prop_1: str
    dummy_prop: str

    def __init__(self, **kwargs):
        super().__init__(**kwargs, uid='uid')


def test_template_name():
    """Test that a template name can be set and is validated"""

    # Check the name is mapped correctly
    builder = TemplateBuilder('Template')
    builder.layout = Frame(prop_1='test1', dummy_prop='test2')
    template = builder.to_template()

    assert template.name == 'Template'

    # Check that it validates the name has been set
    builder = TemplateBuilder()
    builder.layout = Frame(prop_1='test1', dummy_prop='test2')
    with pytest.raises(ValueError):
        builder.to_template()


def test_template_layout():
    """Test that the template layout can be set and is validated"""

    # Check the root is mapped correctly
    builder = TemplateBuilder('Template')
    builder.layout = Frame(prop_1='test1', dummy_prop='test2')
    template = builder.to_template()

    assert isinstance(template.layout, Frame)
    assert jsonable_encoder(template.layout) == {
        'name': 'Frame',
        'props': {'prop_1': 'test1', 'dummy_prop': 'test2'},
        'uid': 'uid',
    }

    # Check that it validates the layout has been set
    builder = TemplateBuilder('Template')
    with pytest.raises(ValueError):
        builder.to_template()


def test_router():
    """Test that a router can be created and configured"""

    builder = TemplateBuilder('Template')
    router = builder.add_router()

    # Test add_route
    router.add_route(
        name='Test Page', route='test-page', content=ComponentInstance.model_construct(name='Menu', props={}, uid='uid')
    )
    router.add_route(
        name='Test 2', route='test-2', content=ComponentInstance.model_construct(name='Test', props={}, uid='uid'), icon='Hdd'
    )

    # Test links format
    assert router.links == [
        TemplateRouterLink(name='Test Page', route='test-page'),
        TemplateRouterLink(name='Test 2', route='test-2', icon='Hdd'),
    ]

    # Test content format
    assert router.content == [
        TemplateRouterContent(
            name='Test Page', route='test-page', content=ComponentInstance.model_construct(name='Menu', props={}, uid='uid')
        ),
        TemplateRouterContent(
            name='Test 2', route='test-2', content=ComponentInstance.model_construct(name='Test', props={}, uid='uid')
        ),
    ]


def test_router_from_pages():
    """Test that a router can be created from a list of Pages"""

    pages = [
        Page(
            name='Page1', content=ComponentInstance.construct(name='Page1', props={}, uid='uid'), url_safe_name='page1'
        ),
        # Check that a leading slash doesn't break the routing
        Page(
            name='Page2', content=ComponentInstance.construct(name='Page2', props={}, uid='uid'), url_safe_name='/page2'
        ),
    ]
    builder = TemplateBuilder('Template')
    router = builder.add_router_from_pages(pages)

    assert router.links == [
        TemplateRouterLink(name='Page1', route='/page1'),
        TemplateRouterLink(name='Page2', route='/page2'),
    ]
    assert router.content == [
        TemplateRouterContent(
            name='Page1', route='/page1', content=ComponentInstance.construct(name='Page1', props={}, uid='uid')
        ),
        TemplateRouterContent(
            name='Page2', route='/page2', content=ComponentInstance.construct(name='Page2', props={}, uid='uid')
        ),
    ]


def test_router_links():
    """ " Test that links are formed correctly"""

    pages = [
        # Check that not passing include_in_menu makes the page appear in both links and content
        Page(
            name='Page1', content=ComponentInstance.construct(name='Page1', props={}, uid='uid'), url_safe_name='page1'
        ),
        # Check that passing include_in_menu as False makes the page not appear in links but it should appear in content
        Page(
            name='Page2',
            content=ComponentInstance.construct(name='Page2', props={}, uid='uid'),
            url_safe_name='page2',
            include_in_menu=False,
        ),
        # Check that passing include_in_menu as True makes the page appear in both links and content
        Page(
            name='Page3',
            content=ComponentInstance.construct(name='Page3', props={}, uid='uid'),
            url_safe_name='page3',
            include_in_menu=True,
        ),
    ]
    builder = TemplateBuilder('Template')
    router = builder.add_router_from_pages(pages)

    # Only Page 1 and Page 3 should appear in links
    assert router.links == [
        TemplateRouterLink(name='Page1', route='/page1'),
        TemplateRouterLink(name='Page3', route='/page3'),
    ]
    # All three pages should appear in content
    assert router.content == [
        TemplateRouterContent(
            name='Page1', route='/page1', content=ComponentInstance.construct(name='Page1', props={}, uid='uid')
        ),
        TemplateRouterContent(
            name='Page2', route='/page2', content=ComponentInstance.construct(name='Page2', props={}, uid='uid')
        ),
        TemplateRouterContent(
            name='Page3', route='/page3', content=ComponentInstance.construct(name='Page3', props={}, uid='uid')
        ),
    ]
