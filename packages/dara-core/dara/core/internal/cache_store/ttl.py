import heapq
import time
from typing import Any, Dict, List, Optional, Tuple
import anyio
from dara.core.base_definitions import TTLCachePolicy
from dara.core.internal.cache_store.base_impl import CacheStoreImpl

class Node:
    """
    A node to hold the value, expiration time, and pin status of each cache entry.
    """
    def __init__(self, value: Any, expiration_time: float, pin: bool = False):
        """
        Initialize a new node.

        :param value: The value to be stored.
        :param expiration_time: The time at which the value expires.
        :param pin: Whether the entry should be preserved even if its TTL has expired.
        """
        self.value = value
        self.expiration_time = expiration_time
        self.pin = pin

class TTLCache(CacheStoreImpl[TTLCachePolicy]):
    """
    A Time-to-Live (TTL) Cache implementation that evicts entries after a specified duration.

    This cache utilizes a heap data structure to efficiently track the expiration times of the cache entries.
    The heap ensures that the soonest-to-expire entry is always at the top, enabling quick eviction of expired entries.
    On each set or get operation, the cache checks and evicts expired entries based on the TTL policy.
    Pinned entries are not evicted until they are unpinned, regardless of their TTL.
    """
    def __init__(self, policy: TTLCachePolicy):
        super().__init__(policy)
        self.cache: Dict[str, Node] = {}
        self.expiration_heap: List[Tuple[float, str]] = []  # Stores (expiration_time, key)
        self.lock = anyio.Lock()

    async def _evict_expired_entries(self):
        """
        Evict expired entries from the cache and the expiration heap, unless they are pinned.
        """
        now = time.time()
        while self.expiration_heap and self.expiration_heap[0][0] <= now:
            _, key = heapq.heappop(self.expiration_heap)
            node = self.cache.get(key)
            if node and not node.pin and node.expiration_time <= now:
                del self.cache[key]

    async def get(self, key: str, unpin: bool = False) -> Optional[Any]:
        """
        Retrieve a value from the cache.

        :param key: The key of the value to retrieve.
        :param unpin: If true, the entry will be unpinned if it is pinned.
        :return: The value associated with the key, or None if the key is not in the cache or the entry has expired.
        """
        async with self.lock:
            await self._evict_expired_entries()
            node = self.cache.get(key)
            if node and (node.pin or node.expiration_time > time.time()):
                if unpin:
                    node.pin = False
                return node.value

    async def set(self, key: str, value: Any, pin: bool = False) -> None:
        """
        Add a key-value pair to the cache, or update the value of an existing key.

        :param key: The key to set.
        :param value: The value to associate with the key.
        :param pin: If true, the entry will not be evicted until read.
        """
        async with self.lock:
            expiration_time = time.time() + self.policy.ttl
            self.cache[key] = Node(value, expiration_time, pin)
            heapq.heappush(self.expiration_heap, (expiration_time, key))
            await self._evict_expired_entries()
