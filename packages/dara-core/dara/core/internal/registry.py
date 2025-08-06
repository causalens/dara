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

import copy
from collections.abc import MutableMapping
from enum import Enum
from typing import Generic, Optional, TypeVar

from dara.core.metrics import CACHE_METRICS_TRACKER, total_size

T = TypeVar('T')


class RegistryType(str, Enum):
    ACTION_DEF = 'Action Definition'
    ACTION = 'Action Handler'
    UPLOAD_RESOLVER = 'Upload Resolver'
    DOWNLOAD = 'Download'
    COMPONENTS = 'Components'
    ENDPOINT_CONFIG = 'Endpoint Configuration'
    SERVER_VARIABLE = 'ServerVariable'
    DERIVED_VARIABLE = 'DerivedVariable'
    LAST_VALUE = 'LatestValue'
    TEMPLATE = 'Template'
    AUTH_CONFIG = 'Auth Config'
    UTILS = 'Utils'
    STATIC_KWARGS = 'Static kwargs'
    WEBSOCKET_CHANNELS = 'Websocket Channels'
    USER_SESSION = 'User session'
    PENDING_TOKENS = 'Pending tokens'
    CUSTOM_WS_HANDLERS = 'Custom WS handlers'
    BACKEND_STORE = 'Backend Store'
    DOWNLOAD_CODE = 'Download Code'


class Registry(Generic[T]):
    """
    A generic registry class that allows for new registries to be quickly added and expose a common interface
    """

    _registry: MutableMapping[str, T]

    def __init__(
        self,
        name: RegistryType,
        initial_registry: Optional[MutableMapping[str, T]] = None,
        allow_duplicates: Optional[bool] = True,
    ):
        """
        :param name: human readable name of the registry; used for metrics
        :param initial_registry: an optional initial set of elements for the registry
        :param allow_duplicates: an optional boolean which determines whether this registry should allow for duplicate uids entries
        """
        self.name = name
        self.allow_duplicates = allow_duplicates
        self._registry = {}
        if initial_registry is not None:
            self._registry = copy.deepcopy(initial_registry)

        self._size = total_size(self._registry)
        self._update_metrics()

    def register(self, key: str, value: T):
        """Register an entity to the registry"""
        if not self.allow_duplicates and key in self._registry:
            raise ValueError(f'Invalid uid value: {key}, is already taken')

        self._registry[key] = value
        self._size += total_size(value)
        self._update_metrics()

    def get(self, key: str) -> T:
        """Fetch an entity from the registry, will raise if it's not found"""
        return self._registry[key]

    def has(self, key: str) -> bool:
        """Check whether the registry has the given key registered"""
        return key in self._registry

    def set(self, key: str, value: T):
        """Set an entity for the registry, if already present overwrites it"""
        previous_value_size = total_size(self._registry.get(key))
        self._registry[key] = value
        self._size = self._size - previous_value_size + total_size(value)
        self._update_metrics()

    def get_all(self) -> MutableMapping[str, T]:
        """Fetch all the items currently registered"""
        return self._registry

    def _update_metrics(self):
        """
        Notify the cache metrics tracker.
        """
        CACHE_METRICS_TRACKER.update_registry(self.name, self._size)

    def remove(self, key: str):
        """
        Remove the key from registry, will raise if it's not found
        """
        previous_value_size = total_size(self._registry.get(key))
        self._registry.pop(key)
        self._size = self._size - previous_value_size

    def replace(self, new_registry: MutableMapping[str, T], deepcopy=True):
        """
        Replace the entire registry with a new one
        """
        self._size = total_size(new_registry)

        if deepcopy:
            self._registry = copy.deepcopy(new_registry)
        else:
            self._registry = new_registry

        self._update_metrics()
