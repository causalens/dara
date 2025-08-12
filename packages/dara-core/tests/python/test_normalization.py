import os
from collections.abc import Mapping
from typing import List, Union

from fastapi.encoders import jsonable_encoder

from dara.core.base_definitions import BaseCachePolicy, Cache, CacheType
from dara.core.definitions import ComponentInstance
from dara.core.interactivity import (
    AnyVariable,
    DataVariable,
    DerivedDataVariable,
    DerivedVariable,
    Variable,
)
from dara.core.interactivity.filtering import ValueQuery
from dara.core.internal.hashing import hash_object
from dara.core.internal.normalization import _loop, denormalize, normalize

from tests.python.utils import read_template_json

JsonLike = Union[Mapping, List]


def assert_dict_equal(a: JsonLike, b: JsonLike):
    for key, val in _loop(a):
        if key == 'cache':
            if isinstance(val, BaseCachePolicy):
                assert val == b[key]
            elif isinstance(val, str):
                assert Cache.Policy.from_arg(val) == b[key]
            elif isinstance(val, CacheType):
                assert val in CacheType._value2member_map_
        elif isinstance(val, (dict, list)):
            assert_dict_equal(val, b[key])
        else:
            assert val == b[key]


class MockStack(ComponentInstance):
    """
    Imitate a Stack component
    """

    children: List[ComponentInstance]

    def __init__(self, *args: ComponentInstance, **kwargs):
        super().__init__(children=list(args), **kwargs)


class MockText(ComponentInstance):
    text: Union[str, AnyVariable]


ROOT_TEST_DATA_PATH = os.path.join('./tests/data/normalization')


def test_normalizes_components_with_no_variables():
    """
    For components with no variables it should return the component unchanged.
    """
    layout = MockStack(MockText(text='test'))
    layout_dict = jsonable_encoder(layout)

    template_data = {
        'mock_stack_uid': str(layout.uid),
        'mock_text_uid': str(layout.children[0].uid),
    }

    normalized_layout, lookup_map = normalize(layout_dict)

    test_data_path = os.path.join(ROOT_TEST_DATA_PATH, 'component_no_variables')
    lookup_data = read_template_json(os.path.join(test_data_path, 'lookup.json'), template_data)
    normalized_data = read_template_json(os.path.join(test_data_path, 'normalized.json'), template_data)
    denormalized_data = read_template_json(os.path.join(test_data_path, 'denormalized.json'), template_data)

    assert normalized_layout == normalized_data, 'Failed for component_no_variables'
    assert lookup_map == lookup_data
    assert jsonable_encoder(denormalize(normalized_layout, lookup_map)) == denormalized_data


def test_normalizes_components_with_data_variable():
    """
    Data(server) variables should be normalized correctly
    """
    data_var = DataVariable(cache='user')
    data_var_2 = DataVariable(cache='user')

    layout = MockStack(MockText(text=data_var), MockText(text=data_var_2))

    template_data = {
        'mock_stack_uid': str(layout.uid),
        'mock_text_1_uid': str(layout.children[0].uid),
        'mock_text_2_uid': str(layout.children[1].uid),
        'data_var_uid': str(data_var.uid),
        'data_var_uid_2': str(data_var_2.uid),
    }

    layout_dict = jsonable_encoder(layout)
    normalized_layout, lookup_map = normalize(layout_dict)

    test_data_path = os.path.join(ROOT_TEST_DATA_PATH, 'component_data_variable')
    lookup_data = read_template_json(os.path.join(test_data_path, 'lookup.json'), template_data)
    normalized_data = read_template_json(os.path.join(test_data_path, 'normalized.json'), template_data)
    denormalized_data = read_template_json(os.path.join(test_data_path, 'denormalized.json'), template_data)

    assert normalized_layout == normalized_data, 'Failed for component_data_variable'
    assert_dict_equal(lookup_map, lookup_data)
    assert jsonable_encoder(denormalize(normalized_layout, lookup_map)) == denormalized_data


def test_normalizes_components_with_plain_variable():
    text_var = Variable('test')
    layout = MockStack(MockText(text=text_var))

    template_data = {
        'var_1_uid': str(text_var.uid),
        'mock_stack_uid': str(layout.uid),
        'mock_text_uid': str(layout.children[0].uid),
    }

    layout_dict = layout.dict()
    normalized_layout, lookup_map = normalize(layout_dict)

    test_data_path = os.path.join(ROOT_TEST_DATA_PATH, 'component_plain_variable')
    lookup_data = read_template_json(os.path.join(test_data_path, 'lookup.json'), template_data)
    normalized_data = read_template_json(os.path.join(test_data_path, 'normalized.json'), template_data)
    denormalized_data = read_template_json(os.path.join(test_data_path, 'denormalized.json'), template_data)

    assert normalized_layout == normalized_data, 'Failed for component_plain_variable'
    assert_dict_equal(lookup_map, lookup_data)
    assert denormalize(normalized_layout, lookup_map) == denormalized_data


def test_normalizes_components_with_derived_variable():
    root_var = Variable('test')
    dv = DerivedVariable(func=lambda x: x, variables=[root_var])

    layout = MockStack(MockText(text=dv))
    layout_dict = layout.dict()

    template_data = {
        'dv_1_uid': str(dv.uid),
        'var_1_uid': str(root_var.uid),
        'mock_stack_uid': str(layout.uid),
        'mock_text_uid': str(layout.children[0].uid),
    }

    normalized_layout, lookup_map = normalize(layout_dict)

    test_data_path = os.path.join(ROOT_TEST_DATA_PATH, 'component_derived_variable')
    lookup_data = read_template_json(os.path.join(test_data_path, 'lookup.json'), template_data)
    normalized_data = read_template_json(os.path.join(test_data_path, 'normalized.json'), template_data)
    denormalized_data = read_template_json(os.path.join(test_data_path, 'denormalized.json'), template_data)

    assert normalized_layout == normalized_data, 'Failed for component_derived_variable'
    assert_dict_equal(lookup_map, lookup_data)
    assert_dict_equal(denormalize(normalized_layout, lookup_map), denormalized_data)


def test_normalizes_components_with_nested_derived_variables():
    root_var = Variable('test')
    dv1 = DerivedVariable(func=lambda x: x, variables=[root_var])
    dv2 = DerivedVariable(func=lambda x: x, variables=[root_var])
    dv3 = DerivedVariable(func=lambda x, y: x + y, variables=[dv1, dv2])

    layout = MockStack(MockText(text=dv3))
    layout_dict = layout.dict()

    template_data = {
        'root_var_uid': str(root_var.uid),
        'dv_1_uid': str(dv1.uid),
        'dv_2_uid': str(dv2.uid),
        'dv_3_uid': str(dv3.uid),
        'mock_stack_uid': str(layout.uid),
        'mock_text_uid': str(layout.children[0].uid),
    }

    normalized_layout, lookup_map = normalize(layout_dict)

    test_data_path = os.path.join(ROOT_TEST_DATA_PATH, 'component_nested_derived_variable')
    lookup_data = read_template_json(os.path.join(test_data_path, 'lookup.json'), template_data)
    normalized_data = read_template_json(os.path.join(test_data_path, 'normalized.json'), template_data)
    denormalized_data = read_template_json(os.path.join(test_data_path, 'denormalized.json'), template_data)

    assert normalized_layout == normalized_data, 'Failed for component_nested_derived_variable'
    assert_dict_equal(lookup_map, lookup_data)
    assert_dict_equal(denormalize(normalized_layout, lookup_map), denormalized_data)


def test_normalizes_components_with_nested_tabular_derived_variables():
    root_var = Variable('test')
    dv1 = DerivedDataVariable(func=lambda x: x, variables=[root_var])
    dv2 = DerivedDataVariable(func=lambda x: x, variables=[root_var])
    dv3 = DerivedDataVariable(func=lambda x, y: x + y, variables=[dv1, dv2])

    layout = MockStack(MockText(text=dv3))
    layout_dict = layout.dict()

    template_data = {
        'root_var_uid': str(root_var.uid),
        'dv_1_uid': str(dv1.uid),
        'dv_2_uid': str(dv2.uid),
        'dv_3_uid': str(dv3.uid),
        'mock_stack_uid': str(layout.uid),
        'mock_text_uid': str(layout.children[0].uid),
    }

    normalized_layout, lookup_map = normalize(layout_dict)

    test_data_path = os.path.join(ROOT_TEST_DATA_PATH, 'component_nested_derived_data_variable')
    lookup_data = read_template_json(os.path.join(test_data_path, 'lookup.json'), template_data)
    normalized_data = read_template_json(os.path.join(test_data_path, 'normalized.json'), template_data)
    denormalized_data = read_template_json(os.path.join(test_data_path, 'denormalized.json'), template_data)

    assert normalized_layout == normalized_data, 'Failed for component_nested_derived_data_variable'
    assert_dict_equal(lookup_map, lookup_data)
    assert_dict_equal(denormalize(normalized_layout, lookup_map), denormalized_data)


def test_normalizes_nested_derived_variables():
    root_var = Variable('test')

    dv1 = DerivedVariable(func=lambda x: x, variables=[root_var])

    dv2 = DerivedVariable(func=lambda x: x, variables=[root_var])

    dv3 = DerivedVariable(func=lambda x, y: x + y, variables=[dv1, dv2])

    normalized_var, lookup_map = normalize(dv3.dict())

    template_data = {
        'root_var_uid': str(root_var.uid),
        'dv_1_uid': str(dv1.uid),
        'dv_2_uid': str(dv2.uid),
        'dv_3_uid': str(dv3.uid),
    }

    test_data_path = os.path.join(ROOT_TEST_DATA_PATH, 'nested_derived_variable')
    lookup_data = read_template_json(os.path.join(test_data_path, 'lookup.json'), template_data)
    normalized_data = read_template_json(os.path.join(test_data_path, 'normalized.json'), template_data)
    denormalized_data = read_template_json(os.path.join(test_data_path, 'denormalized.json'), template_data)

    assert normalized_var == normalized_data, 'Failed for nested_derived_variable'
    assert_dict_equal(lookup_map, lookup_data)
    assert_dict_equal(denormalize(normalized_var, lookup_map), denormalized_data)


def test_denormalizes_request_data():
    """
    Check all cases of normalized requests are denormalized correctly
    """
    replacement_data = {
        'var_1_uid': 'test1',
        'var_2_uid': 'test2',
        'var_3_uid': 'test3',
        'var_1_name': 'test_name_1',
        'var_2_name': 'test_name_2',
        'var_3_name': 'test_name_3',
    }

    request_data_path = os.path.join('./tests/data/request_normalization')
    dirs = os.listdir(request_data_path)

    for data_dir in dirs:
        data_path = os.path.join(request_data_path, data_dir)
        lookup_data = read_template_json(os.path.join(data_path, 'lookup.json'), replacement_data)
        normalized_data = read_template_json(os.path.join(data_path, 'normalized.json'), replacement_data)
        denormalized_data = read_template_json(os.path.join(data_path, 'denormalized.json'), replacement_data)

        assert denormalize(normalized_data, lookup_data) == denormalized_data, f'Failed for {data_dir}'
