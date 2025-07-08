import abc
from typing import Any, Generic, TypeVar

from dara.core.base_definitions import BaseCachePolicy

PolicyT = TypeVar('PolicyT', bound=BaseCachePolicy)


class CacheStoreImpl(abc.ABC, Generic[PolicyT]):
    def __init__(self, policy: PolicyT):
        self.policy = policy

    @abc.abstractmethod
    async def delete(self, key: str) -> Any:
        """
        Delete an entry from the cache.

        :param key: The key of the entry to delete.
        """

    @abc.abstractmethod
    async def get(self, key: str, unpin: bool = False, raise_for_missing: bool = False) -> Any:
        """
        Retrieve an entry from the cache.

        :param key: The key of the entry to retrieve.
        :param unpin: If true, the entry will be unpinned if it is pinned.
        :param raise_for_missing: If true, an exception will be raised if the entry is not found
        """

    @abc.abstractmethod
    async def set(self, key: str, value: Any, pin: bool = False):
        """
        Add an entry to the cache. Depending on the implementation might evict other entries.

        :param key: The key of the entry to set.
        :param value: The value of the entry to set.
        :param pin: If true, the entry will not be evicted until read.
        """

    @abc.abstractmethod
    async def clear(self):
        """
        Empty the store.
        """
