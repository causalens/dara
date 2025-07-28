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
from collections.abc import Mapping
from contextvars import ContextVar
from typing import Any, Callable, Optional, Union

import anyio

from dara.core.base_definitions import ActionResolverDef, BaseTask
from dara.core.interactivity.actions import (
    ACTION_CONTEXT,
    BOUND_PREFIX,
    ActionCtx,
    ActionImpl,
)
from dara.core.internal.cache_store import CacheStore
from dara.core.internal.dependency_resolution import resolve_dependency
from dara.core.internal.encoder_registry import deserialize
from dara.core.internal.tasks import MetaTask, TaskManager
from dara.core.internal.utils import run_user_handler
from dara.core.internal.websocket import WebsocketManager
from dara.core.logging import dev_logger

CURRENT_ACTION_ID = ContextVar('current_action_id', default='')


async def _execute_action(handler: Callable, ctx: ActionCtx, values: Mapping[str, Any]):
    """
    Execute the action handler within the given action context, handling any exceptions that occur.

    :param handler: the action handler to execute
    :param ctx: the action context to use
    :param values: the resolved values to pass to the handler
    """
    bound_arg = None
    kwarg_names = list(values.keys())
    parsed_values = dict(values)
    for arg_name in kwarg_names:
        if arg_name.startswith(BOUND_PREFIX):
            bound_arg = parsed_values.pop(arg_name)
            break

    # If we found a bound arg, pass it as the first positional arg to the handler
    args = (
        (ctx,)
        if bound_arg is None
        else (
            bound_arg,
            ctx,
        )
    )

    try:
        return await run_user_handler(handler, args=args, kwargs=parsed_values)
    except Exception as e:
        dev_logger.error('Error executing action', e)
        await ctx.notify('An error occurred while executing the action', 'Error', 'ERROR')
    finally:
        await ctx._end_execution()


async def _stream_action(handler: Callable, ctx: ActionCtx, **values: Mapping[str, Any]):
    """
    Run the action handler and stream the results to the frontend.
    Executes two tasks in parallel:
    - The handler itself
    - A stream consumer which sends the results to the frontend

    :param handler: the action handler to execute
    :param ctx: the action context to use
    :param values: the resolved values to pass to the handler
    """
    try:
        async with anyio.create_task_group() as tg:
            # Execute the handler and a stream consumer in parallel
            tg.start_soon(_execute_action, handler, ctx, values)
            tg.start_soon(ctx._handle_results)
    finally:
        # None is treated as a sentinel value to stop waiting for new actions to come in on the client
        await ctx._on_action(None)


async def execute_action(
    action_def: ActionResolverDef,
    inp: Any,
    values: Mapping[str, Any],
    static_kwargs: Mapping[str, Any],
    execution_id: str,
    ws_channel: str,
    store: CacheStore,
    task_mgr: TaskManager,
) -> Union[Any, BaseTask]:
    """
    Execute a given action with the provided context.

    Resolves 'values' passed into an Action - DerivedVariables encountered are resolved into their values.
    If any of them are a Task/PendingTask, returns a MetaTask that can be awaited to retrieve the action.

    :param action_def: resolver definition
    :param inp: input to the action
    :param values: values from the frontend
    :param static_kwargs: mapping of var names to current values for static arguments
    :param execution_id: random execution id to differentiate between multiple executions of the same action
    :param uid: action instance uid
    :param ws_channel: websocket channel to send messages to
    :param store: the store instance to check for cached values
    :param task_mgr: the task manager instance to use for running tasks
    """
    from dara.core.internal.registries import utils_registry

    ws_mgr: WebsocketManager = utils_registry.get('WebsocketManager')

    action = action_def.resolver
    assert action is not None, 'Action resolver must be defined'

    # Construct a context which handles action messages by sending them to the frontend
    async def handle_action(act_impl: Optional[ActionImpl]):
        await ws_mgr.send_message(ws_channel, {'action': act_impl, 'uid': execution_id})

    ctx = ActionCtx(inp, handle_action)
    ACTION_CONTEXT.set(ctx)

    resolved_kwargs = {}

    if values is not None:
        annotations = action.__annotations__

        async def _resolve_kwarg(val: Any, key: str):
            typ = annotations.get(key)
            val = await resolve_dependency(val, store, task_mgr)
            resolved_kwargs[key] = deserialize(val, typ)

        async with anyio.create_task_group() as tg:
            for key, value in values.items():
                tg.start_soon(_resolve_kwarg, value, key)

    # Merge resolved dynamic kwargs with static kwargs received
    resolved_kwargs = {**resolved_kwargs, **static_kwargs}

    # Check if there are any Tasks to be run in the args
    has_tasks = any(isinstance(extra, BaseTask) for extra in resolved_kwargs.values())

    if has_tasks:
        notify_channels = list(
            set(
                [
                    channel
                    for extra in resolved_kwargs
                    if isinstance(extra, BaseTask)
                    for channel in extra.notify_channels
                ]
            )
        )
        dev_logger.debug(
            'Action returning a meta task (because `extras` included one or more `DerivedVariable`s with `run_as_task`)'
        )

        # Note: no associated registry entry, the result are not persisted in cache
        # Return a metatask which, when all dependencies are ready, will stream the action results to the frontend
        meta_task = MetaTask(
            process_result=_stream_action, args=[action, ctx], kwargs=resolved_kwargs, notify_channels=notify_channels
        )
        task_mgr.register_task(meta_task)
        return meta_task

    # No tasks - run directly as an asyncio task and return the execution id
    # Originally used to use FastAPI BackgroundTasks, but these ended up causing a blocking behavior that blocked some
    # new requests from being handled until the task had ended
    asyncio.create_task(_stream_action(action, ctx, **resolved_kwargs))
    return execution_id
