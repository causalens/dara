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

import inspect
from importlib import import_module
from types import ModuleType
from typing import TYPE_CHECKING, Callable, Literal, Optional, Sequence, Tuple, Union

from starlette.concurrency import run_in_threadpool

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


async def run_user_handler(handler: Callable, args: Sequence = [], kwargs: dict = {}):
    """
    Run a user-defined handler function. Runs sync functions in a threadpool.
    Handles SystemExits cleanly.

    :param handler: user-defined handler function
    :param args: list of arguments to pass to the function
    :param kwargs: dict of kwargs to past to the function
    """
    with handle_system_exit('User defined function quit unexpectedly'):
        if inspect.iscoroutinefunction(handler):
            return await handler(*args, **kwargs)
        else:
            return await run_in_threadpool(handler, *args, **kwargs)


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


def enforce_sso(conf: ConfigurationBuilder):
    """
    Checks if given configuration has SSO enabled.

    Raises if SSO is not used
    """
    try:
        from dara.enterprise import SSOAuthConfig

        if conf.auth_config is None or not isinstance(conf.auth_config, SSOAuthConfig):
            raise ValueError('Config does not have SSO auth enabled. Please update your application to configure SSO.')
    except ImportError:
        raise ValueError(
            'SSO is not enabled. Please install the dara_enterprise package and configure SSO to use this feature.'
        )
