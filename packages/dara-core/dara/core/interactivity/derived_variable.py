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

import json
import uuid
from collections.abc import Awaitable
from inspect import Parameter, signature
from typing import (
    Any,
    Callable,
    Generic,
    List,
    Optional,
    Protocol,
    Tuple,
    TypeVar,
    Union,
    cast,
)

import anyio
from cachetools import LRUCache
from pandas import DataFrame
from pydantic import (
    ConfigDict,
    Field,
    SerializerFunctionWrapHandler,
    ValidationInfo,
    field_validator,
    model_serializer,
)
from typing_extensions import TypedDict, runtime_checkable

from dara.core.base_definitions import (
    BaseCachePolicy,
    BaseTask,
    Cache,
    CacheArgType,
    CachedRegistryEntry,
    NonTabularDataError,
    PendingTask,
)
from dara.core.interactivity.actions import TriggerVariable, assert_no_context
from dara.core.interactivity.any_variable import AnyVariable
from dara.core.interactivity.client_variable import ClientVariable
from dara.core.interactivity.filtering import FilterQuery, Pagination, apply_filters
from dara.core.internal.cache_store import CacheStore
from dara.core.internal.encoder_registry import deserialize
from dara.core.internal.multi_resource_lock import MultiResourceLock
from dara.core.internal.pandas_utils import DataResponse, append_index, build_data_response
from dara.core.internal.tasks import MetaTask, Task, TaskManager
from dara.core.internal.utils import get_cache_scope, run_user_handler
from dara.core.logging import dev_logger, eng_logger
from dara.core.metrics import RUNTIME_METRICS_TRACKER

VariableType = TypeVar('VariableType')

# Static lock for all DV computations, keyed by cache_key
# Explicitly not re-entrant, this prevents variable loops
DV_LOCK = MultiResourceLock()

# Global set to track force keys that have been encountered
# LRU with 2048 entries should be sufficient to not drop in-progress force keys
# but also not have to worry about memory leaks
_force_keys_seen: LRUCache[str, bool] = LRUCache(maxsize=2048)

VALUE_MISSING = object()
"""
Sentinel value to indicate that a value is missing from the cache
"""


class DerivedVariableResult(TypedDict):
    cache_key: str
    value: Union[Any, BaseTask]


@runtime_checkable
class FilterResolver(Protocol):
    async def __call__(
        self, data: Any, filters: Optional[FilterQuery] = None, pagination: Optional[Pagination] = None
    ) -> Tuple[DataFrame, int]: ...


async def default_filter_resolver(
    data: Any, filters: Optional[FilterQuery] = None, pagination: Optional[Pagination] = None
) -> Tuple[DataFrame, int]:
    if not isinstance(data, DataFrame):
        raise NonTabularDataError(
            f'Default filter resolver expects a DataFrame to be returned from the DerivedVariable function, got {type(data)}'
        )
    return apply_filters(data, filters, pagination)


class DerivedVariable(ClientVariable, Generic[VariableType]):
    """
    A DerivedVariable allows a value to be derived (via a function) from the current value of a set of other
    variables with a python function. This is one of two primary ways that python logic can be embedded into the
    application (the other being the @py_component decorator).

    DerivedVariables can be chained together to form complex data flows whilst keeping everything organized and
    structured in an easy to follow way. DerivedVariable results are cached automatically and will only be
    recalculated when necessary.

    As a special case, DerivedVariables can be used for tabular data and retrieving its slice as a DataFrame. This functionality
    is utilized by e.g. the built-in Table component. By default, when passing a DerivedVariable to a Table component, Dara
    expects the resolver function to return a DataFrame or None. This behaviour can be customized by providing a custom `filter_resolver`.
    This function will be invoked with the result of the main DerivedVariable function, as well as filters and pagination. It can be used
    to e.g. retrieve a slice of data from an API endpoint or a database instead of retrieving the entire dataset and filtering it in-memory.

    ```python
    from typing import Optional
    import httpx
    import pandas as pd
    from dara.core import DerivedVariable, Variable
    from dara.core.interactivity.filtering import FilterQuery, Pagination

    # Custom filter resolver for API-based filtering
    async def api_filter_resolver(data, filters: Optional[FilterQuery] = None, pagination: Optional[Pagination] = None):
        async with httpx.AsyncClient() as client:
            # in this case data is a string url
            response = await client.get(data, params={
                # translates filters/pagination to API-specific query params
                'filters': filters.dict() if filters else {},
                'offset': pagination.offset if pagination else 0,
                'limit': pagination.limit if pagination else 50
            })
            data = response.json()
            # conform to the filter resolver API, return a tuple of (DataFrame, total_count)
            return pd.DataFrame(data['results']), data['total_count']

    # DerivedVariable with custom filtering
    user_params = Variable({'dataset': 'experiments'})
    derived_data = DerivedVariable(
        lambda params: f"https://api.example.com/data/{params['dataset']}",
        variables=[user_params],
        filter_resolver=api_filter_resolver
    )
    ```

    :param func: the function to derive a new value from the input variables.
    :param variables: a set of input variables that will be passed to the deriving function
    :param cache: whether to cache the result, defaults to global caching. Other options are to cache per user
                  session, per user or to not cache at all
    :param run_as_task: whether to run the calculation in a separate process, recommended for any CPU intensive
                        tasks, defaults to False
    :param polling_interval: an optional polling interval for the DerivedVariable. Setting this will cause the
                         component to poll the backend and refresh itself every n seconds.
    :param filter_resolver: an optional function to resolve the filter query for the derived variable. This can be
    used to customize the way tabular data is resolved. This is invoked with the result of the main DerivedVariable function,
    as well as filters and pagination. The function should return a DataFrame and total count.
    :param deps: an optional array of variables, specifying which dependant variables changing should trigger a
                    recalculation of the derived variable
    - `deps = None` - `func` is ran everytime (default behaviour),
    - `deps = []` - `func` is ran once on initial startup,
    - `deps = [var1, var2]` - `func` is ran whenever one of these vars changes
    - `deps = [var1.get('nested_property')]` - `func` is ran only when the nested property changes, other changes to the variable are ignored
    :param uid: the unique identifier for this variable; if not provided a random one is generated
    """

    cache: Optional[BaseCachePolicy]
    variables: List[AnyVariable]
    polling_interval: Optional[int]
    deps: Optional[List[AnyVariable]] = Field(validate_default=True)
    nested: List[str] = Field(default_factory=list)
    uid: str
    model_config = ConfigDict(extra='forbid', use_enum_values=True, arbitrary_types_allowed=True)

    def __init__(
        self,
        func: Union[Callable[..., VariableType], Callable[..., Awaitable[VariableType]]],
        variables: List[AnyVariable],
        cache: Optional[CacheArgType] = Cache.Type.GLOBAL,
        run_as_task: bool = False,
        polling_interval: Optional[int] = None,
        deps: Optional[List[AnyVariable]] = None,
        uid: Optional[str] = None,
        nested: Optional[List[str]] = None,
        filter_resolver: Optional[FilterResolver] = None,
        **kwargs,
    ):
        if nested is None:
            nested = []

        # Validate that StateVariables are not used as inputs
        from dara.core.interactivity.state_variable import StateVariable

        for var in variables:
            if isinstance(var, StateVariable):
                raise ValueError(
                    'StateVariable cannot be used as input to DerivedVariable. '
                    'StateVariables are internal variables for tracking DerivedVariable states '
                    'and using them as inputs would create complex dependencies that are '
                    'difficult to debug. Consider using the parent DerivedVariable directly instead,'
                    ' or use the StateVariable with an If component or SwitchVariable.'
                )

        if cache is not None:
            cache = Cache.Policy.from_arg(cache)

            # if deps are present we currently can only keep most recent value
            if deps is not None:
                cache = Cache.Policy.MostRecent(cache_type=cache.cache_type)

        # Explicitly disallow run_as_task within a Jupyter environment
        if run_as_task:
            try:
                from IPython import get_ipython  # type: ignore
            except ImportError:
                pass
            else:
                if get_ipython() is not None:
                    raise RuntimeError('run_as_task is not supported within a Jupyter environment')

        super().__init__(
            cache=cache,
            uid=uid,
            variables=variables,
            polling_interval=polling_interval,
            deps=deps,
            nested=nested,
            **kwargs,
        )

        # Import the registry of variables and register the function at import
        from dara.core.internal.registries import derived_variable_registry

        deps_indexes: Optional[List[int]] = None

        # If deps is provided, compute list of indexes of values which are present in deps
        if deps is not None:
            variables_uids = [str(var.uid) for var in variables]
            deps_uids = [str(dep.uid) for dep in deps]
            deps_indexes = [variables_uids.index(d_uid) for d_uid in deps_uids]

        derived_variable_registry.register(
            str(self.uid),
            DerivedVariableRegistryEntry(
                cache=cache,
                func=func,
                filter_resolver=filter_resolver,
                polling_interval=polling_interval,
                run_as_task=run_as_task,
                uid=str(self.uid),
                variables=variables,
                deps=deps_indexes,
                get_value=DerivedVariable.get_value,
                get_tabular_data=DerivedVariable.get_tabular_data,
            ),
        )

    @field_validator('deps', mode='before')
    @classmethod
    def validate_deps(cls, deps: Any, info: ValidationInfo) -> List[AnyVariable]:
        """
        If deps is not specified, set deps to include all variables used
        """
        if deps is None:
            # This will always be set on the variable with the type verified by pydantic
            return cast(List[AnyVariable], info.data.get('variables'))

        return deps

    def get(self, key: str):
        return self.model_copy(update={'nested': [*self.nested, key]}, deep=True)

    def trigger(self, force: bool = True):
        """
        Get a TriggerVariable action for the variable that can be used to force a recalculation.

        :param force: whether the recalculation should ignore any caching settings, defaults to True
        """
        assert_no_context('ctx.trigger')
        return TriggerVariable(variable=self, force=force)

    @property
    def is_loading(self):
        """
        Get a StateVariable that tracks the loading state of this DerivedVariable.

        :return: StateVariable that is True when this DerivedVariable is loading, False otherwise
        """
        from dara.core.interactivity.state_variable import StateVariable

        return StateVariable(parent_variable=self, property_name='loading')

    @property
    def has_error(self):
        """
        Get a StateVariable that tracks the error state of this DerivedVariable.

        :return: StateVariable that is True when this DerivedVariable has an error, False otherwise
        """
        from dara.core.interactivity.state_variable import StateVariable

        return StateVariable(parent_variable=self, property_name='error')

    @property
    def has_value(self):
        """
        Get a StateVariable that tracks whether this DerivedVariable has a resolved value.

        :return: StateVariable that is True when this DerivedVariable has a value, False otherwise
        """
        from dara.core.interactivity.state_variable import StateVariable

        return StateVariable(parent_variable=self, property_name='hasValue')

    @staticmethod
    def _get_cache_key(*args, uid: str, deps: Optional[List[int]] = None):
        """
        Convert the set of args that will be passed into the function to a string for use as the cache key. For now this
        assumes that no classes will be passed in as the underlying values will come from the UI.

        :param args: current values of arguments sent to DV
        :param uid: uid of a DerivedVariable
        :param deps: list of indexes of dependencies
        """
        from dara.core.internal.dependency_resolution import clean_force_key

        key = f'{uid}'

        filtered_args = [arg for idx, arg in enumerate(args) if idx in deps] if deps is not None else args

        for raw_arg in filtered_args:
            # remove force keys from the arg to not cause extra cache misses
            arg = clean_force_key(raw_arg)

            key = f'{key}:{json.dumps(arg, sort_keys=True, default=str)}' if isinstance(arg, dict) else f'{key}:{arg}'
        return key

    @staticmethod
    def _restore_pydantic_models(func: Callable[..., Any], *args):
        """
        Restore argument types based on their annotations.

        :param func: the function to restore the arguments for
        :param args: the arguments to restore
        """
        parsed_args = []
        parameters = list(signature(func).parameters.values())
        # Scan the list for any var arg or kwarg arguments
        var_arg_idx = [i for i, val in enumerate(parameters) if val.kind == Parameter.VAR_POSITIONAL]
        var_kwarg_idx = [i for i, val in enumerate(parameters) if val.kind == Parameter.VAR_KEYWORD]

        if len(var_kwarg_idx) > 0:
            dev_logger.debug('**kwargs is not supported by DerivedVariables and will be ignored')

        # If there is no *args argument then zip the signature with the args
        if len(var_arg_idx) == 0:
            for param, arg in zip(parameters, args):
                typ = param.annotation
                parsed_args.append(deserialize(arg, typ))

            return parsed_args

        # If there is a *args argument then zip the signature and args up to that point, then spread the rest
        for param, arg in zip(parameters[: var_arg_idx[0]], args[: var_arg_idx[0]]):
            typ = param.annotation
            parsed_args.append(deserialize(arg, typ))

        parsed_args.extend(args[var_arg_idx[0] :])
        return parsed_args

    @classmethod
    async def add_latest_value(cls, store: CacheStore, var_entry: DerivedVariableRegistryEntry, cache_key: str):
        """
        Adds the latest value of this DerivedVariable to the registry. This method considers the cache_type of this DerivedVariable and adds or updates its entry in the registry.

        :param var_entry: the registry entry for the derived variable
        :param cache_key: the cache key for the derived variable
        """
        from dara.core.internal.registries import latest_value_registry

        reg_entry: LatestValueRegistryEntry
        cache_type = var_entry.cache.cache_type if var_entry.cache is not None else None

        # Make sure we have an entry in the latest value registry for this DerivedVariable
        if not latest_value_registry.has(var_entry.uid):
            # Keep latest entry per scope (user,session); if cache_type is None, use GLOBAL
            reg_entry = LatestValueRegistryEntry(
                uid=var_entry.uid,
                cache=Cache.Policy.MostRecent(cache_type=cache_type or Cache.Type.GLOBAL),
            )
            latest_value_registry.register(var_entry.uid, reg_entry)
        else:
            reg_entry = latest_value_registry.get(var_entry.uid)

        # Update the entry; keep track of scope:value
        await store.set(reg_entry, key=get_cache_scope(cache_type), value=cache_key)

    @classmethod
    async def get_value(
        cls,
        var_entry: DerivedVariableRegistryEntry,
        store: CacheStore,
        task_mgr: TaskManager,
        args: List[Any],
        force_key: Optional[str] = None,
        _pin_result: bool = False,
    ) -> DerivedVariableResult:
        """
        Get the value of this DerivedVariable. This method will check the main app store for an appropriate response
        first, if it does not find one then it will run the underlying function in a separate process and return the
        result. Adding it to the cache in the process.

        :param var: the registry entry for the derived variable
        :param store: the store instance to check for cached values
        :param task_mgr: task manager instance
        :param args: the arguments to call the underlying function with
        :param force_key: unique key for forced execution, if provided forces cache bypass
        :param _pin_result: whether to pin the result in the store, used internally by derived data variables
        """
        # dynamic import due to circular import
        from dara.core.internal.dependency_resolution import (
            is_forced,
            resolve_dependency,
        )

        assert var_entry.func is not None, 'DerivedVariable function is not defined'

        # Shortened UID used for logging
        _uid_short = f'{var_entry.uid[:3]}..{var_entry.uid[-3:]}'

        if var_entry.run_as_task:
            from dara.core.internal.registries import utils_registry

            if utils_registry.get('TaskPool') is None:
                raise RuntimeError(
                    'Task module is not configured. Set config.task_module path to a tasks.py module to run a derived variable as task.'
                )

        # Compute cache key first, before any other work
        cache_key = DerivedVariable._get_cache_key(*args, uid=var_entry.uid, deps=var_entry.deps)

        # Lock on this specific cache key for the entire computation
        async with DV_LOCK.acquire(cache_key):
            histogram = RUNTIME_METRICS_TRACKER.get_dv_histogram(var_entry.uid)

            with histogram.time():
                # Extract and process nested derived variables
                values: List[Any] = [None] * len(args)

                eng_logger.info(
                    f'Derived Variable {_uid_short} get_value',
                    {'uid': var_entry.uid, 'args': args},
                )

                # Whether one of the (grand?)children have been forced - is so, the parent should skip the cache as well
                has_forced_child = False

                async def _resolve_arg(val: Any, index: int):
                    nonlocal has_forced_child

                    if is_forced(val):
                        has_forced_child = True
                    var_value = await resolve_dependency(val, store, task_mgr)
                    values[index] = var_value

                async with anyio.create_task_group() as tg:
                    for idx, val in enumerate(args):
                        tg.start_soon(_resolve_arg, val, idx)

                eng_logger.debug(
                    f'DerivedVariable {_uid_short}',
                    'resolved arguments',
                    {'values': values, 'uid': var_entry.uid},
                )

                # Loop over the passed arguments and if the expected type is a BaseModel and arg is a dict then convert the dict
                # to an instance of the BaseModel class.
                parsed_args = DerivedVariable._restore_pydantic_models(var_entry.func, *values)

                dev_logger.debug(
                    f'DerivedVariable {_uid_short}',
                    'executing',
                    {'args': parsed_args, 'uid': var_entry.uid},
                )

                # Check if there are any Tasks to be run in the args
                has_tasks = any(isinstance(arg, BaseTask) for arg in parsed_args)

                await DerivedVariable.add_latest_value(store, var_entry, cache_key)

                cache_type = var_entry.cache

                # Handle force key tracking to prevent double execution
                effective_force = force_key is not None
                if force_key is not None:
                    if force_key in _force_keys_seen:
                        # This force key has been seen before, don't force again
                        effective_force = False
                        eng_logger.debug(
                            f'DerivedVariable {_uid_short} force key already seen, using cached value',
                            extra={'uid': var_entry.uid, 'force_key': force_key},
                        )
                    else:
                        # First time seeing this force key, add it to the set
                        _force_keys_seen[force_key] = True
                        eng_logger.debug(
                            f'DerivedVariable {_uid_short} new force key, will force recalculation',
                            extra={'uid': var_entry.uid, 'force_key': force_key},
                        )

                eng_logger.debug(
                    f'DerivedVariable {_uid_short}',
                    f'using cache: {cache_type}',
                    {'uid': var_entry.uid},
                )

                # Start with a sentinel value to indicate that the value is missing
                # from cache, this lets us distinguish between a cache miss and a
                # value that is None
                value = VALUE_MISSING

                ignore_cache = (
                    var_entry.cache is None
                    or var_entry.polling_interval
                    or DerivedVariable.check_polling(var_entry.variables)
                    or effective_force
                    or has_forced_child
                )
                if not ignore_cache:
                    try:
                        value = await store.get(var_entry, key=cache_key, raise_for_missing=True)
                        eng_logger.debug(
                            f'DerivedVariable {_uid_short}',
                            'retrieved value from cache',
                            {'uid': var_entry.uid, 'cached_value': value},
                        )
                    except KeyError:
                        eng_logger.debug(
                            f'DerivedVariable {_uid_short}',
                            'no value found in cache',
                            {'uid': var_entry.uid},
                        )
                        # key error means no entry found;
                        # this lets us distinguish from a None value stored and not found

                # If it's a PendingTask then return that task so it can be awaited later by a MetaTask
                if isinstance(value, PendingTask):
                    eng_logger.info(
                        f'DerivedVariable {_uid_short} waiting for pending task',
                        {'uid': var_entry.uid, 'pending_task': value.task_id},
                    )
                    return {'cache_key': cache_key, 'value': value}

                # We retrieved an actual value from the cache, return it
                if not ignore_cache and value is not VALUE_MISSING:
                    eng_logger.info(
                        f'DerivedVariable {_uid_short} returning cached value directly',
                        {'uid': var_entry.uid, 'cached_value': value},
                    )
                    return {'cache_key': cache_key, 'value': value}

                # Setup pending task if it needs it and then return the task
                if var_entry.run_as_task or has_tasks:
                    var_uid = var_entry.uid or str(uuid.uuid4())

                    if has_tasks:
                        task_id = f'{var_uid}_MetaTask_{str(uuid.uuid4())}'

                        extra_notify_channels = [
                            channel
                            for arg in parsed_args
                            if isinstance(arg, BaseTask)
                            for channel in arg.notify_channels
                        ]
                        eng_logger.debug(
                            f'DerivedVariable {_uid_short}',
                            'running has tasks',
                            {'uid': var_entry.uid, 'task_id': task_id},
                        )
                        meta_task = MetaTask(
                            var_entry.func,
                            parsed_args,
                            notify_channels=list(set(extra_notify_channels)),
                            process_as_task=var_entry.run_as_task,
                            cache_key=cache_key,
                            task_id=task_id,
                            reg_entry=var_entry,  # task results are set as the DV result
                        )

                        # Immediately store the pending task in the store
                        pending_task = task_mgr.register_task(meta_task)
                        await store.set(var_entry, key=cache_key, value=pending_task, pin=_pin_result)

                        return {'cache_key': cache_key, 'value': meta_task}

                    task_id = f'{var_uid}_Task_{str(uuid.uuid4())}'

                    eng_logger.debug(
                        f'DerivedVariable {_uid_short}',
                        'running as a task',
                        {'uid': var_entry.uid, 'task_id': task_id},
                    )
                    task = Task(
                        var_entry.func,
                        parsed_args,
                        cache_key=cache_key,
                        task_id=task_id,
                        reg_entry=var_entry,  # task results are set as the DV result
                    )

                    # Immediately store the pending task in the store
                    pending_task = task_mgr.register_task(task)
                    await store.set(var_entry, key=cache_key, value=pending_task, pin=_pin_result)

                    return {'cache_key': cache_key, 'value': task}

                try:
                    result = await run_user_handler(var_entry.func, args=parsed_args)
                except Exception:
                    # Delete the store value so subsequent requests recalculate instaed
                    if var_entry.cache is not None:
                        await store.delete(var_entry, key=cache_key)
                    raise

                # If a task is returned then ensure we register it
                if isinstance(result, BaseTask):
                    eng_logger.info(
                        f'DerivedVariable {_uid_short} returning task as a result',
                        {'uid': var_entry.uid, 'task_id': result.task_id},
                    )
                    # Make sure cache settings are set on the task
                    result.cache_key = cache_key
                    result.reg_entry = var_entry

                    task_mgr.register_task(result)

                    return {'cache_key': cache_key, 'value': result}

                # only set the value if cache is not None, otherwise subsequent requests calculate the value again
                if var_entry.cache is not None:
                    await store.set(var_entry, key=cache_key, value=result, pin=_pin_result)

                eng_logger.info(
                    f'DerivedVariable {_uid_short} returning result',
                    {'uid': var_entry.uid, 'result': result},
                )
                return {'cache_key': cache_key, 'value': result}

    @classmethod
    async def _filter_data(
        cls,
        data: Union[DataFrame, Any, None],
        filter_resolver: FilterResolver,
        filters: Optional[FilterQuery] = None,
        pagination: Optional[Pagination] = None,
    ) -> DataResponse:
        if data is None:
            return DataResponse(data=None, count=0, schema=None)

        # silently add the index column for DataFrame values
        # User resolver could technically not be returning a DataFrame
        if isinstance(data, DataFrame):
            data = append_index(data)

        # Filtering part
        data, count = await filter_resolver(data, filters, pagination)
        return build_data_response(data, count)

    @classmethod
    async def get_tabular_data(
        cls,
        var_entry: DerivedVariableRegistryEntry,
        store: CacheStore,
        task_mgr: TaskManager,
        args: List[Any],
        force_key: Optional[str] = None,
        pagination: Optional[Pagination] = None,
        filters: Optional[FilterQuery] = None,
    ) -> Union[MetaTask, DataResponse]:
        """
        Get filtered tabular data from the underlying derived variable.

        Resolves the the DeriedVariable and runs filtering on the result,
        either using a custom filter_resolver or the default logic.
        """
        filter_resolver = var_entry.filter_resolver or default_filter_resolver
        result = await cls.get_value(var_entry, store, task_mgr, args, force_key)

        if isinstance(result['value'], BaseTask):
            task_id = f'{var_entry.uid}_Filter_MetaTask_{str(uuid.uuid4())}'
            task = MetaTask(
                cls._filter_data,
                task_id=task_id,
                kwargs={
                    'data': result['value'],
                    'filters': filters,
                    'pagination': pagination,
                    'filter_resolver': filter_resolver,
                },
            )
            task_mgr.register_task(task)
            return task

        return await cls._filter_data(result['value'], filter_resolver, filters, pagination)

    @classmethod
    def check_polling(cls, variables: List[AnyVariable]):
        for variable in variables:
            if isinstance(variable, DerivedVariable) and (
                variable.polling_interval or cls.check_polling(variables=variable.variables)
            ):
                return True
        return False

    @model_serializer(mode='wrap')
    def ser_model(self, nxt: SerializerFunctionWrapHandler) -> dict:
        parent_dict = nxt(self)
        return {
            **parent_dict,
            '__typename': 'DerivedVariable',
            'uid': str(parent_dict['uid']),
        }


class DerivedVariableRegistryEntry(CachedRegistryEntry):
    deps: Optional[List[int]]
    func: Optional[Callable[..., Any]]
    filter_resolver: Optional[FilterResolver]
    run_as_task: bool
    variables: List[AnyVariable]
    polling_interval: Optional[int]
    get_value: Callable[..., Awaitable[Any]]
    """Handler to get the value of the derived variable. Defaults to DerivedVariable.get_value, should match the signature"""
    get_tabular_data: Callable[..., Awaitable[Union[DataResponse, MetaTask]]]
    """Handler to get the tabular data of the derived variable. Defaults to DerivedVariable.get_tabular_data, should match the signature"""
    model_config = ConfigDict(extra='forbid', arbitrary_types_allowed=True)


class LatestValueRegistryEntry(CachedRegistryEntry):
    pass
