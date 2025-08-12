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

from collections.abc import Coroutine
from typing import Callable, Dict, Literal, TypeVar, Union

from dara.core.internal.registry import Registry, RegistryType
from dara.core.internal.utils import async_dedupe

RegistryLookupKey = Literal[
    RegistryType.ACTION,
    RegistryType.COMPONENTS,
    RegistryType.DERIVED_VARIABLE,
    RegistryType.SERVER_VARIABLE,
    RegistryType.STATIC_KWARGS,
    RegistryType.UPLOAD_RESOLVER,
    RegistryType.BACKEND_STORE,
    RegistryType.DOWNLOAD_CODE,
]
CustomRegistryLookup = Dict[RegistryLookupKey, Callable[[str], Coroutine]]

RegistryType = TypeVar('RegistryType')


class RegistryLookup:
    """
    Manages registry Lookup.
    """

    def __init__(self, handlers: Union[CustomRegistryLookup, None] = None):
        if handlers is None:
            handlers = {}
        self.handlers = handlers

    @async_dedupe
    async def get(self, registry: Registry[RegistryType], uid: str) -> RegistryType:
        """
        Get the entry from registry by uid.
        If uid is not in registry and it has a external handler that defined, will execute the handler

        :param registry: target registry
        :param uid: entry id
        """
        try:
            return registry.get(uid)
        except KeyError as e:
            if registry.name in self.handlers:
                func = self.handlers[registry.name]  # type: ignore
                entry = await func(uid)
                # If something else registered the entry while we were waiting, return that
                if registry.has(uid):
                    return registry.get(uid)
                registry.register(uid, entry)
                return entry
            raise ValueError(
                f'Could not find uid {uid} in {registry.name} registry, did you register it before the app was initialized?'
            ) from e
