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

from typing import Optional

from pandas import DataFrame

from dara.core.base_definitions import Cache, CacheArgType
from dara.core.interactivity.server_variable import ServerVariable


class DataVariable(ServerVariable):
    """
    DataVariable represents a variable that is specifically designed to hold datasets.


    Example use cases:

    Global data provided upfront
    >>> global_data = DataVariable(data=DataFrame({'a': [1, 2, 3]})) # implicit cache='global'

    User-specific data, cannot be provided upfront (top-level code does not have a user context)
    >>> user_data = DataVariable(cache='user')
    >>> UploadDropzone(target=user_data)

    Session-specific data, cannot be provided upfront (top-level code does not have a session context)
    >>> session_data = DataVariable(cache='session')
    >>> UpdateVariable(func=some_data_transformation, variable=session_data)
    """

    def __init__(
        self,
        data: Optional[DataFrame] = None,
        cache: CacheArgType = Cache.Type.GLOBAL,
        uid: Optional[str] = None,
        **kwargs,
    ) -> None:
        """
        DataVariable represents a variable that is specifically designed to hold datasets.

        :param data: optional dataframe
        :param uid: the unique identifier for this variable; if not provided a random one is generated
        :param filters: a dictionary of filters to apply to the data
        :param cache: how to cache the result; 'user' per user, 'session' per session, 'global' for all users
        """
        cache_policy = Cache.Policy.from_arg(cache)

        if data is not None and cache_policy.cache_type is not Cache.Type.GLOBAL:
            raise ValueError('Data cannot be cached per session or per user if provided upfront')

        scope = 'global' if cache_policy.cache_type == Cache.Type.GLOBAL else 'user'

        super().__init__(scope=scope, uid=uid, default=data, **kwargs)
