from dara.core.internal.registry import Registry


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
