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

from typing import Any, List, Literal, Optional, Union

from typing_extensions import TypedDict, TypeGuard

from dara.core.base_definitions import BaseTask, PendingTask
from dara.core.interactivity import DataVariable, DerivedDataVariable, DerivedVariable
from dara.core.interactivity.filtering import FilterQuery
from dara.core.internal.cache_store import CacheStore
from dara.core.internal.pandas_utils import remove_index
from dara.core.internal.registry_lookup import RegistryLookup
from dara.core.internal.tasks import TaskManager
from dara.core.logging import dev_logger


class ResolvedDerivedVariable(TypedDict):
    type: Literal['derived']
    uid: str
    values: List[Any]
    force_key: Optional[str]


class ResolvedDerivedDataVariable(TypedDict):
    type: Literal['derived-data']
    uid: str
    values: List[Any]
    filters: Optional[Union[FilterQuery, dict]]
    force_key: Optional[str]


class ResolvedDataVariable(TypedDict):
    filters: Optional[Union[FilterQuery, dict]]
    type: Literal['data']
    uid: str


class ResolvedSwitchVariable(TypedDict):
    type: Literal['switch']
    uid: str
    value: Any
    value_map: Any
    default: Any


def is_resolved_derived_variable(obj: Any) -> TypeGuard[ResolvedDerivedVariable]:
    return isinstance(obj, dict) and 'uid' in obj and obj.get('type') == 'derived'


def is_resolved_derived_data_variable(
    obj: Any,
) -> TypeGuard[ResolvedDerivedDataVariable]:
    return isinstance(obj, dict) and 'uid' in obj and obj.get('type') == 'derived-data'


def is_resolved_data_variable(obj: Any) -> TypeGuard[ResolvedDataVariable]:
    return isinstance(obj, dict) and 'uid' in obj and obj.get('type') == 'data'


def is_resolved_switch_variable(obj: Any) -> TypeGuard[ResolvedSwitchVariable]:
    return isinstance(obj, dict) and 'uid' in obj and obj.get('type') == 'switch'


def clean_force_key(value: Any) -> Any:
    """
    Clean an argument to a value to remove force keys
    """
    if value is None:
        return value

    if isinstance(value, dict):
        # Remove force key from the value
        value.pop('force_key', None)
        return {k: clean_force_key(v) for k, v in value.items()}
    if isinstance(value, list):
        return [clean_force_key(v) for v in value]
    return value


async def resolve_dependency(
    entry: Union[
        ResolvedDerivedDataVariable,
        ResolvedDataVariable,
        ResolvedDerivedVariable,
        ResolvedSwitchVariable,
        Any,
    ],
    store: CacheStore,
    task_mgr: TaskManager,
):
    """
    Resolve an incoming dependency to its value.
    Handles 'Resolved(Derived)(Data)Variable' structures, and returns the same value for any other input.

    :param entry: dependency entry to resolve
    :param store: store instance
    :param task_mgr: task manager instance
    """
    if is_resolved_derived_data_variable(entry):
        return await _resolve_derived_data_var(entry, store, task_mgr)

    if is_resolved_derived_variable(entry):
        return await _resolve_derived_var(entry, store, task_mgr)

    if is_resolved_data_variable(entry):
        return await _resolve_data_var(entry, store)

    if is_resolved_switch_variable(entry):
        return await _resolve_switch_var(entry, store, task_mgr)

    return entry


async def _resolve_derived_data_var(entry: ResolvedDerivedDataVariable, store: CacheStore, task_mgr: TaskManager):
    """
    Resolve a derived data variable from the registry

    :param entry: derived data variable entry
    :param store: store instance to use for caching
    :param task_mgr: task manager instance
    """
    from dara.core.internal.registries import (
        data_variable_registry,
        derived_variable_registry,
        utils_registry,
    )

    registry_mgr: RegistryLookup = utils_registry.get('RegistryLookup')
    dv_var = await registry_mgr.get(derived_variable_registry, str(entry.get('uid')))
    data_var = await registry_mgr.get(data_variable_registry, str(entry.get('uid')))

    input_values: List[Any] = entry.get('values', [])

    result = await DerivedDataVariable.resolve_value(
        data_entry=data_var,
        dv_entry=dv_var,
        store=store,
        task_mgr=task_mgr,
        args=input_values,
        filters=entry.get('filters', None),
        force_key=entry.get('force_key'),
    )
    return remove_index(result)


async def _resolve_derived_var(
    derived_variable_entry: ResolvedDerivedVariable,
    store: CacheStore,
    task_mgr: TaskManager,
):
    """
    Resolve a derived variable from the registry and get it's new value based on the dynamic variable mapping passed
    in.

    :param derived_variable_entry: dv entry
    :param store: store instance to use for caching
    :param task_mgr: task manager instance
    """
    from dara.core.internal.registries import derived_variable_registry, utils_registry

    registry_mgr: RegistryLookup = utils_registry.get('RegistryLookup')
    var = await registry_mgr.get(derived_variable_registry, str(derived_variable_entry.get('uid')))
    input_values: List[Any] = derived_variable_entry.get('values', [])
    result = await DerivedVariable.get_value(
        var_entry=var,
        store=store,
        task_mgr=task_mgr,
        args=input_values,
        force_key=derived_variable_entry.get('force_key'),
    )
    return result['value']


async def _resolve_data_var(data_variable_entry: ResolvedDataVariable, store: CacheStore):
    """
    Resolve a data variable from the registry and get it's new value based on the dynamic variable mapping passed
    in.

    :param data_variable_entry: data var entry
    :param store: the store instance to use for caching
    """
    from dara.core.internal.registries import data_variable_registry, utils_registry

    registry_mgr: RegistryLookup = utils_registry.get('RegistryLookup')
    var = await registry_mgr.get(data_variable_registry, str(data_variable_entry.get('uid')))
    result = await DataVariable.get_value(var, store, data_variable_entry.get('filters', None))
    return remove_index(result)


def _normalize_lookup_key(value: Any) -> str:
    """
    Normalize a value to a string key that matches JavaScript object key serialization.
    This ensures consistent lookup between Python backend and JavaScript frontend.

    JavaScript's String() conversion rules:
    - String(true) -> "true", String(false) -> "false"
    - String(null) -> "null", String(undefined) -> "undefined"
    - Numbers and other types are converted to their string representation

    :param value: The value to normalize as a lookup key
    :return: String representation suitable for object key lookup
    """
    if isinstance(value, bool):
        # JavaScript String(true) -> "true", String(false) -> "false"
        return str(value).lower()
    elif value is None:
        # JavaScript String(null) -> "null"
        return 'null'
    else:
        # For numbers, strings, and other types, use standard string conversion
        return str(value)


def _evaluate_condition(condition: dict) -> bool:
    """
    Evaluate a condition object and return the boolean result.

    :param condition: condition dict with 'variable', 'operator', and 'other' keys
    :return: boolean result of the condition evaluation
    """
    variable_value = condition['variable']
    operator = condition['operator']
    other_value = condition['other']

    if operator == 'equal':
        return variable_value == other_value
    elif operator == 'truthy':
        return bool(variable_value)
    elif operator == 'not_equal':
        return variable_value != other_value
    else:
        # strictly numeric comparisons, ensure they're numbers just in case
        val_a = float(variable_value)
        val_b = float(other_value)

        if operator == 'greater_than':
            return val_a > val_b
        elif operator == 'greater_equal':
            return val_a >= val_b
        elif operator == 'less_than':
            return val_a < val_b
        elif operator == 'less_equal':
            return val_a <= val_b
        else:
            raise ValueError(f'Unknown condition operator: {operator}')


async def _resolve_switch_var(
    switch_variable_entry: ResolvedSwitchVariable,
    store: CacheStore,
    task_mgr: TaskManager,
):
    """
    Resolve a switch variable by evaluating its constituent parts and returning the appropriate value.

    :param switch_variable_entry: switch variable entry
    :param store: store instance to use for caching
    :param task_mgr: task manager instance
    """

    async def _resolve_maybe_task(value: Any) -> Any:
        if isinstance(value, BaseTask):
            task_result = await task_mgr.run_task(value)
            if isinstance(task_result, PendingTask):
                return await task_result.value()
            return task_result
        return value

    # resolve the constituent parts
    resolved_value = await resolve_dependency(switch_variable_entry.get('value'), store, task_mgr)
    resolved_value = await _resolve_maybe_task(resolved_value)

    resolved_value_map = await resolve_dependency(switch_variable_entry.get('value_map'), store, task_mgr)
    resolved_value_map = await _resolve_maybe_task(resolved_value_map)

    resolved_default = await resolve_dependency(switch_variable_entry.get('default'), store, task_mgr)
    resolved_default = await _resolve_maybe_task(resolved_default)

    # The frontend should have already evaluated conditions and sent the resolved value
    # For switch variables, we just need to look up the value in the mapping
    if isinstance(resolved_value_map, dict):
        # value could be a condition object
        if isinstance(resolved_value, dict) and resolved_value.get('__typename') == 'Condition':
            # Evaluate the condition and use the boolean result as the lookup key
            try:
                # First, resolve any nested dependencies in the condition's 'other' field
                condition_copy = resolved_value.copy()
                condition_copy['other'] = await resolve_dependency(condition_copy.get('other'), store, task_mgr)
                condition_copy['other'] = await _resolve_maybe_task(condition_copy['other'])

                # Also resolve the variable field in case it's a dependency
                condition_copy['variable'] = await resolve_dependency(condition_copy.get('variable'), store, task_mgr)
                condition_copy['variable'] = await _resolve_maybe_task(condition_copy['variable'])

                # Evaluate the condition
                resolved_value = _evaluate_condition(condition_copy)
            except Exception as e:
                # If condition evaluation fails, log and use default
                dev_logger.error('Error evaluating condition', error=e)
                return resolved_default

        # Normalize the lookup key to match JavaScript object key serialization
        resolved_value = _normalize_lookup_key(resolved_value)

        # Try to get the value from the mapping, fall back to default
        return resolved_value_map.get(resolved_value, resolved_default)

    # If value_map is not a dict (shouldn't happen in normal cases), return default
    return resolved_default
