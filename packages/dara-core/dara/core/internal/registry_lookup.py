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

from collections.abc import Callable, Coroutine
from typing import Literal, TypeVar

from dara.core.internal.registry import Registry, RegistryType
from dara.core.internal.utils import async_dedupe
from dara.core.telemetry import observe_internal_operation

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
CustomRegistryLookup = dict[RegistryLookupKey, Callable[[str], Coroutine]]

RegistryValue = TypeVar('RegistryValue')


class RegistryLookup:
    """
    Manages registry Lookup.
    """

    def __init__(self, handlers: CustomRegistryLookup | None = None):
        if handlers is None:
            handlers = {}
        self.handlers = handlers

    @async_dedupe
    async def get(self, registry: Registry[RegistryValue], uid: str) -> RegistryValue:
        """
        Get the entry from registry by uid.
        If uid is not in registry and it has a external handler that defined, will execute the handler

        :param registry: target registry
        :param uid: entry id
        """
        registry_name = registry.name.value if isinstance(registry.name, RegistryType) else registry.name
        with observe_internal_operation('registry', 'lookup', name=registry_name):
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
