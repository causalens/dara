from typing import Any, Dict, Generic

from dara.core.base_definitions import CachedRegistryEntry, KeepAllCachePolicy, LruCachePolicy, MostRecentCachePolicy
from dara.core.internal.cache_store.base_impl import CacheStoreImpl, PolicyT
from dara.core.internal.cache_store.lru import LRUCache
from dara.core.internal.cache_store.keep_all import KeepAllCache
from dara.core.internal.utils import CacheScope, get_cache_scope


def cache_impl_for_policy(policy: PolicyT) -> CacheStoreImpl[PolicyT]:
    """
    Get a cache implementation depending on the policy
    """
    if isinstance(policy, LruCachePolicy) or isinstance(policy, MostRecentCachePolicy):
        return LRUCache(policy) # type: ignore
    elif isinstance(policy, KeepAllCachePolicy):
        return KeepAllCache(policy)  # type: ignore
    else:
        raise NotImplementedError(f"No cache implementation available for policy: {policy}")

class CacheScopeStore(Generic[PolicyT]):
    """
    A Cache Scope aware store.
    Depending on the policy will store a different cache implementation per entry.
    Keeps entries scoped to the cache scope of current execution.
    """
    def __init__(self, policy: PolicyT):
        self.caches: Dict[CacheScope, CacheStoreImpl[PolicyT]] = {}
        self.policy = policy

    async def get(self, key: str):
        """
        Retrieve an entry from the cache.
        """
        scope = get_cache_scope(self.policy.cache_type)
        cache = self.caches.get(scope)

        # No cache for this scope yet
        if cache is None:
            return None

        return await cache.get(key)


    async def set(self, key: str, value: Any):
        """
        Add an entry to the cache. Depending on the implementation might evict other entries.
        """
        scope = get_cache_scope(self.policy.cache_type)
        cache = self.caches.get(scope)

        # No cache for this scope yet, create new
        if cache is None:
            cache = cache_impl_for_policy(self.policy)
            self.caches[scope] = cache

        await cache.set(key, value)

        return value



class CacheStore:
    def __init__(self):
        self.registry_stores: Dict[str, CacheScopeStore] = {}

    async def get(self, registry_entry: CachedRegistryEntry, key: str):
        """
        Retrieve an entry from the cache for the given registry entry and cache key.
        """
        registry_store = self.registry_stores.get(registry_entry.to_store_key())

        # No store for this entry yet
        if registry_store is None:
            return None

        return await registry_store.get(key)

    async def set(self, registry_entry: CachedRegistryEntry, key: str, value: Any):
        """
        Add an entry to the cache for the given registry entry and cache key.
        """
        registry_store = self.registry_stores.get(registry_entry.to_store_key())

        # No store for this entry yet, create new
        if registry_store is None:
            registry_store = CacheScopeStore(registry_entry.cache)
            self.registry_stores[registry_entry.to_store_key()] = registry_store

        await registry_store.set(key, value)

        return value
