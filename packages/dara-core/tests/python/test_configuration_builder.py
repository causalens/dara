import os
import shutil

import pytest

from dara.core.auth import BasicAuthConfig
from dara.core.base_definitions import ActionDef, ActionInstance
from dara.core.configuration import ConfigurationBuilder
from dara.core.definitions import ComponentInstance, HttpMethod, JsComponentDef, Page
from dara.core.http import get
from dara.core.internal import scheduler


def test_static_files_dir():
    """Test that the static files dir is defaulted sensibly and can be overridden"""

    # Check it defaults correctly
    builder = ConfigurationBuilder()
    config = builder._to_configuration()
    assert config.static_files_dir.endswith('packages/dara-core/dist')

    # Check it can be set
    builder.static_files_dir = 'test/dir'
    config = builder._to_configuration()
    assert config.static_files_dir == 'test/dir'


def test_template():
    """Test that the template can be set and defaults to default"""

    # Check it defaults correctly
    builder = ConfigurationBuilder()
    config = builder._to_configuration()
    assert config.template == 'default'

    # Check it can be set
    builder.template = 'test'
    config = builder._to_configuration()
    assert config.template == 'test'


def test_add_page():
    """Test that a page can be added and is mapped through correctly"""

    builder = ConfigurationBuilder()
    test_instance = ComponentInstance.construct(name='Test', props={})
    builder.add_page(name='Test Page', content=test_instance)
    config = builder._to_configuration()

    assert isinstance(config.pages['Test Page'], Page)
    assert config.pages['Test Page'].name == 'Test Page'
    assert config.pages['Test Page'].content == test_instance
    assert config.pages['Test Page'].url_safe_name == 'test-page'


def test_add_page_callable_class():
    """Test that a page can be added using a callable class component"""

    class MyComponentClass:
        def __init__(self, country: str = 'default'):
            self.country = country

        def __call__(self, name: str = 'default'):
            return ComponentInstance.construct(name='Test', props={'name': name})

        def __eq__(self, __o: object) -> bool:
            return isinstance(__o, MyComponentClass) and __o.country == self.country

    builder = ConfigurationBuilder()

    content_1 = MyComponentClass(country='UK')(name='John')
    content_2 = MyComponentClass(country='UK')
    content_3 = MyComponentClass
    builder.add_page(name='1', content=content_1)
    builder.add_page(name='2', content=content_2)
    builder.add_page(name='3', content=content_3)

    # invalid class
    class OtherClass:
        def method(self):
            pass

    with pytest.raises(ValueError):
        builder.add_page(name='invalid class', content=OtherClass)

    config = builder._to_configuration()

    assert len(config.pages) == 3
    assert config.pages['1'].content == content_1
    assert config.pages['2'].content == content_2
    # class should be instantiated
    assert config.pages['3'].content == content_3()


def test_add_page_custom_route():
    """Test that a page can be added with a custom route and icon"""

    builder = ConfigurationBuilder()
    test_instance = ComponentInstance.construct(name='Test', props={})
    builder.add_page(name='Test Page', content=test_instance, icon='Test', route='test-route')
    config = builder._to_configuration()

    assert isinstance(config.pages['Test Page'], Page)
    assert config.pages['Test Page'].icon == 'Test'
    assert config.pages['Test Page'].url_safe_name == 'test-route'


def test_add_static_folder():
    """Test that a static folder can be registered and files from them are copied on ._to_configuration()"""
    assert not os.path.exists('./static')

    # create synthetic data
    os.makedirs('./test_data')
    with open('./test_data/test_file.csv', 'w') as f:
        f.write('test')
    assert os.path.exists('./test_data/test_file.csv')

    builder = ConfigurationBuilder()
    builder.add_static_folder('./test_data')
    builder._to_configuration()

    # data is moved to './static'
    assert os.path.exists('./static')
    assert os.path.exists('./static/test_file.csv')
    # Old file still exists
    assert os.path.exists('./test_data/test_file.csv')

    # cleanup data
    shutil.rmtree('./test_data')
    shutil.rmtree('./static')


def test_add_local_action():
    """Test that a local action can be added"""

    builder = ConfigurationBuilder()

    class TestAction(ActionInstance):
        pass

    builder.add_action(TestAction, local=True)
    config = builder._to_configuration()

    assert len(config.actions) == 1
    action = config.actions[0]
    assert isinstance(action, ActionDef)
    assert action.name == 'TestAction'
    assert action.py_module == 'LOCAL'
    assert action.js_module == None


def test_add_nonlocal_action():
    """Test that an action can be added"""

    builder = ConfigurationBuilder()

    class TestAction(ActionInstance):
        js_module = 'test_module'

    builder.add_action(TestAction)
    config = builder._to_configuration()

    assert len(config.actions) == 1
    action = config.actions[0]
    assert isinstance(action, ActionDef)
    assert action.name == 'TestAction'
    assert action.py_module == 'tests'
    assert action.js_module == 'test_module'


def test_add_nonlocal_action_raises_without_js():
    """Test that a non-local Action raises when attempting to add without js module defined"""
    builder = ConfigurationBuilder()

    class TestWithoutJs(ActionInstance):
        pass

    with pytest.raises(RuntimeError) as e:
        builder.add_action(TestWithoutJs)

    assert e.match('must define its js_module')


def test_add_local_component():
    """Test that a local Component can be added"""

    builder = ConfigurationBuilder()

    class Test(ComponentInstance):
        pass

    builder.add_component(Test, local=True)
    config = builder._to_configuration()

    assert len(config.components) == 1
    component = config.components[0]
    assert isinstance(component, JsComponentDef)
    assert component.name == 'Test'
    assert component.py_module == 'LOCAL'
    assert component.js_module == None


def test_add_nonlocal_component():
    """Test that a non-local Component can be explicitly added"""
    builder = ConfigurationBuilder()

    class TestWithJs(ComponentInstance):
        js_module = 'test_module'

    builder.add_component(TestWithJs)
    config = builder._to_configuration()

    assert len(config.components) == 1
    component = config.components[0]
    assert isinstance(component, JsComponentDef)
    assert component.name == 'TestWithJs'
    assert component.py_module == 'tests'
    assert component.js_module == 'test_module'


def test_add_nonlocal_component_raises_without_js():
    """Test that a non-local Component raises when attempting to add without js module defined"""
    builder = ConfigurationBuilder()

    class TestWithJs(ComponentInstance):
        pass

    with pytest.raises(RuntimeError) as e:
        builder.add_component(TestWithJs)

    assert e.match('must define its js_module')


def test_add_route():
    """Test a route can be added directly"""
    builder = ConfigurationBuilder()

    @get('test-route')
    def test_route():
        return ''

    builder.add_endpoint(test_route)

    config = builder._to_configuration()
    assert len(config.routes) == 1
    assert list(config.routes)[0].method == HttpMethod.GET
    assert list(config.routes)[0].url == 'test-route'


def test_add_auth_config():
    """Test a config can be added and is mapped correctly"""
    builder = ConfigurationBuilder()
    builder.add_auth(BasicAuthConfig(username='test', password='test'))
    config = builder._to_configuration()

    assert isinstance(config.auth_config, BasicAuthConfig)
    assert config.auth_config.users == {'test': 'test'}


def test_config_scheduler():
    """Test that the scheduler api of config works correctly"""
    config = ConfigurationBuilder()

    @config.scheduler(scheduler.on().minute(), args=['test'])
    def mock_func():
        return True

    scheduled_jobs = config._to_configuration().scheduled_jobs
    scheduled_job, scheduled_func, args = scheduled_jobs[0]
    # Test that the job has been correctly scheduled to occur in 60 seconds
    assert scheduled_job.interval == 60
    # Check that the scheduled function is the one passed to the scheduler
    assert scheduled_func()
    assert args == ['test']


def test_config_startup_functions():
    """Test that the startup functions api of config works correctly"""
    config = ConfigurationBuilder()

    @config.on_startup
    def mock_func():
        return True

    startup_functions = config._to_configuration().startup_functions
    startup_function = startup_functions[0]
    assert startup_function()
