import pytest

from dara.core.definitions import ApiRoute, EndpointConfiguration
from dara.core.http import get


@pytest.fixture(autouse=True)
def cleanup_registry():
    from dara.core.internal.registries import config_registry

    config_registry.replace({}, deepcopy=False)


def test_decorator_creates_route_api():
    @get(url='/endpoint')
    def handler(*args):
        return 'foo'

    assert isinstance(handler, ApiRoute)
    assert handler.url == '/endpoint'
    assert handler.method.value == 'GET'


def test_decorator_injects_config_from_registry():
    class ConfigSubclass(EndpointConfiguration):
        test_property: str

    from dara.core.internal.registries import config_registry

    config_registry.register(ConfigSubclass.__name__, ConfigSubclass(test_property='test_value'))

    result_sync = None
    result_async = None

    @get(url='/endpoint')
    def handler_sync(config: ConfigSubclass):
        nonlocal result_sync
        result_sync = config.test_property

    @get(url='/endpoint')
    def handler_async(config: ConfigSubclass):
        nonlocal result_async
        result_async = config.test_property

    handler_sync.handler()
    handler_async.handler()

    assert result_sync == 'test_value'
    assert result_async == 'test_value'


def test_decorator_uses_default_config():
    class ConfigSubclass(EndpointConfiguration):
        test_property: str

        @classmethod
        def default(cls):
            return cls(test_property='default')

    result_sync = None
    result_async = None

    @get(url='/endpoint')
    def handler_sync(config: ConfigSubclass):
        nonlocal result_sync
        result_sync = config.test_property

    @get(url='/endpoint')
    def handler_async(config: ConfigSubclass):
        nonlocal result_async
        result_async = config.test_property

    handler_sync.handler()
    handler_async.handler()

    assert result_sync == 'default'
    assert result_async == 'default'


def test_decorator_raises_when_not_found():
    """Decorator should raise if there is no config registered and default() is not implemented"""

    class ConfigSubclass(EndpointConfiguration):
        test_property: str

    result_sync = None
    result_async = None

    @get(url='/endpoint')
    def handler_sync(config: ConfigSubclass):
        nonlocal result_sync
        result_sync = config.test_property

    @get(url='/endpoint')
    def handler_async(config: ConfigSubclass):
        nonlocal result_async
        result_async = config.test_property

    with pytest.raises(NotImplementedError) as e:
        handler_sync.handler()

    assert e.match('default')

    with pytest.raises(NotImplementedError) as e:
        handler_async.handler()

    assert e.match('default')
