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

from contextvars import ContextVar
from datetime import datetime
from typing import TYPE_CHECKING, Any, Callable, Mapping, Optional, Union
import uuid
import anyio

from dara.core.base_definitions import ActionResolverDef, BaseTask
from dara.core.internal.encoder_registry import deserialize
from dara.core.internal.cache_store import CacheStore
from dara.core.internal.dependency_resolution import (
    is_resolved_derived_data_variable,
    is_resolved_derived_variable,
    resolve_dependency,
)
from dara.core.internal.tasks import MetaTask, TaskManager
from dara.core.internal.utils import run_user_handler
from dara.core.internal.websocket import WebsocketManager
from dara.core.logging import dev_logger
from fastapi import BackgroundTasks

from dara.core.interactivity.actions import ACTION_CONTEXT, ActionContext, ActionImpl

CURRENT_ACTION_ID = ContextVar('current_action_id', default='')

async def _execute_action(handler: Callable, ctx: ActionContext, values: Mapping[str, Any]):
    try:
        await run_user_handler(handler, args=(ctx, ), kwargs=dict(values))
    except Exception as e:
        import traceback

        traceback.print_exc()
        # TODO: handle error, send to frontend
    finally:
        await ctx.__end_execution()


async def _stream_action(handler: Callable, ctx: ActionContext, values: Mapping[str, Any]):
    try:
        async with anyio.create_task_group() as tg:
            # Execute the handler and a stream consumer in parallel
            tg.start_soon(_execute_action, handler, ctx, values)
            tg.start_soon(ctx.__handle_results)
    except Exception as e:
        import traceback

        traceback.print_exc()
    finally:
        await ctx.__on_action(None)

async def execute_action(
    action_def: ActionResolverDef,
    inp: Any,
    values: Mapping[str, Any],
    static_kwargs: Mapping[str, Any],
    execution_id: str,
    ws_channel: str,
    store: CacheStore,
    task_mgr: TaskManager,
    background_tasks: BackgroundTasks
) -> Union[Any, BaseTask]:
    """
    Execute a given action with the provided context.

    # !Resolves 'extras' passed into an Action - DerivedVariables encountered are resolved into their values.
    # !If any of them are a Task/PendingTask, returns a MetaTask that can be awaited to retrieve the action.

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
        print('Sending:', act_impl)
        await ws_mgr.send_message(ws_channel, {'action': act_impl, 'uid': execution_id})

    ctx = ActionContext(inp, handle_action)
    ACTION_CONTEXT.set(ctx)

    resolved_kwargs = {}

    if values is not None:
        annotations = action.__annotations__

        for key, value in values.items():
            # Override `force` property to be false
            if is_resolved_derived_variable(value) or is_resolved_derived_data_variable(value):
                value['force'] = False

            typ = annotations.get(key)
            val = await resolve_dependency(value, store, task_mgr)
            resolved_kwargs[key] = deserialize(val, typ)

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
        await task_mgr.run_task(
            MetaTask(
                process_result=_stream_action,
                args=[action, ctx, resolved_kwargs],
                notify_channels=notify_channels
            )
        )
        return execution_id


    # No tasks - run directly as bg task and return execution id
    background_tasks.add_task(_stream_action, action, ctx, resolved_kwargs)
    return execution_id
