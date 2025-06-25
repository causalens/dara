from fastapi.encoders import jsonable_encoder

from dara.core import Variable, py_component
from dara.core.definitions import ComponentInstance, StyledComponentInstance
from dara.core.visual.components import Fallback
from dara.core.visual.css import CSSProperties


def test_base_component_instance():
    """Test that ComponentInstance serializes correctly"""

    class TestInstance(ComponentInstance):
        test_prop: str

    instance = TestInstance(test_prop='test')
    assert instance.dict() == {'name': 'TestInstance', 'props': {'test_prop': 'test'}, 'uid': instance.uid}


def test_css_variable():
    """Test that ComponentInstance can accept a  variable for raw_css"""

    class TestInstance(ComponentInstance):
        pass

    css_var = Variable(default='color: red;')
    instance = TestInstance(raw_css=css_var)
    assert instance.dict() == {
        'name': 'TestInstance',
        'props': {
            'raw_css': {
                '__typename': 'Variable',
                'uid': css_var.uid,
                'default': 'color: red;',
                'nested': [],
                'persist_value': False,
                'store': None,
            }
        },
        'uid': instance.uid,
    }


def test_none_raw_css():
    """Test that ComponentInstance can accept None for raw_css"""

    class TestInstance(ComponentInstance):
        pass

    instance = TestInstance(raw_css=None)
    assert instance.dict() == {
        'name': 'TestInstance',
        'props': {},
        'uid': instance.uid,
    }


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


def test_fallback():
    """
    Test that we can serialize components with fallbacks
    """
    for fallback in [Fallback.Default(), Fallback.Row()]:

        @py_component(fallback=fallback)
        def TestComponent():
            return 'test'

        component = TestComponent()

        dict_instance = jsonable_encoder(component)
        assert dict_instance == {
            'name': type(component).__name__,
            'props': {
                'fallback': jsonable_encoder(fallback),
                'func_name': 'TestComponent',
                'dynamic_kwargs': {},
                'polling_interval': None,
            },
            'uid': component.uid,
        }
