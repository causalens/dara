from sys import getsizeof

import pytest

from dara.core.internal.registry import Registry
from dara.core.metrics import total_size


def test_registry():
    """Test that the registry class works properly"""

    reg = Registry[str](name='test')

    size_before = reg._size
    reg.register('key', 'value')
    assert reg._size > size_before
    assert reg.has('key')

    size_before = reg._size
    reg.register('key2', 'value2')
    assert reg._size > size_before
    assert reg.has('key2')

    size_before = reg._size
    reg.register('key3', 'value3')
    assert reg._size > size_before
    assert reg.has('key3')

    assert reg.get('key') == 'value'
    assert reg.get_all() == {'key': 'value', 'key2': 'value2', 'key3': 'value3'}

    size_before = reg._size
    reg.remove('key3')
    assert reg.get_all() == {'key': 'value', 'key2': 'value2'}
    assert not reg.has('key3')
    assert reg._size < size_before


def test_registry_does_not_remeasure_unrelated_values():
    class MeasuredValue:
        def __init__(self):
            self.measurements = 0

        def __sizeof__(self):
            self.measurements += 1
            return 1000

    value = MeasuredValue()
    reg = Registry(name='measurements')
    reg.register('large', value)
    assert value.measurements == 1
    reg.register('small', 'small')
    reg.set('small', 'replacement')
    reg.remove('small')
    assert reg.get('large') is value
    assert reg.get_all()['large'] is value
    assert value.measurements == 1
    reg.remove('large')
    assert value.measurements == 1


def test_registry_sizes_include_mapping_and_keys_and_count_shared_values_per_entry():
    value = [1, 2]
    initial_value_size = total_size(value)
    reg = Registry(name='shared', initial_registry={'initial': 'initial'})
    reg.replace({'first': value, 'second': value}, deepcopy=False)
    expected = getsizeof(reg.get_all()) + total_size('first') + total_size('second') + 2 * total_size(value)
    assert reg._size == expected
    value.extend(range(100))
    assert reg.get('first') is value
    assert reg._size == expected
    reg.set('first', value)
    assert reg._size == expected - initial_value_size + total_size(value)
    reg.remove('second')
    assert reg._size == getsizeof(reg.get_all()) + total_size('first') + total_size(value)
    reg.replace({})
    assert reg._size == getsizeof(reg.get_all())


def test_registry_replace_measures_installed_values_and_preserves_copy_semantics():
    original = {'key': [1, 2]}
    reg = Registry(name='copy', initial_registry=original)
    assert reg.get_all() is not original
    assert reg.get('key') is not original['key']
    assert reg._size == getsizeof(reg.get_all()) + total_size('key') + total_size(reg.get('key'))
    reg.replace(original)
    assert reg.get('key') is not original['key']
    reg.replace(original, deepcopy=False)
    assert reg.get_all() is original
    assert reg.get('key') is original['key']
    reg.set('key', 'replacement')
    assert reg._size == getsizeof(original) + total_size('key') + total_size('replacement')


def test_registry_rejected_duplicates_and_missing_removal_preserve_sizes():
    reg = Registry(name='unique', initial_registry={'key': 'value'}, allow_duplicates=False)
    initial_size = reg._size
    with pytest.raises(ValueError):
        reg.register('key', 'replacement')
    with pytest.raises(KeyError):
        reg.remove('missing')
    assert reg._size == initial_size
    assert reg.get('key') == 'value'
