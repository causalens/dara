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
import inspect
import os
from collections.abc import Awaitable, Coroutine, Sequence
from functools import wraps
from importlib import import_module
from importlib.util import find_spec
from types import ModuleType
from typing import (
    TYPE_CHECKING,
    Any,
    Callable,
    Dict,
    Literal,
    Optional,
    Tuple,
    Type,
    TypeVar,
    Union,
)

import anyio
from anyio import from_thread
from exceptiongroup import BaseExceptionGroup, ExceptionGroup
from starlette.concurrency import run_in_threadpool
from typing_extensions import ParamSpec

from dara.core.auth.definitions import SESSION_ID, USER
from dara.core.base_definitions import CacheType
from dara.core.internal.devtools import handle_system_exit
from dara.core.logging import dev_logger

if TYPE_CHECKING:
    from dara.core.configuration import ConfigurationBuilder


# CacheScope stores as a key an user if cache is set to users, a session_id if cache is sessions or is set to 'global' otherwise
# The value is a cache_key, for example the cache key used to store derived variable results to the store
CacheScope = Union[Literal['global'], str]


def get_cache_scope(cache_type: Optional[CacheType]) -> CacheScope:
    """
    Helper to resolve the cache scope

    :param cache_type: whether to pull the value from the specified cache specific store or the global one, defaults to
                        the global one
    """

    if cache_type == CacheType.USER:
        user = USER.get()
        if user is not None:
            user_key = user.identity_id if user.identity_id else user.identity_name
            return user_key
        dev_logger.debug('Auth not enabled when cache_type flag was set to user, defaulting to global store')
    if cache_type == CacheType.SESSION:
        session_key = SESSION_ID.get()
        if session_key is not None:
            return session_key
        dev_logger.debug('Session key not found when cache_type flag was set to session, defaulting to global store')
    return 'global'


async def run_user_handler(handler: Callable, args: Union[Sequence, None] = None, kwargs: Union[dict, None] = None):
    """
    Run a user-defined handler function. Runs sync functions in a threadpool.
    Handles SystemExits cleanly.

    :param handler: user-defined handler function
    :param args: list of arguments to pass to the function
    :param kwargs: dict of kwargs to past to the function
    """
    if args is None:
        args = []
    if kwargs is None:
        kwargs = {}
    with handle_system_exit('User defined function quit unexpectedly'):
        if inspect.iscoroutinefunction(handler):
            return await handler(*args, **kwargs)
        else:
            return await run_in_threadpool(handler, *args, **kwargs)


def call_async(handler: Callable[..., Coroutine], *args):
    """
    Run an async function from a sync context.

    :param handler: async function to run
    :param args: arguments to pass to the function
    """
    try:
        # Check if there's a loop running
        asyncio.get_running_loop()

        # Just spawn the task directly in the loop
        asyncio.create_task(handler(*args))
    except RuntimeError:
        try:
            # We might be in an anyio worker thread without an event loop, so try using the from_thread.run API
            from_thread.run(handler, *args)
        except RuntimeError:
            # Fallback - we're in an external thread without an event loop, so we need to use a blocking portal
            with from_thread.start_blocking_portal() as portal:
                portal.call(handler, *args)


def import_config(config_path: str) -> Tuple[ModuleType, ConfigurationBuilder]:
    """
    Import Dara from specified config in format "my_package.my_module:variable_name"
    """
    try:
        module_path, obj = config_path.rsplit(':', 1)
        module = import_module(module_path)
        return (module, getattr(module, obj))
    except BaseException as e:
        raise ImportError(
            f'We could not import your configuration from here: {config_path}. There might be an error in the stacktrace above. \nOtherwise it'
            ' likely means you are using a non-standard location and need to pass the --config location directly. \nIf Dara is still failing to'
            ' resolve your module, make sure your package is installed and accessible in the current virtual environment; \n'
            ' as a last resort, try reactivating/recreating the venv.'
        ) from e


def find_module_path(config_path: str):
    """
    Find the parent path to the module containing the config file wihout importing it.
    """
    module_name = config_path.split(':')[0]
    module_spec = find_spec(module_name)

    if module_spec is None:
        raise ImportError(f'Module {module_name} not found')

    # If the module has an origin, use it to get the parent directory
    if module_spec.origin:
        module_path = os.path.dirname(module_spec.origin)
    # If the module is a namespace package, use the submodule search locations
    elif module_spec.submodule_search_locations:
        module_path = os.path.commonpath(module_spec.submodule_search_locations)
    else:
        raise ImportError(f'Module {module_name} cannot be found or does not have a valid origin')

    return module_path


def enforce_sso(conf: ConfigurationBuilder):
    """
    Checks if given configuration has SSO enabled.

    Raises if SSO is not used
    """
    try:
        from dara.enterprise import SSOAuthConfig  # pyright: ignore[reportMissingImports]

        if conf.auth_config is None or not isinstance(conf.auth_config, SSOAuthConfig):
            raise ValueError('Config does not have SSO auth enabled. Please update your application to configure SSO.')
    except ImportError as err:
        raise ValueError(
            'SSO is not enabled. Please install the dara_enterprise package and configure SSO to use this feature.'
        ) from err


P = ParamSpec('P')
T = TypeVar('T')


def async_dedupe(fn: Callable[P, Awaitable[T]]) -> Callable[P, Awaitable[T]]:
    """
    Decorator to deduplicate concurrent calls to asynchronous functions based on their arguments.

    If multiple concurrent calls are made with the same arguments, the function is executed
    only once. Subsequent calls will wait for the first one to complete and then return
    its result.

    This decorator is useful for operations that might be triggered multiple times in parallel
    but should be executed only once to prevent redundant work or data fetches.
    """
    locks: Dict[Tuple, anyio.Lock] = {}
    results: Dict[Tuple, Any] = {}
    wait_counts: Dict[Tuple, int] = {}

    is_method = 'self' in inspect.signature(fn).parameters

    @wraps(fn)
    async def wrapped(*args: P.args, **kwargs: P.kwargs) -> T:
        non_self_args = args[1:] if is_method else args
        key = (non_self_args, frozenset(kwargs.items()))
        lock = locks.get(key)

        if not lock:
            lock = anyio.Lock()
            locks[key] = lock
            wait_counts[key] = 1
        else:
            wait_counts[key] += 1

        async with lock:
            if key not in results:
                results[key] = await fn(*args, **kwargs)
            result = results[key]

            # Decrement wait count
            wait_counts[key] -= 1
            # Cleanup the lock and result if no other tasks are waiting for this key
            if wait_counts[key] == 0:
                locks.pop(key, None)
                results.pop(key, None)
                wait_counts.pop(key, None)

        return result

    return wrapped


def resolve_exception_group(error: Any):
    """
    Simplify an ExceptionGroup to a single exception if possible

    :param error: The error to resolve
    """
    if isinstance(error, ExceptionGroup) and len(error.exceptions) == 1:
        return resolve_exception_group(error.exceptions[0])

    return error


def exception_group_contains(err_type: Type[BaseException], group: BaseExceptionGroup) -> bool:
    """
    Check if an ExceptionGroup contains an error of a given type, recursively

    :param err_type: The type of error to check for
    :param group: The ExceptionGroup to check
    """
    for exc in group.exceptions:
        if isinstance(exc, err_type):
            return True
        if isinstance(exc, BaseExceptionGroup):
            return exception_group_contains(err_type, exc)
    return False
