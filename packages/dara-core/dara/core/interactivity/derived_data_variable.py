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

import asyncio
from collections.abc import Coroutine
from typing import Any, Callable, List, Optional, Union, cast
from uuid import uuid4

from pandas import DataFrame
from pandas.io.json._table_schema import build_table_schema
from pydantic import ConfigDict, SerializerFunctionWrapHandler, model_serializer

from dara.core.base_definitions import (
    BaseTask,
    Cache,
    CacheArgType,
    PendingTask,
    PendingValue,
)
from dara.core.interactivity.any_data_variable import (
    AnyDataVariable,
    DataFrameSchema,
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
from dara.core.internal.cache_store import CacheStore
from dara.core.internal.hashing import hash_object
from dara.core.internal.pandas_utils import append_index, df_convert_to_internal
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
    polling_interval: Optional[int] = None
    deps: Optional[List[AnyVariable]] = None
    model_config = ConfigDict(extra='forbid')

    def __init__(
        self,
        func: Union[
            Callable[..., Union[DataFrame, None]],
            Callable[..., Coroutine[Any, Any, Union[DataFrame, None]]],
        ],
        variables: List[AnyVariable],
        cache: CacheArgType = Cache.Type.GLOBAL,
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
        cache = Cache.Policy.from_arg(cache)

        # Initialize the DV underneath, which puts an entry in the derived variable registry
        super().__init__(
            func=func,
            cache=cache,
            uid=uid,
            variables=variables,
            polling_interval=polling_interval,
            deps=deps,
            run_as_task=run_as_task,
            _get_value=DerivedDataVariable.get_value,
        )

        # Also put an entry in the data variable registry under the same uid; this way we can send a request
        # for either the DV (to update the cached value) or the DataVariable (to get the cached value)
        from dara.core.internal.registries import data_variable_registry

        data_variable_registry.register(
            str(self.uid),
            DataVariableRegistryEntry(
                type='derived',
                cache=cache,
                uid=str(self.uid),
                get_data=DerivedDataVariable.get_data,
                get_total_count=DerivedDataVariable.get_total_count,
                get_schema=DerivedDataVariable.get_schema,
            ),
        )

    @staticmethod
    def _get_schema_cache_key(cache_key: str) -> str:
        """
        Get a unique cache key for the data variable's schema.

        :param cache_key: cache_key of the DerivedDataVariable
        """
        return f'schema-{cache_key}'

    @staticmethod
    async def _filter_data(
        data: Union[DataFrame, Any, None],
        count_cache_key: str,
        var_entry: DataVariableRegistryEntry,
        store: CacheStore,
        filters: Optional[Union[FilterQuery, dict]] = None,
        pagination: Optional[Pagination] = None,
    ) -> Optional[DataFrame]:
        """
        Helper function to apply filters and pagination to a dataframe.
        Also verifies if the data is a DataFrame.

        :param data: data to filter
        :param count_cache_key: cache key to store the count under
        :param var_entry: data variable entry
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
        await store.set(var_entry, key=count_cache_key, value=count, pin=True)

        return filtered_data

    @classmethod
    async def get_value(
        cls,
        var_entry: DerivedVariableRegistryEntry,
        store: CacheStore,
        task_mgr: TaskManager,
        args: List[Any],
        force_key: Optional[str] = None,
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
        value = await super().get_value(var_entry, store, task_mgr, args, force_key)

        # Pin the value in the store until it's read by get data
        await asyncio.gather(
            store.set(registry_entry=var_entry, key=value['cache_key'], value=value['value'], pin=True),
            store.set(
                registry_entry=var_entry,
                key=cls._get_schema_cache_key(value['cache_key']),
                value=build_table_schema(
                    df_convert_to_internal(cast(DataFrame, value['value'])),
                )
                if isinstance(value['value'], DataFrame)
                else None,
                pin=True,
            ),
        )

        eng_logger.info(
            f'Derived Data Variable {_uid_short} received result from superclass',
            {'uid': var_entry.uid, 'result': value},
        )

        # If the value is a task, then we need to return it
        if isinstance(value['value'], BaseTask):
            return value

        return {'cache_key': value['cache_key'], 'value': True}

    @classmethod
    async def get_data(
        cls,
        dv_entry: DerivedVariableRegistryEntry,
        data_entry: DataVariableRegistryEntry,
        cache_key: str,
        store: CacheStore,
        filters: Optional[Union[FilterQuery, dict]] = None,
        pagination: Optional[Pagination] = None,
        format_for_display: bool = False,
    ) -> Union[BaseTask, DataFrame, None]:
        """
        Get the filtered data from the underlying derived variable stored under the specified cache_key.

        :param var_entry: the registry entry for the data variable
        :param cache_key: cache_key of the underlying DerivedVariable
        :param store: the store instance to check for cached values
        :param filters: the filters to apply to the data
        :param pagination: the pagination to apply to the data
        """
        _uid_short = f'{data_entry.uid[:3]}..{data_entry.uid[-3:]}'
        data_cache_key = f'{cache_key}_{hash_object(filters or {})}_{hash_object(pagination or {})}'
        count_cache_key = f'{cache_key}_{hash_object(filters or {})}'

        # Check for cached result of the entire data variable
        data_store_entry = await store.get(data_entry, key=data_cache_key)

        # if there's a pending task for this exact request, subscribe to the pending task and return it
        if isinstance(data_store_entry, PendingTask):
            data_store_entry.add_subscriber()
            return data_store_entry

        # Found cached result
        if isinstance(data_store_entry, DataFrame):
            return data_store_entry

        # First retrieve the cached data for underlying DV
        data = await store.get(dv_entry, key=cache_key, unpin=True)

        # Value could have been made pending in the meantime
        if isinstance(data, PendingValue):
            data = await data.wait()

        eng_logger.info(
            f'Derived Data Variable {_uid_short} retrieved underlying DV value', {'uid': dv_entry.uid, 'value': data}
        )

        # if the DV returned a task (Task/PendingTask), return a MetaTask which will do the filtering on the task result
        if isinstance(data, BaseTask):
            task_id = f'{dv_entry.uid}_Filter_MetaTask_{str(uuid4())}'

            eng_logger.info(
                f'Derived Data Variable {_uid_short} creating filtering metatask',
                {'uid': dv_entry.uid, 'task_id': task_id, 'cache_key': data_cache_key},
            )

            return MetaTask(
                cls._filter_data,
                [data, count_cache_key, data_entry, store, filters, pagination],
                notify_channels=data.notify_channels,
                process_as_task=False,
                cache_key=data_cache_key,
                reg_entry=data_entry,  # task results are set as the variable result
                task_id=task_id,
            )

        # Run the filtering
        data = await cls._filter_data(data, count_cache_key, data_entry, store, filters, pagination)
        if format_for_display and data is not None:
            data = data.copy()
            for col in data.columns:
                if data[col].dtype == 'object':
                    # We need to convert all values to string to avoid issues with displaying data in the Table component, for example when displaying datetime and number objects in the same column
                    data.loc[:, col] = data[col].apply(str)

        return data

    @classmethod
    async def get_total_count(
        cls, data_entry: DataVariableRegistryEntry, store: CacheStore, cache_key: str, filters: Optional[FilterQuery]
    ):
        """
        Get total count of the derived data variable.
        """
        count_cache_key = f'{cache_key}_{hash_object(filters or {})}'
        entry = await store.get(data_entry, key=count_cache_key, unpin=True)

        # No entry means this filter setup has not been done yet, this shouldn't happen
        if entry is None:
            raise ValueError('Requested count for filter setup which has not been performed yet')

        return entry

    @classmethod
    async def get_schema(cls, derived_entry: DerivedVariableRegistryEntry, store: CacheStore, cache_key: str):
        """
        Get the schema of the derived data variable.
        """
        return cast(
            DataFrameSchema, await store.get(derived_entry, key=cls._get_schema_cache_key(cache_key), unpin=True)
        )

    @classmethod
    async def resolve_value(
        cls,
        data_entry: DataVariableRegistryEntry,
        dv_entry: DerivedVariableRegistryEntry,
        store: CacheStore,
        task_mgr: TaskManager,
        args: List[Any],
        filters: Optional[Union[FilterQuery, dict]] = None,
        force_key: Optional[str] = None,
    ):
        """
        Helper method to resolve the filtered value of a derived data variable.
        Under the hood runs the underlying DerivedVariable, starts its task if required, and then filters the result.

        :param data_entry: the registry entry for the data variable
        :param dv_entry: the registry entry for the underlying derived variable
        :param store: the store instance to check for cached values
        :param task_mgr: task manager instance
        :param args: the arguments to call the underlying function with
        :param filters: the filters to apply to the data
        :param force_key: unique key for forced execution, if provided forces cache bypass
        :param pagination: the pagination to apply to the data
        """
        dv_result = await cls.get_value(dv_entry, store, task_mgr, args, force_key)

        # If the intermediate result was a task/metatask, we need to run it
        # get_data will then pick up the result from the pending task for it
        if isinstance(dv_result['value'], (Task, MetaTask)):
            await task_mgr.run_task(dv_result['value'], None)

        return await cls.get_data(dv_entry, data_entry, dv_result['cache_key'], store, filters)

    @model_serializer(mode='wrap')
    def ser_model(self, nxt: SerializerFunctionWrapHandler) -> dict:
        parent_dict = nxt(self)
        # nested is not supported for DerivedDataVariable so remove from serialised form
        # it's included because we inherit from DV which has the field
        parent_dict.pop('nested')
        return {**parent_dict, '__typename': 'DerivedDataVariable', 'uid': str(parent_dict['uid'])}
