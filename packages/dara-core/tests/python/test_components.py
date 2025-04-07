from typing import List, Union

from fastapi.encoders import jsonable_encoder
from pydantic.v1 import validator

from dara.core import CSSProperties
from dara.core.base_definitions import TemplateMarker
from dara.core.definitions import ComponentInstance, StyledComponentInstance, template
from dara.core.interactivity.any_variable import AnyVariable


def test_base_component_instance():
    """Test that ComponentInstance serializes correctly"""

    class TestInstance(ComponentInstance):
        test_prop: str

    instance = TestInstance(test_prop='test')
    assert instance.dict() == {'name': 'TestInstance', 'props': {'test_prop': 'test'}, 'uid': instance.uid}


def test_children():
    class TestComponent(StyledComponentInstance):
        foo: str

    instance = TestComponent(foo='bar', children=[TestComponent(foo='baz'), None])
    assert instance.dict(exclude_none=True) == {
        'name': 'TestComponent',
        'uid': instance.uid,
        'props': {
            'foo': 'bar',
            'underline': False,
            'bold': False,
            'italic': False,
            'children': [
                {
                    'name': 'TestComponent',
                    'uid': instance.children[0].uid,
                    'props': {
                        'foo': 'baz',
                        'bold': False,
                        'underline': False,
                        'italic': False,
                    },
                },
            ],
        },
    }


def test_raw_css():
    """
    Test that raw_css can be serialized correctly in different formats
    """
    class_instance = ComponentInstance(raw_css=CSSProperties(width=100, maxWidth=200))
    assert class_instance.dict() == {
        'name': 'ComponentInstance',
        'uid': class_instance.uid,
        'props': {'raw_css': {'width': 100, 'maxWidth': 200}},
    }

    dict_instance = ComponentInstance(raw_css={'width': 100, 'maxWidth': 200, 'max-height': 300})
    assert dict_instance.dict() == {
        'name': 'ComponentInstance',
        'uid': dict_instance.uid,
        'props': {'raw_css': {'width': 100, 'maxWidth': 200, 'maxHeight': 300}},
    }

    str_instance = ComponentInstance(raw_css="""width: 100;""")
    assert str_instance.dict() == {
        'name': 'ComponentInstance',
        'uid': str_instance.uid,
        'props': {'raw_css': 'width: 100;'},
    }


def test_template_markers():
    """
    Test that ComponentInstance subclasses behave correctly.
    When not using TemplateMarkers, validators and init functions run as normal.
    When using TemplateMarkers, validators are skipped and init functions are run as normal.
    """

    class TestSubclass(ComponentInstance):
        test_prop: str
        validated: bool = False
        initialized: bool = False

        def __init__(self, test_prop):
            super().__init__(test_prop=test_prop, initialized=True)

        @validator('validated', always=True)
        @classmethod
        def validate(cls, v):
            return True

    # Test that validators and init functions run as normal
    instance = TestSubclass(test_prop='test')
    assert instance.validated
    assert instance.initialized
    assert instance.test_prop == 'test'

    assert jsonable_encoder(instance) == {
        'name': 'TestSubclass',
        'uid': instance.uid,
        'props': {'test_prop': 'test', 'validated': True, 'initialized': True},
    }

    # Test that validators and init functions are skipped when using TemplateMarkers
    instance = TestSubclass(test_prop=TemplateMarker(field_name='test'))
    assert not instance.validated
    assert instance.initialized
    assert instance.test_prop == TemplateMarker(field_name='test')
    assert jsonable_encoder(instance) == {
        'name': 'TestSubclass',
        'uid': instance.uid,
        'props': {
            'test_prop': {'field_name': 'test', '__typename': 'TemplateMarker'},
            'validated': False,
            'initialized': True,
        },
    }


def test_template_decorator():
    """
    Test that components marked with @template are differentiated and are ran with injected template marker creator.
    """

    class TestComponent(StyledComponentInstance):
        test_prop: str
        var_prop: AnyVariable

    class TestLayoutComponent(StyledComponentInstance):
        children: List[Union[ComponentInstance, TemplateMarker]]

        def __init__(self, *args: ComponentInstance, **kwargs):
            super().__init__(children=list(args), **kwargs)

        class Config:
            smart_union = True

    @template
    def test_template(value: template.Value, extra_val):
        return TestLayoutComponent(
            value.children,
            TestComponent(test_prop=value.test_val, var_prop=value.var, raw_css=value.css_string),
            raw_css={'test_property': value.css_prop, 'extra_prop': extra_val},
        )

    result = test_template(extra_val='extra_val')
    assert isinstance(result, ComponentInstance)
    assert result.templated

    assert jsonable_encoder(result, exclude_none=True, exclude_defaults=True) == {
        'name': 'TestLayoutComponent',
        'uid': result.uid,
        'props': {
            'children': [
                {'field_name': 'children', '__typename': 'TemplateMarker'},
                {
                    'name': 'TestComponent',
                    'uid': result.children[1].uid,
                    'props': {
                        'test_prop': {'field_name': 'test_val', '__typename': 'TemplateMarker'},
                        'var_prop': {'field_name': 'var', '__typename': 'TemplateMarker'},
                        'raw_css': {'field_name': 'css_string', '__typename': 'TemplateMarker'},
                    },
                },
            ],
            'raw_css': {
                'test_property': {'field_name': 'css_prop', '__typename': 'TemplateMarker'},
                'extra_prop': 'extra_val',
            },
            'templated': True,
        },
    }