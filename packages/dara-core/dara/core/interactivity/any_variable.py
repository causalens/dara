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

import abc
import inspect
import uuid
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime
from typing import Any, Callable, Dict, Optional, Set

import anyio
from fastapi.encoders import jsonable_encoder
from pydantic import ConfigDict

from dara.core.auth.definitions import SESSION_ID, USER, UserData
from dara.core.base_definitions import BaseTask, PendingTask
from dara.core.base_definitions import DaraBaseModel as BaseModel
from dara.core.interactivity.condition import Condition, Operator
from dara.core.internal.cache_store import CacheStore
from dara.core.internal.tasks import TaskManager
from dara.core.internal.websocket import WS_CHANNEL, WebsocketManager
from dara.core.logging import dev_logger

NOT_REGISTERED = '__NOT_REGISTERED__'

GET_VALUE_OVERRIDE = ContextVar[Optional[Callable[[dict], Any]]]('GET_VALUE_OVERRIDE', default=None)
"""
Optional context variable which can be used to override the default behaviour of `get_current_value()`.
"""


async def get_current_value(variable: dict, timeout: float = 3, raw: bool = False) -> Any:
    """
    Retrieve the current value of the variable for the current user

    Only works in a context where Dara can infer the user to get the value for:
    - inside variable/action/py_component handlers
    - anywhere when using single-user basic auth config, assumes we're asking for the current value for that single user

    :param variable: dict representation of the variable
    :param timeout: time to wait for a value before raising a TimeoutError
    :param raw: whether to return the raw result
    """
    getter_override = GET_VALUE_OVERRIDE.get()
    if getter_override is not None:
        result = getter_override(variable)

        if inspect.iscoroutine(result):
            return await result

        return result

    from dara.core.internal.dependency_resolution import resolve_dependency
    from dara.core.internal.registries import (
        auth_registry,
        pending_tokens_registry,
        sessions_registry,
        utils_registry,
        websocket_registry,
    )

    ws_mgr: WebsocketManager = utils_registry.get('WebsocketManager')
    store: CacheStore = utils_registry.get('Store')
    task_mgr: TaskManager = utils_registry.get('TaskManager')

    auth_config = auth_registry.get('auth_config')
    current_user = USER.get()
    current_session = SESSION_ID.get()

    # Wait until there are no more pending tokens in the registry
    with anyio.fail_after(10):
        while len(pending_tokens_registry.get_all()) > 0:
            # Clean up expired tokens
            pending_tokens = list(pending_tokens_registry.get_all().items())
            time_now = datetime.now()
            for pending_token, exp in pending_tokens:
                # If expired, remove
                if exp < time_now:
                    pending_tokens_registry.remove(pending_token)
            await anyio.sleep(0.5)

    @contextmanager
    def restore_contexts():
        """Makes sure to clean up temporary changes to the context vars"""
        try:
            yield
        finally:
            USER.set(current_user)
            SESSION_ID.set(current_session)

    with restore_contexts():
        from dara.core.auth.basic import BasicAuthConfig

        user_identity = None

        if current_user is not None:
            user_identity = current_user.identity_id
        elif isinstance(auth_config, BasicAuthConfig):
            # basic auth - assume it's the single existing user
            user_identity = list(auth_config.users.keys())[0]
            USER.set(UserData(identity_name=user_identity))

        # If still couldn't find user, warn and return
        if user_identity is None:
            dev_logger.warning(
                f'No value available for {variable["__typename"]} {variable["uid"]} because currently logged in user '
                'could not be determined. This might mean that `get_current_value()` was executed outside of user-specific context. '
                "Retrieving variable's value is only possible when Dara can determine the currently logged in user, i.e. inside a DerivedVariable function, "
                'an action handler, inside a @py_components or when using single-user basic auth mode.'
            )
            return None

        try:
            session_ids = sessions_registry.get(user_identity)
        except KeyError:
            dev_logger.warning(
                f'No value available for {variable["__typename"]} {variable["uid"]} because no active session was found for user {user_identity}'
            )
            return None

        session_channels: Dict[str, Set[str]] = {}
        saved_ws_channel = WS_CHANNEL.get()

        # Collect sessions which are active
        for sid in session_ids:
            if websocket_registry.has(sid):
                ws_channels = websocket_registry.get(sid)
                # If saved websocket channel is not none, then only save the session of that channel
                if saved_ws_channel is not None and saved_ws_channel in ws_channels:
                    session_channels[sid] = {saved_ws_channel}
                else:
                    session_channels[sid] = ws_channels

        if len(session_channels) == 0:
            dev_logger.warning(
                f'No value available for {variable["__typename"]} {variable["uid"]} because no active session was found for user {user_identity}'
            )
            return None

        raw_results: Dict[str, Any] = {}
        registered_value_found = False

        async def retrieve_value(channel: str):
            nonlocal registered_value_found
            try:
                sentinel = object()
                raw_result = sentinel

                def is_valid(x):
                    return x not in (sentinel, NOT_REGISTERED)

                # Try once
                with anyio.move_on_after(timeout):
                    raw_result = await ws_mgr.send_and_wait(channel, {'variable': variable})

                    if is_valid(raw_result):
                        registered_value_found = True

                # Then if the value is not registered, try again a few times if another session did not already find a value
                max_retry = 5
                retry_count = 0
                while retry_count < max_retry and not is_valid(raw_result) and not registered_value_found:
                    await anyio.sleep(0.25 + (retry_count))
                    retry_count += 1

                    # Attempt to retrieve the value
                    with anyio.move_on_after(timeout):
                        raw_result = await ws_mgr.send_and_wait(channel, {'variable': variable})

                        if is_valid(raw_result):
                            registered_value_found = True

                if raw_result == sentinel:
                    raise TimeoutError(f'Timed out waiting for value for channel {channel}')

                raw_results[channel] = raw_result
            except BaseException as e:
                raw_results[channel] = e

        async with anyio.create_task_group() as tg:
            for channels in session_channels.values():
                for chan in channels:
                    tg.start_soon(retrieve_value, chan)

        results = {}

        for session, channels in session_channels.items():
            for ws in channels:
                raw_result = raw_results[ws]
                # Skip values from clients where the variable is not registered
                if raw_result == NOT_REGISTERED:
                    continue

                # If returning raw results, skip resolving at this point
                if raw:
                    results[ws] = raw_result
                    continue

                # Impersonate the session so session-based caching works correctly
                SESSION_ID.set(session)

                result = await resolve_dependency(raw_result, store, task_mgr)

                # If the result is some kind of a task, we need to run it and wait for the result
                if isinstance(result, BaseTask):
                    result = await task_mgr.run_task(result)
                    if isinstance(result, PendingTask):
                        result = await result.run()

                results[ws] = result

        # In most cases, there should be one value only
        if len(results) == 1:
            return list(results.values())[0]

        # No results - just return None instead of empty dict
        if len(results) == 0:
            return None

        # If we're returning multiple values, in Jupyter environments print an explainer
        try:
            from IPython import get_ipython  # pyright: ignore[reportMissingImports]
        except ImportError:
            pass
        else:
            if get_ipython() is not None:
                from IPython.display import HTML, display  # pyright: ignore[reportMissingImports]

                display(
                    HTML(
                        """
                    <div>
                    <style>
                    #dara_multi_session_warning {
                        background-color: #fff8e6;
                        color: #4d3800;
                        padding: 1rem;
                    }
                    #dara_multi_session_warning > code {
                        background-color: #eeeeee;
                        color: rgba(0, 0, 0, 0.87);
                    }
                    </style>
                    <div id="dara_multi_session_warning">
                    Found multiple active sessions. This is likely because the Variable is used in multiple cells running simultaneously, thus this function will return an object of shape <code>{&lt;cell_session_id&gt;: &lt;value&gt;}</code>.
                    The other recommended approach is not to share Variables between cells. If you'd like to share a value between cells, extract the Variable value from the first cell using <code>get_current_value</code> then
                    create a new Variable with default set to the value from the first cell. Checkout out the <code>dara_jupyter</code> package documentation for more details.
                    </div>
                    </div>
                    """
                    )
                )
        return results


class AnyVariable(BaseModel, abc.ABC):  # noqa: PLW1641 # we override equals to create conditions, otherwise we should define hash
    """
    Base class for all variables. Used for typing to specify that any variable can be provided.
    """

    model_config = ConfigDict(arbitrary_types_allowed=True)

    uid: str

    def __init__(self, uid: Optional[str] = None, **kwargs) -> None:
        new_uid = uid
        if new_uid is None:
            new_uid = str(uuid.uuid4())

        super().__init__(uid=new_uid, **kwargs)

    def __eq__(self, value: Any) -> Condition:  # type: ignore
        return Condition(operator=Operator.EQUAL, other=value, variable=self)

    def __ne__(self, value: Any) -> Condition:  # type: ignore
        return Condition(operator=Operator.NOT_EQUAL, other=value, variable=self)

    def __ge__(self, value: Any) -> Condition:
        return Condition(operator=Operator.GREATER_EQUAL, other=value, variable=self)

    def __gt__(self, value: Any) -> Condition:
        return Condition(operator=Operator.GREATER_THAN, other=value, variable=self)

    def __le__(self, value: Any) -> Condition:
        return Condition(operator=Operator.LESS_EQUAL, other=value, variable=self)

    def __lt__(self, value: Any) -> Condition:
        return Condition(operator=Operator.LESS_THAN, other=value, variable=self)

    def reset(self):
        """
        Create an action to reset the value of this Variable to it's default value.

        For derived variables this will trigger the function to be re-run.

        ```python

        from dara.core import Variable
        from dara.components import Button

        counter = Variable(default=0)

        Button(
            'Reset',
            onclick=counter.reset(),
        )

        ```
        """
        from dara.core.interactivity.actions import ResetVariables, assert_no_context

        assert_no_context('ctx.reset')
        return ResetVariables(variables=[self])

    @classmethod
    def isinstance(cls, obj: Any) -> bool:
        return isinstance(obj, cls)

    async def get_current_value(self, timeout: float = 3) -> Any:
        """
        Retrieve the current value of the variable for the current user

        Only works in a context where Dara can infer the user to get the value for:
        - inside variable/action/py_component handlers
        - anywhere when using single-user basic auth config, assumes we're asking for the current value for that single user

        :param timeout: time to wait for a value before raising a TimeoutError
        """
        return await get_current_value(jsonable_encoder(self), timeout)
