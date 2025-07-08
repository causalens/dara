import heapq
import time
from typing import Any, Dict, List, Tuple

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
        self.pinned_cache: Dict[str, Node] = {}
        self.unpinned_cache: Dict[str, Node] = {}
        self.expiration_heap: List[Tuple[float, str]] = []  # Stores (expiration_time, key) for unpinned items
        self.lock = anyio.Lock()

    async def _cleanup(self):
        """
        Evict expired entries from the cache, unless they are pinned.
        """
        now = time.time()
        while self.expiration_heap and self.expiration_heap[0][0] <= now:
            _, key = heapq.heappop(self.expiration_heap)
            self.unpinned_cache.pop(key, None)

    async def get(self, key: str, unpin: bool = False, raise_for_missing: bool = False) -> Any:
        """
        Retrieve a value from the cache.

        :param key: The key of the value to retrieve.
        :param unpin: If true, the entry will be unpinned if it is pinned.
        :param raise_for_missing: If true, an exception will be raised if the entry is not found
        :return: The value associated with the key, or None if the key is not in the cache.
        """
        async with self.lock:
            await self._cleanup()

            if key in self.pinned_cache:
                node = self.pinned_cache[key]

                # If unpin, move the node to the unpinned cache and expiration heap
                if unpin:
                    self.pinned_cache.pop(key)
                    self.unpinned_cache[key] = node
                    heapq.heappush(self.expiration_heap, (node.expiration_time, key))
                return node.value
            elif key in self.unpinned_cache:
                return self.unpinned_cache[key].value

            if raise_for_missing:
                raise KeyError(f'No cache entry found for {key}')
            return None

    async def set(self, key: str, value: Any, pin: bool = False) -> None:
        """
        Add a key-value pair to the cache, or update the value of an existing key.

        :param key: The key to set.
        :param value: The value to associate with the key.
        :param pin: If true, the entry will not be evicted until read.
        """
        async with self.lock:
            await self._cleanup()

            expiration_time = time.time() + self.policy.ttl
            node = Node(value, expiration_time, pin)
            if pin:
                self.pinned_cache[key] = node
                self.unpinned_cache.pop(key, None)  # Ensure the key is removed from unpinned cache if it exists
            else:
                self.unpinned_cache[key] = node
                heapq.heappush(self.expiration_heap, (expiration_time, key))
                self.pinned_cache.pop(key, None)  # Ensure the key is removed from pinned cache if it exists

    async def delete(self, key: str) -> None:
        """
        Delete a key-value pair from the cache, if it exists.

        :param key: The key to delete.
        """
        async with self.lock:
            await self._cleanup()

            if key in self.unpinned_cache:
                node = self.unpinned_cache.pop(key)
                self.expiration_heap = [(t, k) for t, k in self.expiration_heap if k != key]
                heapq.heapify(self.expiration_heap)
                return node.value
            elif key in self.pinned_cache:
                node = self.pinned_cache.pop(key)
                return node.value

    async def clear(self):
        """
        Empty the store.
        """
        async with self.lock:
            self.pinned_cache = {}
            self.unpinned_cache = {}
            self.expiration_heap = []
