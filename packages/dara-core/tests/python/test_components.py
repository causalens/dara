import pytest
from fastapi.encoders import jsonable_encoder

from dara.core import Variable, py_component
from dara.core.definitions import ComponentInstance, StyledComponentInstance
from dara.core.visual.components import Fallback, For
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


class SimpleComponent(ComponentInstance):
    """Simple test component for For tests"""

    text: str = 'test'


class WrapperComponent(ComponentInstance):
    """Component with a child for testing nested py_components"""

    child: ComponentInstance


class ListComponent(ComponentInstance):
    """Component with a list of children for testing"""

    children: list[ComponentInstance]


def test_for_without_py_component():
    """Test that For accepts a renderer without py_component"""
    my_list = Variable([1, 2, 3])
    for_component = For(items=my_list, renderer=SimpleComponent(text='hello'))
    assert for_component.renderer is not None


def test_for_rejects_direct_py_component():
    """Test that For rejects a renderer that is directly a py_component"""
    my_list = Variable([1, 2, 3])

    @py_component
    def my_py_component():
        return SimpleComponent()

    with pytest.raises(ValueError) as exc_info:
        For(items=my_list, renderer=my_py_component())

    assert 'my_py_component' in str(exc_info.value)
    assert '@py_component' in str(exc_info.value)


def test_for_rejects_nested_py_component():
    """Test that For rejects a renderer with nested py_component"""
    my_list = Variable([1, 2, 3])

    @py_component
    def nested_component():
        return SimpleComponent()

    with pytest.raises(ValueError) as exc_info:
        For(items=my_list, renderer=WrapperComponent(child=nested_component()))

    assert 'nested_component' in str(exc_info.value)


def test_for_rejects_py_component_in_list():
    """Test that For rejects py_component nested in a list of children"""
    my_list = Variable([1, 2, 3])

    @py_component
    def list_nested_component():
        return SimpleComponent()

    with pytest.raises(ValueError) as exc_info:
        For(
            items=my_list,
            renderer=ListComponent(children=[SimpleComponent(), list_nested_component()]),
        )

    assert 'list_nested_component' in str(exc_info.value)


def test_for_error_includes_multiple_func_names():
    """Test that For error message includes all py_component function names"""
    my_list = Variable([1, 2, 3])

    @py_component
    def first_component():
        return SimpleComponent()

    @py_component
    def second_component():
        return SimpleComponent()

    with pytest.raises(ValueError) as exc_info:
        For(
            items=my_list,
            renderer=ListComponent(children=[first_component(), second_component()]),
        )

    error_message = str(exc_info.value)
    assert 'first_component' in error_message
    assert 'second_component' in error_message
