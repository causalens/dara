from typing import Any, Dict, Optional

import anyio

from dara.core.base_definitions import LruCachePolicy
from dara.core.internal.cache_store.base_impl import CacheStoreImpl


class Node:
    """A node in a doubly linked list."""

    def __init__(self, key: str, value: Any, pin: bool = False):
        """
        Initialize a new node.

        :param key: The key associated with this node.
        :param value: The value associated with this node.
        :param pin: If true, the node will not be evicted until read.
        """
        self.key = key
        self.value = value
        self.pin = pin
        self.prev: Optional[Node] = None
        self.next: Optional[Node] = None

    def __repr__(self) -> str:
        return f'Node({self.key}, {self.value}, {self.pin})'


class LRUCache(CacheStoreImpl[LruCachePolicy]):
    """
    A Least Recently Used (LRU) Cache.
    Evicts the least recently used items first.
    """

    def __init__(self, policy: LruCachePolicy):
        super().__init__(policy)
        self.cache: Dict[str, Node] = {}
        self.head: Optional[Node] = None  # No sentinel, can be None
        self.tail: Optional[Node] = None  # No sentinel, can be None
        self.lock = anyio.Lock()

    def _move_to_front(self, node: Node):
        """
        Move the given node to the front of the list, indicating it was recently accessed.

        :param node: The node to move to the front.
        """
        if node.prev:
            node.prev.next = node.next
        if node.next:
            node.next.prev = node.prev
        if self.tail == node:
            self.tail = node.prev
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

            # Delete from the doubly linked list
            if node.prev:
                node.prev.next = node.next
            if node.next:
                node.next.prev = node.prev
            if self.head == node:
                self.head = node.next
            if self.tail == node:
                self.tail = node.prev

            # Delete from the dictionary
            self.cache.pop(key, None)
            return node.value

    async def get(self, key: str, unpin: bool = False, raise_for_missing: bool = False) -> Optional[Any]:
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
        async with self.lock:
            if key in self.cache:
                node = self.cache[key]
                node.value = value
                node.pin = pin
                self._move_to_front(node)
            else:
                node = Node(key, value, pin)
                self.cache[key] = node
                if self.head:
                    self.head.prev = node
                node.next = self.head
                self.head = node
                if not self.tail:
                    self.tail = node

                # Check and perform eviction
                while len(self.cache) > self.policy.max_size:
                    evict_node: Optional[Node] = self.tail

                    # Skip over pinned nodes
                    while evict_node and evict_node.pin:
                        evict_node = evict_node.prev

                    if evict_node:
                        self.tail = evict_node.prev
                        if self.tail:
                            self.tail.next = None
                        # Use pop instead of delete just in case
                        self.cache.pop(evict_node.key, None)
                    else:
                        # all nodes are pinned, can't evict
                        break

    async def clear(self):
        """
        Empty the store.
        """
        async with self.lock:
            self.cache = {}
            self.head = None
            self.tail = None
