"""
Copyright 2023 Impulse Innovations Limited


Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
"""

import inspect
import sys
from types import ModuleType
from typing import Any, List, Optional, Set, Tuple, Type, Union

from typing_extensions import TypeGuard

from dara.core.base_definitions import ActionDef, ActionImpl
from dara.core.definitions import ComponentInstance, JsComponentDef, discover
from dara.core.interactivity.any_variable import AnyVariable
from dara.core.logging import eng_logger
from dara.core.visual.dynamic_component import py_component


def _is_component_subclass(obj: Any) -> bool:
    return inspect.isclass(obj) and issubclass(obj, ComponentInstance) and obj != ComponentInstance


def _is_component_instance(obj: Any) -> TypeGuard[ComponentInstance]:
    try:
        return isinstance(obj, ComponentInstance)
    except Exception:
        return False


def _is_action_subclass(obj: Any) -> bool:
    return inspect.isclass(obj) and issubclass(obj, ActionImpl) and obj != ActionImpl


def is_ignored(symbol: Any, ignore_symbols: List[Any]) -> bool:
    """
    Check whether a symbol should be ignored

    :param symbol: symbol to check
    :param ignore_symbols: list of symbols to ignore
    """
    try:
        # for Variables use an alternative method
        # as they cause issues because they override the __eq__ method
        if isinstance(symbol, AnyVariable):
            return any(x is symbol for x in ignore_symbols)

        return symbol in ignore_symbols
    except Exception as e:
        eng_logger.warning(f'Failed to check symbol {symbol}', {'error': e})
        return True


def run_discovery(
    module: Union[ModuleType, dict], ignore_symbols: Optional[List[Any]] = None, **kwargs
) -> Tuple[Set[Type[ComponentInstance]], Set[Type[ActionImpl]]]:
    """
    Recursively discover components available in the global namespace within the module
    and its child modules.

    :param module: module or a dict of global symbols to discover components from
    :param ignore_funcs: marked symbols to ignore;
        used internally to ignore encountered symbols when recursing into other modules
    :param module_root: root module; used internally to scope discovery to sub-modules of current module
    """
    components = set()
    actions = set()

    # Create a new list of ignored symbols if not passed through
    # Note: this single list instance it mutated and passed through to all recursive calls
    # to avoid considering the same symbol twice in different calls
    if ignore_symbols is None:
        ignore_symbols = []

    # Currently examined module
    global_symbols = module if isinstance(module, dict) else module.__dict__
    module_name = module.__name__ if isinstance(module, ModuleType) else None

    root = None

    # If module root is passed through, use it
    if 'module_root' in kwargs:
        root = kwargs.get('module_root')
    # Try to infer from module_name
    elif module_name is not None:
        root = module_name.split('.')[0]

    for k, v in global_symbols.items():
        # Ignore already encountered functions
        if is_ignored(v, ignore_symbols):
            continue

        # Ignore globals
        if k.startswith('__'):
            continue

        # Look for subclasses of ComponentInstance or ActionImpl
        if _is_component_subclass(v):
            components.add(v)
        elif _is_component_instance(v):
            components.add(v.__class__)
        elif _is_action_subclass(v):
            actions.add(v)
        elif inspect.isfunction(v):
            # Also pick up functions returning a subclass of ComponentInstance
            return_annotation = inspect.signature(v).return_annotation

            if _is_component_subclass(return_annotation):
                components.add(return_annotation)

        # Module where the value is from
        source_module = getattr(v, '__module__', None)

        # If source module is none, it might meant 'v' is a module itself
        # e.g. `import pandas`
        if source_module is None:
            if isinstance(v, ModuleType):
                source_module = v.__name__
            else:
                continue

        # This is just a locally defined symbol - we're looking for imported symbols only
        if source_module == module_name:
            continue

        # If the component is marked with @py_component or the explicit @discover, examine its source module as well
        if getattr(v, '__wrapped_by__', None) in (
            discover,
            py_component,
        ):
            ignore_symbols.append(v)
            child_components, child_actions = run_discovery(
                sys.modules[source_module],
                ignore_symbols=ignore_symbols,
                module_root=root,
            )
            components.update(child_components)
            actions.update(child_actions)

        else:
            # Otherwise we need to check if it's a submodule:
            # Don't recurse if current module or root module couldn't be identified
            if module_name is None or root is None:
                continue

            # If source module is a nested module within the module root, examine its source module as well
            if source_module.startswith(root + '.'):
                ignore_symbols.append(v)
                child_components, child_actions = run_discovery(
                    sys.modules[source_module], ignore_symbols=ignore_symbols, module_root=root
                )
                components.update(child_components)
                actions.update(child_actions)

    return components, actions


def _get_symbol_module(symbol: Union[Type[ComponentInstance], Type[ActionImpl]]) -> str:
    """Get the root module of the component or action"""
    comp_module = symbol.__module__

    # If component was imported directly from a nested path, get root of the module
    if '.' in comp_module:
        # For names dara.x use both parts
        if comp_module.startswith('dara.'):
            comp_module = '.'.join(comp_module.split('.')[:2])
        else:
            comp_module = comp_module.split('.')[0]

    return comp_module


def create_component_definition(component: Type[ComponentInstance], local: bool = False):
    """
    Create a JsComponentDef for a given component class.

    :param component: component to create definition for
    :param local: whether the component is local.
    For local components js_module is not required, as their location is defined via dara.config.json
    """
    if not local and component.js_module is None:
        raise RuntimeError('Component must define its js_module if it is not a local component')

    comp_module = 'LOCAL' if local else _get_symbol_module(component)

    return JsComponentDef(
        name=component.py_component or component.__name__,
        py_module=comp_module,
        js_component=component.js_component,
        js_module=component.js_module,
    )


def create_action_definition(action: Type[ActionImpl], local: bool = False):
    """
    Create a ActionDef for a given action class.

    :param action: action to create definition for
    :param local: whether the action is local
    For local actions js_module is not required, as their location is defined via dara.config.json
    """
    if not local and action.js_module is None:
        raise RuntimeError('Action must define its js_module if it is not a local component')

    act_module = 'LOCAL' if local else _get_symbol_module(action)

    return ActionDef(name=action.py_name or action.__name__, py_module=act_module, js_module=action.js_module)
