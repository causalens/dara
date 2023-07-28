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

from typing import Any, Callable, Union

from dara.core.base_definitions import BaseTask
from dara.core.interactivity import ActionContext, ActionInputs
from dara.core.internal.dependency_resolution import (
    is_resolved_derived_data_variable,
    is_resolved_derived_variable,
    resolve_dependency,
)
from dara.core.internal.store import Store
from dara.core.internal.tasks import MetaTask, TaskManager
from dara.core.internal.utils import run_user_handler
from dara.core.logging import dev_logger


async def execute_action(
    action: Callable,
    ctx: ActionContext,
    store: Store,
    task_mgr: TaskManager,
) -> Union[Any, BaseTask]:
    """
    Execute a given action with the provided value and extras.

    Resolves 'extras' passed into an Action - DerivedVariables encountered are resolved into their values.
    If any of them are a Task/PendingTask, returns a MetaTask that can be awaited to retrieve the action.

    :param action: callable to execute with provided values
    :param inputs: action inputs to pass into callable
    :param store: the store instance to check for cached values
    :param extras: extras to resolve and pass into callable
    """
    resolved_extras = []

    if ctx.inputs is not None:
        resolved_inputs = {}

        # Resolve each input, in case it is a ResolvedDataVariable
        for input_name, input_value in ctx.inputs:
            resolved_input_value = await resolve_dependency(input_value, store, task_mgr)
            assert not isinstance(resolved_input_value, BaseTask), 'Action inputs cannot be tasks'
            resolved_inputs[input_name] = resolved_input_value

        ctx.inputs = ActionInputs(**resolved_inputs)

    if ctx.extras is not None:
        for extra in ctx.extras:
            # Override `force` property to be false
            if is_resolved_derived_variable(extra) or is_resolved_derived_data_variable(extra):
                extra['force'] = False

            extra_value = await resolve_dependency(extra, store, task_mgr)
            resolved_extras.append(extra_value)

        ctx.extras = resolved_extras
        # If any tasks were encountered, create a MetaTask to wrap them
        has_tasks = any(isinstance(extra, BaseTask) for extra in resolved_extras)
        if has_tasks:
            notify_channels = list(
                set(
                    [
                        channel
                        for extra in resolved_extras
                        if isinstance(extra, BaseTask)
                        for channel in extra.notify_channels
                    ]
                )
            )
            dev_logger.debug(
                'Action returning a meta task (because `extras` included one or more `DerivedVariable`s with `run_as_task`)'
            )

            return MetaTask(action, [ctx], notify_channels=notify_channels)

    # No tasks - run directly
    return await run_user_handler(action, [ctx])
