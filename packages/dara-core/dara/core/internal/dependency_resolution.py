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

from dara.core.interactivity import DataVariable, DerivedDataVariable, DerivedVariable
from dara.core.interactivity.filtering import FilterQuery
from dara.core.internal.cache_store import CacheStore
from dara.core.internal.pandas_utils import remove_index
from dara.core.internal.registry_lookup import RegistryLookup
from dara.core.internal.tasks import TaskManager


class ResolvedDerivedVariable(TypedDict):
    deps: List[int]
    type: Literal['derived']
    uid: str
    values: List[Any]
    force: bool


class ResolvedDerivedDataVariable(TypedDict):
    deps: List[int]
    type: Literal['derived-data']
    uid: str
    values: List[Any]
    filters: Optional[Union[FilterQuery, dict]]
    force: bool


class ResolvedDataVariable(TypedDict):
    filters: Optional[Union[FilterQuery, dict]]
    type: Literal['data']
    uid: str


def is_resolved_derived_variable(obj: Any) -> TypeGuard[ResolvedDerivedVariable]:
    return isinstance(obj, dict) and 'uid' in obj and obj.get('type') == 'derived'


def is_resolved_derived_data_variable(obj: Any) -> TypeGuard[ResolvedDerivedDataVariable]:
    return isinstance(obj, dict) and 'uid' in obj and obj.get('type') == 'derived-data'


def is_resolved_data_variable(obj: Any) -> TypeGuard[ResolvedDataVariable]:
    return isinstance(obj, dict) and 'uid' in obj and obj.get('type') == 'data'


async def resolve_dependency(
    entry: Union[ResolvedDerivedDataVariable, ResolvedDataVariable, ResolvedDerivedVariable, Any],
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
        data_var, dv_var, store, task_mgr, input_values, entry.get('force', False), entry.get('filters', None)
    )
    return remove_index(result)


async def _resolve_derived_var(
    derived_variable_entry: ResolvedDerivedVariable, store: CacheStore, task_mgr: TaskManager
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
        var, store, task_mgr, input_values, derived_variable_entry.get('force', False)
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
