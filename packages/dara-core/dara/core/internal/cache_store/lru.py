from typing import Any

import anyio

from dara.core.base_definitions import LruCachePolicy
from dara.core.internal.cache_store.base_impl import CacheStoreImpl
from dara.core.metrics import total_size


class Node:
    """A node in a doubly linked list."""

    def __init__(self, key: str, value: Any, size_bytes: int, pin: bool = False):
        """
        Initialize a new node.

        :param key: The key associated with this node.
        :param value: The value associated with this node.
        :param size_bytes: The precomputed approximate size of the value.
        :param pin: If true, the node will not be evicted until read.
        """
        self.key = key
        self.value = value
        self.size_bytes = size_bytes
        self.pin = pin
        self.prev: Node | None = None
        self.next: Node | None = None

    def __repr__(self) -> str:
        return f'Node({self.key}, {self.value}, {self.pin})'


class LRUCache(CacheStoreImpl[LruCachePolicy]):
    """
    A Least Recently Used (LRU) Cache.
    Evicts the least recently used items first.
    """

    def __init__(self, policy: LruCachePolicy):
        super().__init__(policy)
        self.cache: dict[str, Node] = {}
        self.head: Node | None = None  # No sentinel, can be None
        self.tail: Node | None = None  # No sentinel, can be None
        self.lock = anyio.Lock()

    def _detach(self, node: Node) -> None:
        """Unlink a node, preserving both endpoints and its neighbours."""
        if node.prev:
            node.prev.next = node.next
        else:
            self.head = node.next
        if node.next:
            node.next.prev = node.prev
        else:
            self.tail = node.prev
        node.prev = None
        node.next = None

    def _move_to_front(self, node: Node):
        """
        Move the given node to the front of the list, indicating it was recently accessed.

        :param node: The node to move to the front.
        """
        if node is self.head:
            return
        self._detach(node)
        node.next = self.head
        node.prev = None
        if self.head:
            self.head.prev = node
        self.head = node
        if not self.tail:
            self.tail = node

    async def delete(self, key: str) -> Any:
        """
        Delete an entry from the cache.

        :param key: The key of the entry to delete.
        """
        async with self.lock:
            node = self.cache.get(key)
            if node is None:
                return None  # Key not found

            if node.pin:
                return None  # Entry is pinned, do not delete

            self._detach(node)

            # Delete from the dictionary
            removed = self.cache.pop(key, None)
            if removed is not None:
                self.size_bytes -= removed.size_bytes
            return node.value

    async def get(self, key: str, unpin: bool = False, raise_for_missing: bool = False) -> Any | None:
        """
        Retrieve a value from the cache.

        :param key: The key of the value to retrieve.
        :param unpin: If true, the entry will be unpinned if it is pinned.
        :param raise_for_missing: If true, an exception will be raised if the entry is not found
        :return: The value associated with the key, or None if the key is not in the cache.
        """
        async with self.lock:
            node = self.cache.get(key)
            if node:
                if unpin:
                    node.pin = False
                self._move_to_front(node)
                return node.value

        if raise_for_missing:
            raise KeyError(f'No cache entry found for {key}')
        return None

    async def set(self, key: str, value: Any, pin: bool = False) -> None:
        """
        Add a key-value pair to the cache, or update the value of an existing key.
        If the cache is full, evict the least recently used item.

        :param key: The key to set.
        :param value: The value to associate with the key.
        :param pin: If true, the entry will not be evicted until read.
        """
        # New unpinned entries cannot survive when pinned entries occupy all capacity.
        # Decide before measuring, but keep the expensive measurement outside the lock.
        async with self.lock:
            if self._would_discard(key, pin):
                self._evict_to_capacity()
                return
        size_bytes = total_size(value)
        async with self.lock:
            # Another writer may have changed capacity while we waited for the lock.
            if self._would_discard(key, pin):
                self._evict_to_capacity()
                return
            if key in self.cache:
                node = self.cache[key]
                self._replace_size(size_bytes, node.size_bytes)
                node.size_bytes = size_bytes
                node.value = value
                node.pin = pin
                self._move_to_front(node)
            else:
                node = Node(key, value, size_bytes, pin)
                self.cache[key] = node
                self._replace_size(size_bytes)
                if self.head:
                    self.head.prev = node
                node.next = self.head
                self.head = node
                if not self.tail:
                    self.tail = node

                self._evict_to_capacity()

    def _evict_to_capacity(self) -> None:
        """Evict unpinned entries while holding the lock, preserving pinned nodes."""
        while len(self.cache) > self.policy.max_size:
            evict_node = self.tail
            while evict_node and evict_node.pin:
                evict_node = evict_node.prev
            if evict_node is None:
                break
            self._detach(evict_node)
            removed = self.cache.pop(evict_node.key, None)
            if removed is not None:
                self.size_bytes -= removed.size_bytes

    def _would_discard(self, key: str, pin: bool) -> bool:
        """Check immediate eviction for a new entry while holding the lock."""
        return (
            key not in self.cache
            and not pin
            and len(self.cache) >= self.policy.max_size
            and sum(node.pin for node in self.cache.values()) >= self.policy.max_size
        )

    async def clear(self):
        """
        Empty the store.
        """
        async with self.lock:
            self.cache = {}
            self.size_bytes = 0
            self.head = None
            self.tail = None

    def __len__(self) -> int:
        """Return the number of entries currently held by this cache."""
        return len(self.cache)

    def values(self) -> list[Any]:
        """Return a point-in-time snapshot of cached values."""
        return [node.value for node in self.cache.values()]
