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

import contextlib
import json
import uuid
from collections import OrderedDict
from collections.abc import Mapping
from contextvars import ContextVar
from functools import wraps
from inspect import Parameter, Signature, isclass, signature
from typing import (
    Any,
    Callable,
    ClassVar,
    Dict,
    Optional,
    Union,
    overload,
)

import anyio
from fastapi.encoders import jsonable_encoder

from dara.core.base_definitions import BaseTask
from dara.core.definitions import BaseFallback, ComponentInstance, PyComponentDef
from dara.core.interactivity import AnyVariable
from dara.core.interactivity.state_variable import StateVariable
from dara.core.internal.cache_store import CacheStore
from dara.core.internal.dependency_resolution import resolve_dependency
from dara.core.internal.encoder_registry import deserialize
from dara.core.internal.normalization import NormalizedPayload, normalize
from dara.core.internal.tasks import MetaTask, TaskManager
from dara.core.internal.utils import run_user_handler
from dara.core.logging import dev_logger, eng_logger
from dara.core.visual.components import InvalidComponent, RawString

CURRENT_COMPONENT_ID = ContextVar('current_component_id', default='')


class PyComponentInstance(ComponentInstance):
    func_name: str
    dynamic_kwargs: Optional[Mapping[str, AnyVariable]] = None
    polling_interval: Optional[int] = None
    js_module: ClassVar[Optional[str]] = None


# sync/async simple
@overload
def py_component(function: Callable) -> Callable[..., PyComponentInstance]: ...


# sync/async with args
@overload
def py_component(
    function: None = None,
    *,
    placeholder: Optional[Union[BaseFallback, ComponentInstance]] = None,
    fallback: Optional[Union[BaseFallback, ComponentInstance]] = None,
    track_progress: Optional[bool] = False,
    polling_interval: Optional[int] = None,
) -> Callable[[Callable], Callable[..., PyComponentInstance]]: ...


def py_component(
    function: Optional[Callable] = None,
    *,
    placeholder: Optional[Union[BaseFallback, ComponentInstance]] = None,
    fallback: Optional[Union[BaseFallback, ComponentInstance]] = None,
    track_progress: Optional[bool] = False,
    polling_interval: Optional[int] = None,
) -> Union[Callable[..., PyComponentInstance], Callable[[Callable], Callable[..., PyComponentInstance]]]:
    """
    A decorator that can be used to trigger a component function to be rerun whenever a give variable changes. It should be
    called with a list of Variables and will call the wrapped function with the current values of each.

    :param placeholder: a placeholder component to render whilst waiting for the component to be rendered. Deprecated, use fallback instead
    :param fallback: a fallback component to render in place of the actual UI if it has not finished loading
    :param track_progress: whether to show a ProgressTracker when there is a task running, takes precedence over fallback
    :param polling_interval: an optional polling interval for the component. Setting this will cause the component to
                             poll the backend and refresh itself every n seconds.
    """
    fallback_component = None

    if fallback:
        fallback_component = fallback
    elif placeholder:
        dev_logger.warning('The "placeholder" argument to @py_component is deprecated, use "fallback" instead')
        fallback_component = placeholder

    def _py_component(func: Callable) -> Callable[..., PyComponentInstance]:
        uid = uuid.uuid4()
        old_signature = signature(func)

        @wraps(func)
        def _inner_func(*args, **kwargs) -> PyComponentInstance:
            # Handle errors explicitly so they are clear for the end user
            min_args = len(
                list(filter(lambda param: param.default != Parameter.empty, old_signature.parameters.values()))
            )
            max_args = len(old_signature.parameters)
            passed_args = len(args) + len(kwargs)
            if passed_args < min_args or passed_args > max_args:
                raise TypeError(
                    f'Expected {len(old_signature.parameters)} arguments, but received {len(args) + len(kwargs)}'
                )

            # Register the component here, if it hasn't already been, in case dynamic args are provided.
            from dara.core.internal.registries import (
                component_registry,
                static_kwargs_registry,
            )

            try:
                component_registry.get(str(uid))
            except KeyError:
                eng_logger.info(f'Registering py_component "{func.__name__}"')
                py_comp = PyComponentDef(
                    func=func,
                    name=str(uid),
                    dynamic_kwargs={},
                    fallback=fallback_component,
                    polling_interval=polling_interval,
                    render_component=render_component,
                )
                component_registry.register(str(uid), py_comp)

            # Create kwargs for every argument based on the function signature and then split them into dynamic vs static
            all_kwargs = {**kwargs}
            for idx, param in enumerate(old_signature.parameters.values()):
                if idx >= len(args):
                    # If it was passed as a kwarg already then skip this
                    if param.name in all_kwargs:
                        continue
                    if param.default == Parameter.empty:
                        raise TypeError(f'Expected positional argument: {param.name} to be passed, but it was not')
                    all_kwargs[param.name] = param.default
                else:
                    all_kwargs[param.name] = args[idx]

            # Verify types are correct
            for key, value in all_kwargs.items():
                if key in func.__annotations__:
                    valid_value = True
                    # The type is either not set or something tricky to verify, e.g. union
                    with contextlib.suppress(Exception):
                        valid_value = isinstance(value, (func.__annotations__[key], AnyVariable))
                    if not valid_value:
                        raise TypeError(
                            f'Argument: {key} was passed as a {type(value)}, but it should be '
                            f'{func.__annotations__[key]}, or a Variable instance'
                        )

            # Split args based on whether they are static or dynamic
            dynamic_kwargs: Dict[str, AnyVariable] = {}
            static_kwargs: Dict[str, Any] = {}
            for key, kwarg in all_kwargs.items():
                if isinstance(kwarg, StateVariable):
                    raise ValueError(
                        'StateVariable cannot be used as input to py_component. '
                        'StateVariables are internal variables for tracking DerivedVariable client state and using them as inputs would create complex dependencies that are '
                        'difficult to debug. Consider using the StateVariable with an If component or SwitchVariable.'
                    )
                if isinstance(kwarg, AnyVariable):
                    dynamic_kwargs[key] = kwarg
                else:
                    static_kwargs[key] = kwarg

            instance_uid = str(uuid.uuid4())

            # Store the static_kwargs in a registry
            static_kwargs_registry.register(instance_uid, static_kwargs)

            # Returning a PyComponentInstance with dynamic and static args
            instance_cls = type(str(uid), (PyComponentInstance,), {})
            return instance_cls(
                func_name=func.__name__,
                dynamic_kwargs=dynamic_kwargs,
                fallback=fallback_component,
                polling_interval=polling_interval,
                uid=instance_uid,
                track_progress=track_progress,
            )

        # Alter the signature to show that Variables can be passed in
        new_annotations = {}
        params = OrderedDict()
        for var_name, typ in func.__annotations__.items():
            if isclass(typ):
                new_type = Union[typ, AnyVariable]
                if old_signature.parameters.get(var_name) is not None:
                    params[var_name] = old_signature.parameters[var_name].replace(annotation=new_type)
                new_annotations[var_name] = new_type

        _inner_func.__signature__ = Signature(  # type: ignore
            parameters=list(params.values()), return_annotation=old_signature.return_annotation
        )
        _inner_func.__wrapped_by__ = py_component  # type: ignore
        return _inner_func  # type: ignore

    # If decorator is called with no optional argument then the function is passed as first argument
    if function:
        return _py_component(function)

    # If decorator is called with the optional arguments then function is None and a function (_py_component)
    # that decorates is returned
    return _py_component


async def render_component(
    definition: PyComponentDef,
    store: CacheStore,
    task_mgr: TaskManager,
    values: Mapping[str, Any],
    static_kwargs: Mapping[str, Any],
):
    """
    With the passed dynamic arguments, call the underlying function for this pycomponent and return the result to be
    send back to the ui. Accounts for DerivedVariable instances automatically.

    :param store: the store instance to use for caching
    :param task_mgr: the task manager instance for running any tasks
    :param values: mapping of var names to current values for dynamic arguments
    :param static_kwargs: mapping of var names to current values for static arguments
    """
    assert definition.func is not None, 'PyComponent must have a function defined'

    eng_logger.info(
        f'PyComponent {definition.func.__name__} rendering',
        {'uid': definition.name, 'values': values, 'static_kwargs': static_kwargs},
    )

    renderer = _make_render_safe(definition.func)

    if values is not None:
        annotations = definition.func.__annotations__
        resolved_dyn_kwargs = {}

        async def _resolve_kwarg(val: Any, key: str):
            val = await resolve_dependency(val, store, task_mgr)
            typ = annotations.get(key)
            resolved_dyn_kwargs[key] = deserialize(val, typ)

        async with anyio.create_task_group() as tg:
            for key, value in values.items():
                tg.start_soon(_resolve_kwarg, value, key)

        # Merge resolved dynamic kwargs with static kwargs received
        resolved_kwargs = {**resolved_dyn_kwargs, **static_kwargs}

        dev_logger.debug(
            f'PyComponent {definition.func.__name__}', 'rendering', {'uid': definition.name, 'kwargs': resolved_kwargs}
        )

        # Check if there are any Tasks to be run in the args
        has_tasks = any(isinstance(arg, BaseTask) for arg in resolved_kwargs.values())

        # If this has sub tasks then create a meta task for the result and bubble it up
        if has_tasks:
            notify_channels = list(
                set(
                    [
                        channel
                        for kwarg in resolved_kwargs.values()
                        if isinstance(kwarg, BaseTask)
                        for channel in kwarg.notify_channels
                    ]
                )
            )
            # Note: no associated registry entry, the result are not persisted in cache
            task = MetaTask(
                renderer,
                kwargs=resolved_kwargs,
                notify_channels=notify_channels,
                task_id=f'{definition.func.__name__}_{definition.name}_{str(uuid.uuid4())}',
            )

            eng_logger.info(
                f'PyComponent {definition.func.__name__} returning task', {'uid': definition.name, 'task_id': task}
            )
            task_mgr.register_task(task)

            return task

        result = await renderer(**resolved_kwargs)

        eng_logger.info(
            f'PyComponent {definition.func.__name__} returning result', {'uid': definition.name, 'result': result}
        )

        return result

    return await renderer()


def _make_render_safe(handler: Callable):
    """
    Wrap the handler in a check to make sure a ComponentInstance is rendered

    :param handler: the user handler to wrap
    """

    async def _render_safe(**kwargs: Dict[str, Any]) -> NormalizedPayload[Optional[ComponentInstance]]:
        result = await run_user_handler(handler, kwargs=kwargs)
        safe_result: Optional[ComponentInstance] = None

        if result is None:
            safe_result = None
        elif isinstance(result, (str, float, int, bool)):
            # If it is ComponentInstance string(string start with '__dara__')
            if isinstance(result, str) and result.startswith('__dara__'):
                safe_result = json.loads(result[8:])

            # Handle primitives being returned by just displaying the value as a string
            safe_result = RawString(content=str(result))
        elif not ComponentInstance.isinstance(result):
            # Otherwise it must be a component instance, return the error for frontend to display
            safe_result = InvalidComponent(
                error=f'PyComponent "{handler.__name__}" did not return a ComponentInstance, found "{result}"'
            )
        else:
            safe_result = result

        normalized_data, normalized_lookup = normalize(jsonable_encoder(safe_result))
        return NormalizedPayload(data=normalized_data, lookup=normalized_lookup)

    return _render_safe
