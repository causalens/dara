import inspect
import sys
from importlib.util import module_from_spec, spec_from_loader
from types import ModuleType
from typing import List
from unittest.mock import patch

import pytest

from dara.core.definitions import ComponentInstance
from dara.core.internal.import_discovery import run_discovery

dynamic_modules = []


def _create_new_module(name: str):
    spec = spec_from_loader(name, loader=None)
    if spec is None:
        raise RuntimeError('Could not create spec')
    mod = module_from_spec(spec)

    # Register module so it can be imported
    sys.modules[name] = mod

    # Keep track of what we added so we can cleanup between tests
    dynamic_modules.append(name)

    return mod


def _exec_in_module(code: str, mod: ModuleType):
    exec(code, mod.__dict__)


def create_module(name: str, code: str):
    mod = _create_new_module(name)
    _exec_in_module(code, mod)
    return mod


@pytest.fixture(autouse=True)
def cleanup_dynamic_modules():
    """After each test, cleanup modules we created"""
    yield
    for name in dynamic_modules:
        sys.modules.pop(name)
    dynamic_modules.clear()


def test_discovers_module_with_variable():
    """
    Regression test due to issue with AnyVariable overriding __eq__ which would crash the import_discovery
    algo on the `in` operator call
    """
    create_module(
        'tests.component_discovery.module',
        """\
from dara.core import Variable
from dara.core.definitions import ComponentInstance
from dara.core.base_definitions import ActionImpl


class CustomAction(ActionImpl):
    pass

class CustomComponent(ComponentInstance):
    pass

# This could cause a crash
var = Variable()
""",
    )

    main_module = create_module(
        'tests.component_discovery.main',
        """\
from dara.core.definitions import ComponentInstance

# only need to import one symbol from the module for the module to be discovered, as its local
from tests.component_discovery.module import CustomComponent
""",
    )

    components, actions = run_discovery(main_module)

    assert len(components) == 1
    component_names = [(c.__name__, c.__module__) for c in components]
    assert ('CustomComponent', 'tests.component_discovery.module') in component_names

    assert len(actions) == 1
    action_names = [(a.__name__, a.__module__) for a in actions]
    assert ('CustomAction', 'tests.component_discovery.module') in action_names


def test_discovers_nested_components_and_actions():
    create_module(
        'tests.component_discovery.nested_module',
        """\
from dara.core.definitions import ComponentInstance
from dara.core.base_definitions import ActionImpl

class NestedAction(ActionImpl):
    pass

class NestedComponent(ComponentInstance):
    pass
""",
    )

    create_module(
        'tests.component_discovery.module',
        """\
from dara.core.definitions import ComponentInstance
from dara.core.base_definitions import ActionImpl

from tests.component_discovery.nested_module import NestedComponent, NestedAction

class CustomAction(ActionImpl):
    pass

class CustomComponent(ComponentInstance):
    pass
""",
    )

    main_module = create_module(
        'tests.component_discovery.main',
        """\
from dara.core.definitions import ComponentInstance

# only need to import one symbol from the module for the module to be discovered, as its local
from tests.component_discovery.module import CustomComponent
""",
    )

    components, actions = run_discovery(main_module)

    assert len(components) == 2
    component_names = [(c.__name__, c.__module__) for c in components]
    assert ('NestedComponent', 'tests.component_discovery.nested_module') in component_names
    assert ('CustomComponent', 'tests.component_discovery.module') in component_names

    assert len(actions) == 2
    action_names = [(a.__name__, a.__module__) for a in actions]
    assert ('NestedAction', 'tests.component_discovery.nested_module') in action_names
    assert ('CustomAction', 'tests.component_discovery.module') in action_names


def test_ignores_nonlocal_modules():
    """Test that non-local module (not under same root) is not examined"""
    create_module(
        'outside.module',
        """\
from dara.core.definitions import ComponentInstance

class NotImported(ComponentInstance):
    pass

class Imported(ComponentInstance):
    pass
""",
    )

    main_module = create_module(
        'tests.discover_test',
        """\
from outside.module import Imported
""",
    )

    components, actions = run_discovery(main_module)
    assert len(components) == 1
    assert list(components)[0].__name__ == 'Imported'
    assert list(components)[0].__module__ == 'outside.module'


def test_discover_decorator_class():
    """Test that non-local modules are still examined if importing @discover marked class from them"""
    create_module(
        'outside.module',
        """\
from dara.core.definitions import ComponentInstance, discover

class NotImported(ComponentInstance):
    pass

@discover
class Imported(ComponentInstance):
    pass
""",
    )

    main_module = create_module(
        'tests.discover_test',
        """\
from outside.module import Imported
""",
    )

    components, actions = run_discovery(main_module)
    assert len(components) == 2
    component_names = [(c.__name__, c.__module__) for c in components]
    assert ('Imported', 'outside.module') in component_names
    assert ('NotImported', 'outside.module') in component_names


def test_discover_decorator_func():
    """Test that non-local modules are still examined if importing @discover marked function from them"""
    create_module(
        'outside.module',
        """\
from dara.core.definitions import ComponentInstance, discover

class NotImported(ComponentInstance):
    pass

class Imported(ComponentInstance):
    pass

@discover
def func_component() -> Imported:
    pass
""",
    )

    main_module = create_module(
        'tests.discover_test',
        """\
from outside.module import func_component
""",
    )

    components, actions = run_discovery(main_module)
    assert len(components) == 2
    component_names = [(c.__name__, c.__module__) for c in components]
    assert ('Imported', 'outside.module') in component_names
    assert ('NotImported', 'outside.module') in component_names


def test_discover_py_component():
    """Test that non-local modules are still examined if importing @py_component marked function from them"""
    create_module(
        'outside.module',
        """\
from dara.core.definitions import ComponentInstance
from dara.core import py_component

class NotImported(ComponentInstance):
    pass


@py_component
def func_component():
    pass
""",
    )

    main_module = create_module(
        'tests.discover_test',
        """\
from outside.module import func_component
""",
    )

    components, actions = run_discovery(main_module)
    assert len(components) == 1
    component_names = [(c.__name__, c.__module__) for c in components]
    assert ('NotImported', 'outside.module') in component_names


def test_shared_ignore_list():
    """
    Test that ignore list is shared between recursive calls and we don't unnecessarily consider
    the same symbols.
    Note that this test is a bit fragile as it relies on the order of the discovered modules
    and mocking a helper function to inspect the ignore list at the time.
    """
    create_module(
        'tests.component_discovery.SubModule1',
        """\
# Module definition with SymbolA
from dara.core.definitions import ComponentInstance

class SymbolA(ComponentInstance):
    pass
            """,
    )

    create_module(
        'tests.component_discovery.SubModule2',
        """\
# Module definition with SymbolB and importing SymbolA
from dara.core.definitions import ComponentInstance
from tests.component_discovery.SubModule1 import SymbolA

class SymbolB(ComponentInstance):
    pass
            """,
    )

    main_module = create_module(
        'tests.component_discovery.MainModule',
        """\
# Main module importing from both submodules
from tests.component_discovery.SubModule1 import SymbolA
from tests.component_discovery.SubModule2 import SymbolB
            """,
    )

    with patch('dara.core.internal.import_discovery.is_ignored') as mock_is_ignored:
        encountered_ignore_lists = []

        def mock_is_ignored_impl(symbol, ignore_symbols: List):
            # Take copy of ignore list at the time
            if inspect.isclass(symbol) and symbol.__name__ == 'SymbolA':
                encountered_ignore_lists.append(ignore_symbols.copy())
            return symbol in ignore_symbols

        mock_is_ignored.side_effect = mock_is_ignored_impl

        components, actions = run_discovery(main_module)

        # Check component is picked up
        assert len(components) == 2
        component_names = [(c.__name__, c.__module__) for c in components]
        assert ('SymbolA', 'tests.component_discovery.SubModule1') in component_names
        assert ('SymbolB', 'tests.component_discovery.SubModule2') in component_names
        assert len(actions) == 0

        # Check it was considered 3 times
        assert len(encountered_ignore_lists) == 3
        # The first time in MainModule directly, no ignore list was present
        assert encountered_ignore_lists[0] == []
        # The second time in SubModule1, the ignore list was [SymbolA]
        assert len(encountered_ignore_lists[1]) == 1
        assert encountered_ignore_lists[1][0].__name__ == 'SymbolA'
        # The third time in SubModule2, the ignore list was [SymbolB, SymbolA]
        assert len(encountered_ignore_lists[2]) == 2
        assert set([s.__name__ for s in encountered_ignore_lists[2]]) == set(['SymbolA', 'SymbolB'])
