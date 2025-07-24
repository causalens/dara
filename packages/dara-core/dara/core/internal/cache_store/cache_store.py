from typing import Any, Dict, Generic, Optional, cast

from dara.core.base_definitions import (
    CachedRegistryEntry,
    KeepAllCachePolicy,
    LruCachePolicy,
    MostRecentCachePolicy,
    PendingTask,
    TTLCachePolicy,
)
from dara.core.internal.cache_store.base_impl import CacheStoreImpl, PolicyT
from dara.core.internal.cache_store.keep_all import KeepAllCache
from dara.core.internal.cache_store.lru import LRUCache
from dara.core.internal.cache_store.ttl import TTLCache
from dara.core.internal.utils import CacheScope, get_cache_scope
from dara.core.metrics import CACHE_METRICS_TRACKER, total_size


def cache_impl_for_policy(policy: PolicyT) -> CacheStoreImpl[PolicyT]:
    """
    Get a cache implementation depending on the policy
    """
    impl: Optional[CacheStoreImpl] = None

    if isinstance(policy, (LruCachePolicy, MostRecentCachePolicy)):
        impl = LRUCache(policy)
    elif isinstance(policy, TTLCachePolicy):
        impl = TTLCache(policy)
    elif isinstance(policy, KeepAllCachePolicy):
        impl = KeepAllCache(policy)

    if impl is None:
        raise NotImplementedError(f'No cache implementation available for policy: {policy}')

    return cast(CacheStoreImpl[PolicyT], impl)


class CacheScopeStore(Generic[PolicyT]):
    """
    A Cache Scope aware store.
    Depending on the policy will store a different cache implementation per entry.
    Keeps entries scoped to the cache scope of current execution.
    """

    def __init__(self, policy: PolicyT):
        self.caches: Dict[CacheScope, CacheStoreImpl[PolicyT]] = {}
        self.policy = policy

    async def delete(self, key: str) -> Any:
        """
        Delete an entry from the cache.

        :param key: The key of the entry to delete.
        """
        scope = get_cache_scope(self.policy.cache_type)
        cache = self.caches.get(scope)

        # No cache for this scope yet
        if cache is None:
            return None

        return await cache.delete(key)

    async def get(self, key: str, unpin: bool = False, raise_for_missing: bool = False) -> Optional[Any]:
        """
        Retrieve an entry from the cache.

        :param key: The key of the entry to retrieve.
        :param unpin: If true, the entry will be unpinned if it is pinned.
        :param raise_for_missing: If true, an exception will be raised if the entry is not found
        """
        scope = get_cache_scope(self.policy.cache_type)
        cache = self.caches.get(scope)

        # No cache for this scope yet
        if cache is None:
            if raise_for_missing:
                raise KeyError(f'No cache found for {scope}')
            return None

        return await cache.get(key, unpin=unpin, raise_for_missing=raise_for_missing)

    async def set(self, key: str, value: Any, pin: bool = False):
        """
        Add an entry to the cache. Depending on the implementation might evict other entries.

        :param key: The key of the entry to set.
        :param value: The value of the entry to set.
        :param pin: If true, the entry will not be evicted until read.
        """
        scope = get_cache_scope(self.policy.cache_type)
        cache = self.caches.get(scope)

        # No cache for this scope yet, create new
        if cache is None:
            cache = cache_impl_for_policy(self.policy)
            self.caches[scope] = cache

        await cache.set(key, value, pin=pin)

        return value

    async def clear(self):
        """
        Empty the store.
        """
        for cache in self.caches.values():
            await cache.clear()
        self.caches = {}


class CacheStore:
    """
    Key-value store class which stores a separate CacheScopeStore per registry entry.
    """

    def __init__(self):
        self.registry_stores: Dict[str, CacheScopeStore] = {}
        # The size is not totally accurate as we only add/subtract values stored, without accounting for keys
        # or extra memory due to hash collisions, internal cache implementation; its a 'good enough' approximation
        # of just the values stored
        self._size = 0

    def _update_size(self, prev_value: Any, new_value: Any):
        previous_value_size = total_size(prev_value) if prev_value is not None else 0
        self._size = self._size - previous_value_size + total_size(new_value)

    def _update_metrics(self):
        """
        Notify metrics tracker about current size
        """
        CACHE_METRICS_TRACKER.update_store(self._size)

    async def delete(self, registry_entry: CachedRegistryEntry, key: str) -> Any:
        """
        Delete an entry from the cache for the given registry entry and cache key.

        :param registry_entry: The registry entry to delete the value for.
        :param key: The key of the entry to delete.
        """
        registry_store = self.registry_stores.get(registry_entry.to_store_key())

        # No store for this entry yet
        if registry_store is None:
            return None

        prev_entry = await registry_store.delete(key)

        # Update size
        self._update_size(prev_entry, None)
        self._update_metrics()

        return prev_entry

    async def get(
        self,
        registry_entry: CachedRegistryEntry,
        key: str,
        unpin: bool = False,
        raise_for_missing: bool = False,
    ) -> Optional[Any]:
        """
        Retrieve an entry from the cache for the given registry entry and cache key.

        :param registry_entry: The registry entry to retrieve the value for.
        :param key: The key of the entry to retrieve.
        :param unpin: If true, the entry will be unpinned if it is pinned.
        :param raise_for_missing: If true, an exception will be raised if the entry is not found
        """
        registry_store = self.registry_stores.get(registry_entry.to_store_key())

        # No store for this entry yet
        if registry_store is None:
            if raise_for_missing:
                raise KeyError(f'No cache store found for {registry_entry.to_store_key()}')
            return None

        return await registry_store.get(key, unpin=unpin, raise_for_missing=raise_for_missing)

    async def get_or_wait(self, registry_entry: CachedRegistryEntry, key: str):
        """
        Retrieve an entry from the cache for the given registry entry and cache key.
        If the entry is a pending value or a pending task, wait for it to resolve.

        :param registry_entry: The registry entry to retrieve the value for.
        :param key: The key of the entry to retrieve.
        """

        value = await self.get(registry_entry, key)

        if isinstance(value, PendingTask):
            return await value.run()

        return value

    async def set(
        self,
        registry_entry: CachedRegistryEntry,
        key: str,
        value: Any,
        pin: bool = False,
    ):
        """
        Add an entry to the cache for the given registry entry and cache key.

        :param registry_entry: The registry entry to store the value for.
        :param key: The key of the entry to set.
        :param value: The value of the entry to set.
        :param error: If set, the value is a PendingValue that will resolve to this error.
        :param pin: If true, the entry will not be evicted until read.
        """
        assert registry_entry.cache is not None, 'Registry entry must have a cache policy to be used in a CacheStore'

        registry_store = self.registry_stores.get(registry_entry.to_store_key())

        # No store for this entry yet, create new
        if registry_store is None:
            registry_store = CacheScopeStore(registry_entry.cache)
            self.registry_stores[registry_entry.to_store_key()] = registry_store

        prev_value = await registry_store.get(key)

        # If the previous value was a PendingTask, resolve it with the new value
        # This handles cache-coordinated tasks (e.g., DerivedVariables) where PendingTasks
        # are stored in cache to coordinate multiple callers with the same cache key
        if isinstance(prev_value, PendingTask):
            prev_value.resolve(value)

        # Update size
        self._update_size(prev_value, value)
        self._update_metrics()

        await registry_store.set(key, value, pin=pin)

        return value

    async def clear(self):
        """
        Empty all stores.
        """
        for registry_store in self.registry_stores.values():
            await registry_store.clear()
        self.registry_stores = {}
        self._size = 0
        self._update_metrics()
