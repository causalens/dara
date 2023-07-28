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

from __future__ import annotations

from typing import Any, Callable, Coroutine, List, Optional, Union
from uuid import uuid4

from pandas import DataFrame

from dara.core.base_definitions import BaseTask, CacheType, PendingTask
from dara.core.interactivity.any_data_variable import (
    AnyDataVariable,
    DataVariableRegistryEntry,
)
from dara.core.interactivity.any_variable import AnyVariable
from dara.core.interactivity.derived_variable import (
    DerivedVariable,
    DerivedVariableRegistryEntry,
    DerivedVariableResult,
)
from dara.core.interactivity.filtering import (
    FilterQuery,
    Pagination,
    apply_filters,
    coerce_to_filter_query,
)
from dara.core.internal.hashing import hash_object
from dara.core.internal.pandas_utils import append_index
from dara.core.internal.store import Store
from dara.core.internal.tasks import MetaTask, Task, TaskManager
from dara.core.logging import eng_logger


class DerivedDataVariable(AnyDataVariable, DerivedVariable):
    """
    DerivedDataVariable represents a variable designed to hold datasets computed
    by a resolver function like a normal DerivedVariable.

    Note: the resolver function must return a DataFrame.
    """

    uid: str
    filters: Optional[FilterQuery] = None
    variables: List[AnyVariable]
    polling_interval: Optional[int]
    deps: Optional[List[AnyVariable]]

    class Config:
        extra = 'forbid'

    def __init__(
        self,
        func: Union[
            Callable[..., Union[DataFrame, None]],
            Callable[..., Coroutine[Any, Any, Union[DataFrame, None]]],
        ],
        variables: List[AnyVariable],
        cache: CacheType = CacheType.GLOBAL,
        run_as_task: bool = False,
        polling_interval: Optional[int] = None,
        deps: Optional[List[AnyVariable]] = None,
        uid: Optional[str] = None,
    ) -> None:
        """
        DerivedDataVariable represents a variable designed to hold datasets computed
        by a resolver function like a normal DerivedVariable.

        Note: the resolver function must return a DataFrame.

        :param func: the function to derive a new value from the input variables. Must return a DataFrame
        :param variables: a set of input variables that will be passed to the deriving function
        :param default: the initial value for the variable, defaults to None
        :param cache: whether to cache the result, defaults to global caching. Other options are to cache per user
                      session, or per user
        :param run_as_task: whether to run the calculation in a separate process, recommended for any CPU intensive
                            tasks, defaults to False
        :param polling_interval: an optional polling interval for the DerivedVariable. Setting this will cause the
                             component to poll the backend and refresh itself every n seconds.
        :param deps: an optional array of variables, specifying which dependant variables changing should trigger a
                        recalculation of the derived variable
        - `deps = None` - `func` is ran everytime (default behaviour),
        - `deps = []` - `func` is ran once on initial startup,
        - `deps = [var1, var2]` - `func` is ran whenever one of these vars changes
        :param uid: the unique identifier for this variable; if not provided a random one is generated
        """
        # Initialize the DV underneath, which puts an entry in the derived variable registry
        super().__init__(
            func=func,
            cache=cache,
            uid=uid,
            variables=variables,
            polling_interval=polling_interval,
            deps=deps,
            run_as_task=run_as_task,
        )

        # Also put an entry in the data variable registry under the same uid; this way we can send a request
        # for either the DV (to update the cached value) or the DataVariable (to get the cached value)
        from dara.core.internal.registries import data_variable_registry

        data_variable_registry.register(
            str(self.uid),
            DataVariableRegistryEntry(type='derived', cache=cache, uid=str(self.uid)),
        )

    @staticmethod
    def _filter_data(
        data: Union[DataFrame, Any, None],
        count_cache_key: str,
        cache_type: CacheType,
        store: Store,
        filters: Optional[Union[FilterQuery, dict]] = None,
        pagination: Optional[Pagination] = None,
    ) -> Optional[DataFrame]:
        """
        Helper function to apply filters and pagination to a dataframe.
        Also verifies if the data is a DataFrame.

        :param data: data to filter
        :param count_cache_key: cache key to store the count under
        :param cache_type: cache type to use for the count
        :param store: store instance
        :param filters: filters to use
        :param pagination: pagination to use
        """
        if data is not None and not isinstance(data, DataFrame):
            raise ValueError(f'Data returned by DerivedDataVariable resolver must be a DataFrame, found {type(data)}')

        # Right before we filter, append index column to the dataset
        data = append_index(data)

        filtered_data, count = apply_filters(data, coerce_to_filter_query(filters), pagination)

        # Cache the count
        store.set(count_cache_key, count, cache_type)

        return filtered_data

    @classmethod
    async def get_value(
        cls,
        var_entry: DerivedVariableRegistryEntry,
        store: Store,
        task_mgr: TaskManager,
        args: List[Any],
        force: bool = False,
    ) -> DerivedVariableResult:
        """
        Update the underlying derived variable.
        Wrapper around DerivedVariable.get_value which does not return the value (returns `True` instead).

        :param var: the registry entry for the underlying derived variable
        :param store: the store instance to check for cached values
        :param task_mgr: task manager instance
        :param args: the arguments to call the underlying function with
        :param force: whether to ignore cache
        """
        _uid_short = f'{var_entry.uid[:3]}..{var_entry.uid[-3:]}'
        eng_logger.info(
            f'Derived Data Variable {_uid_short} calling superclass get_value', {'uid': var_entry.uid, 'args': args}
        )
        value = await super().get_value(var_entry, store, task_mgr, args, force)

        eng_logger.info(
            f'Derived Data Variable {_uid_short} received result from superclass',
            {'uid': var_entry.uid, 'result': value},
        )

        # If the value is a task, then we need to return it
        if isinstance(value['value'], BaseTask):
            return value

        return {'cache_key': value['cache_key'], 'value': True}

    @classmethod
    def get_data(
        cls,
        var_entry: DataVariableRegistryEntry,
        cache_key: str,
        store: Store,
        filters: Optional[Union[FilterQuery, dict]] = None,
        pagination: Optional[Pagination] = None,
    ) -> Union[BaseTask, DataFrame, None]:
        """
        Get the filtered data from the underlying derived variable stored under the specified cache_key.

        :param var_entry: the registry entry for the data variable
        :param cache_key: cache_key of the underlying DerivedVariable
        :param store: the store instance to check for cached values
        :param filters: the filters to apply to the data
        :param pagination: the pagination to apply to the data
        """
        _uid_short = f'{var_entry.uid[:3]}..{var_entry.uid[-3:]}'
        data_cache_key = f'{cache_key}_{hash_object(filters or {})}_{hash_object(pagination or {})}'
        count_cache_key = f'{cache_key}_{hash_object(filters or {})}'

        data_store_entry = store.get(data_cache_key, var_entry.cache)

        # if there's a pending task for this exact request, subscribe to the pending task and return it
        if isinstance(data_store_entry, PendingTask):
            data_store_entry.add_subscriber()
            return data_store_entry

        # First retrieve the cached data for underlying DV
        data = store.get(cache_key, var_entry.cache)

        eng_logger.info(
            f'Derived Data Variable {_uid_short} retrieved underlying DV value', {'uid': var_entry.uid, 'value': data}
        )

        # if the DV returned a task (Task/PendingTask), return a MetaTask which will do the filtering on the task result
        if isinstance(data, BaseTask):
            task_id = f'{var_entry.uid}_Filter_MetaTask_{str(uuid4())}'

            eng_logger.info(
                f'Derived Data Variable {_uid_short} creating filtering metatask',
                {'uid': var_entry.uid, 'task_id': task_id, 'cache_key': data_cache_key},
            )

            return MetaTask(
                cls._filter_data,
                [data, count_cache_key, var_entry.cache, store, filters, pagination],
                notify_channels=data.notify_channels,
                process_as_task=False,
                cache_key=data_cache_key,
                cache_type=var_entry.cache,
                task_id=task_id,
            )

        # Run the filtering
        data = cls._filter_data(data, count_cache_key, var_entry.cache, store, filters, pagination)

        return data

    @classmethod
    def get_total_count(
        cls, data_entry: DataVariableRegistryEntry, store: Store, cache_key: str, filters: Optional[FilterQuery]
    ):
        """
        Get total count of the derived data variable.
        """
        count_cache_key = f'{cache_key}_{hash_object(filters or {})}'
        entry = store.get(count_cache_key, cache_type=data_entry.cache)

        # No entry means this filter setup has not been done yet, this shouldn't happen
        if entry is None:
            raise ValueError('Requested count for filter setup which has not been performed yet')

        return entry

    @classmethod
    async def resolve_value(
        cls,
        data_entry: DataVariableRegistryEntry,
        dv_entry: DerivedVariableRegistryEntry,
        store: Store,
        task_mgr: TaskManager,
        args: List[Any],
        force: bool,
        filters: Optional[Union[FilterQuery, dict]] = None,
    ):
        """
        Helper method to resolve the filtered value of a derived data variable.
        Under the hood runs the underlying DerivedVariable, starts its task if required, and then filters the result.

        :param var: the registry entry for the underlying derived variable
        :param store: the store instance to check for cached values
        :param task_mgr: task manager instance
        :param args: the arguments to call the underlying function with
        :param force: whether to ignore cache
        :param filters: the filters to apply to the data
        :param pagination: the pagination to apply to the data
        """
        dv_result = await cls.get_value(dv_entry, store, task_mgr, args, force)

        # If the intermediate result was a task/metatask, we need to run it
        # get_data will then pick up the result from the pending task for it
        if isinstance(dv_result['value'], (Task, MetaTask)):
            await task_mgr.run_task(dv_result['value'], None)

        return cls.get_data(data_entry, dv_result['cache_key'], store, filters)

    def dict(self, *args, **kwargs):
        parent_dict = super().dict(*args, **kwargs)
        # nested is not supported for DerivedDataVariable so remove from serialised form
        # it's included because we inherit from DV which has the field
        parent_dict.pop('nested')
        return {**parent_dict, '__typename': 'DerivedDataVariable', 'uid': str(parent_dict['uid'])}
