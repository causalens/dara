from dara.core import CSSProperties
from dara.core.definitions import ComponentInstance, StyledComponentInstance


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
