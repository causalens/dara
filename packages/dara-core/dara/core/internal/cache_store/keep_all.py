from typing import Any, Dict, Optional

import anyio

from dara.core.base_definitions import KeepAllCachePolicy
from dara.core.internal.cache_store.base_impl import CacheStoreImpl


class Entry:
    value: Any
    pin: bool

    def __init__(self, value: Any, pin: bool = False):
        self.value = value
        self.pin = pin


class KeepAllCache(CacheStoreImpl[KeepAllCachePolicy]):
    """
    A Keep All Cache.
    Keeps all items in the cache indefinitely.
    """

    def __init__(self, policy: KeepAllCachePolicy):
        super().__init__(policy)
        self.cache: Dict[str, Any] = {}
        self.lock = anyio.Lock()

    async def delete(self, key: str) -> Any:
        """
        Delete an entry from the cache.

        :param key: The key of the entry to delete.
        """
        async with self.lock:
            entry = self.cache.get(key)

            # Skip deleting if entry is None or pinned
            if entry is None or entry.pin:
                return None

            del self.cache[key]
            return entry

    async def get(self, key: str, unpin: bool = False, raise_for_missing: bool = False) -> Optional[Any]:
        """
        Retrieve a value from the cache.

        :param key: The key of the value to retrieve.
        :param unpin: This parameter is ignored in KeepAllCache as entries are never evicted.
        :param raise_for_missing: If true, an exception will be raised if the entry is not found
        :return: The value associated with the key, or None if the key is not in the cache.
        """
        async with self.lock:
            entry = self.cache.get(key)

            if entry is None:
                if raise_for_missing:
                    raise KeyError(f'No cache entry found for {key}')
                return None

            if unpin:
                entry.pin = False

            return entry.value

    async def set(self, key: str, value: Any, pin: bool = False) -> None:
        """
        Add a key-value pair to the cache, or update the value of an existing key.

        :param key: The key to set.
        :param value: The value to associate with the key.
        :param pin: This parameter is ignored in KeepAllCache as entries are never evicted.
        """
        async with self.lock:
            self.cache[key] = Entry(value, pin)

    async def clear(self):
        """
        Empty the store.
        """
        async with self.lock:
            self.cache = {}
