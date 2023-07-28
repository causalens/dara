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

from typing import Any, Dict, List, Optional

import anyio

from dara.core.base_definitions import CacheType, PendingTask
from dara.core.internal.utils import get_cache_scope
from dara.core.metrics import CACHE_METRICS_TRACKER, total_size


class Store:
    """
    A simple key value store class that works across multiple async requests and can manage separate version of the
    store for the selected cache type. Every method accepts the cache_type flag that will cause it to save/fetch the key
    from the selected based store (session or user) rather than the global one.

    Has support for a pending variable state that will allow multiple requests for the same key to asynchronously block
    and resolve at the same time when the value is correctly updated by the first one to request the specific key
    """

    class Config:
        use_enum_values = True

    class PendingValue:
        """
        An internal class that's used to represent a pending value. Holds a future object that can be awaited by
        multiple consumers.
        """

        def __init__(self):
            self.event = anyio.Event()
            self._value = None
            self._error = None

        async def wait(self):
            """
            Wait for the underlying event to be set
            """
            # Waiting in chunks as otherwise Jupyter blocks the event loop
            while not self.event.is_set():
                await anyio.sleep(0.01)
            if self._error:
                raise self._error
            return self._value

        def resolve(self, value: Any):
            """
            Resolve the pending state and send values to the waiting code

            :param value: the value to resolve as the result
            """
            self._value = value
            self.event.set()

        def error(self, exc: Exception):
            """
            Resolve the pending state with an error and send it to the waiting code

            :param exc: exception to resolve as the result
            """
            self._error = exc
            self.event.set()

    def __init__(self):
        # This dict is the main store of values, the first level of keys is the cache type and the second level are the
        # value keys. The root key is used for any non-session/user dependant keys that are added.
        self._store: Dict[str, Dict[str, Any]] = {'global': {}}

        # The size is not totally accurate as we only add/subtract values stored, without accounting for keys
        # or extra memory due to hash collisions etc; its a 'good enough' approximation though
        self._size = total_size(self._store)

    def _update_size(self, value: Any, previous_value: Any):
        previous_value_size = total_size(previous_value) if previous_value is not None else 0
        self._size = self._size - previous_value_size + total_size(value)

    def _update_metrics(self):
        """
        Notify metrics tracker about current size
        """
        CACHE_METRICS_TRACKER.update_store(self._size)

    def get(self, key: str, cache_type: Optional[CacheType] = CacheType.GLOBAL) -> Any:
        """
        Get a given key from the store and optionally pull it from the specified cache store or the global one

        :param key: the key to fetch
        :param cache_type: whether to pull the value from the specified cache store or the global one, defaults to
                            the global one
        """
        cache_key = get_cache_scope(cache_type)
        return self._store.get(cache_key, {}).get(key)

    async def get_or_wait(self, key: str, cache_type: Optional[CacheType] = CacheType.GLOBAL) -> Any:
        """
        Wait for the given key to not be pending and then return the value. Optionally pull it from the specified cache specific
        store or the global one

        :param key: the key to fetch
        :param cache_type: whether to pull the value from the specified cache specific store or the global one, defaults to
                            the global one
        """
        cache_key = get_cache_scope(cache_type)
        value = self._store.get(cache_key, {}).get(key)

        if isinstance(value, self.PendingValue):
            return await value.wait()
        if isinstance(value, PendingTask):
            return await value.run()
        return value

    def set(
        self,
        key: str,
        value: Any,
        cache_type: Optional[CacheType] = CacheType.GLOBAL,
        error: Optional[Exception] = None,
    ):
        """
        Set the value of a given key in the store. the cache_type flag can be used to optionally pull the value from
        the session, user or the global specific store.

        :param key: the key to set
        :param value: the value to store
        :param cache_type: whether to pull the value from the specified cache specific store or the global one, defaults to
                            the global one
        :param error: optional error; if provided, pending values will be updated with the error
        """
        cache_key = get_cache_scope(cache_type)
        if self._store.get(cache_key) is None:
            self._store[cache_key] = {}
            self._size += total_size({})

        # If there is a PendingValue set for this key then trigger its resolution
        if isinstance(self._store[cache_key].get(key), self.PendingValue):
            if error is not None:
                self._store[cache_key][key].error(error)
            else:
                self._store[cache_key][key].resolve(value)

        # Update the size counter
        self._update_size(value, self._store[cache_key].get(key))
        self._update_metrics()

        self._store[cache_key][key] = value

    def set_pending_value(self, key: str, cache_type: Optional[CacheType] = CacheType.GLOBAL):
        """
        Set a pending state for a value in the store. This will trigger the async behavior of the get call if subsequent
        requests ask for the same key. A future is created in the store, which all requests then listen for the
        resolution of before returning.

        :param key: the key to set as pending
        :param cache_type: whether to pull the value from the specified cache specific store or the global one, defaults to
                            the global one
        """
        cache_key = get_cache_scope(cache_type)
        if self._store.get(cache_key) is None:
            self._store[cache_key] = {}
            self._size += total_size({})

        pending_val = self.PendingValue()

        # Update the size counter
        self._update_size(pending_val, self._store[cache_key].get(key))
        self._update_metrics()

        self._store[cache_key][key] = pending_val

    def set_pending_task(self, key: str, pending_task: PendingTask, cache_type: Optional[CacheType] = CacheType.GLOBAL):
        """
        Store a pending task state for a given key in the store. This will trigger the async behavior of the get call if subsequent
        requests ask for the same key. The PendingTask will be resolved once the underlying task is completed.

        :param key: the key to set as pending
        :param pending_task: the PendingTask to store
        :param cache_type: whether to pull the value from the specified cache specific store or the global one, defaults to
                            the global one
        """
        cache_key = get_cache_scope(cache_type)
        if self._store.get(cache_key) is None:
            self._store[cache_key] = {}

        # Update the size counter
        self._update_size(pending_task, self._store[cache_key].get(key))
        self._update_metrics()

        self._store[cache_key][key] = pending_task

    def remove_starting_with(self, start: str, cache_type: Optional[CacheType] = CacheType.GLOBAL):
        """
        Remove any entries stored under keys starting with given string

        :param start: string to use to remove entries
        :param cache_type: whether to pull the value from the specified cache specific store or the global one, defaults to
                            the global one
        """
        cache_key = get_cache_scope(cache_type)
        cache_entries = self._store.get(cache_key)
        if cache_entries is not None:
            for k in list(cache_entries.keys()):
                if k.startswith(start):
                    size_to_remove = total_size(cache_entries.get(k))
                    cache_entries.pop(k)
                    self._size -= size_to_remove

        self._update_metrics()

    def empty_stores(self, include_pending: bool = True):
        """
        Empty all of the internal stores

        :param include_pending: whether to also remove pending values and tasks from store
        """
        for cache_type, cache_type_store in self._store.items():
            # If we're including pending, just empty the whole store
            if include_pending:
                size_to_remove = total_size(cache_type_store)
                self._store[cache_type] = {}
                self._size = self._size - size_to_remove + total_size({})
            else:
                # Otherwise go through and remove any non-pending values
                keys = list(cache_type_store.keys())
                for key in keys:
                    if not isinstance(cache_type_store[key], (self.PendingValue, PendingTask)):
                        size_to_remove = total_size(cache_type_store.get(key))
                        cache_type_store.pop(key)
                        self._size -= size_to_remove

        self._update_metrics()

    def list(self, cache_type: Optional[CacheType] = CacheType.GLOBAL) -> List[str]:
        """
        List all keys in a specified cache store. Listed the global store unless cache_type is not None

        :param cache_key: whether to list the specified cache specific store or the global one, defaults to global
        """
        cache_key = get_cache_scope(cache_type)
        return list(self._store.get(cache_key, {}).keys())
