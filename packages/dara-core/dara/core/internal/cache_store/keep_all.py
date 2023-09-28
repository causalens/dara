from typing import Any, Dict, Optional

import anyio

from dara.core.base_definitions import KeepAllCachePolicy
from dara.core.internal.cache_store.base_impl import CacheStoreImpl

class KeepAllCache(CacheStoreImpl[KeepAllCachePolicy]):
    """
    A Keep All Cache.
    Keeps all items in the cache indefinitely.
    """
    def __init__(self, policy: KeepAllCachePolicy):
        super().__init__(policy)
        self.cache: Dict[str, Any] = {}
        self.lock = anyio.Lock()

    async def get(self, key: str, unpin: bool = False) -> Optional[Any]:
        """
        Retrieve a value from the cache.

        :param key: The key of the value to retrieve.
        :param unpin: This parameter is ignored in KeepAllCache as entries are never evicted.
        :return: The value associated with the key, or None if the key is not in the cache.
        """
        async with self.lock:
            return self.cache.get(key)

    async def set(self, key: str, value: Any, pin: bool = False) -> None:
        """
        Add a key-value pair to the cache, or update the value of an existing key.

        :param key: The key to set.
        :param value: The value to associate with the key.
        :param pin: This parameter is ignored in KeepAllCache as entries are never evicted.
        """
        async with self.lock:
            self.cache[key] = value
