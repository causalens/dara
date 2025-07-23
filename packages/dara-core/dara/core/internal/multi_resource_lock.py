from collections import Counter
from contextlib import asynccontextmanager
from contextvars import ContextVar

import anyio

HAS_LOCK = ContextVar('HAS_LOCK', default=False)


class MultiResourceLock:
    """
    A class that manages multiple named locks for concurrent access to shared resources.

    This class allows for acquiring and releasing locks on named resources, ensuring
    that only one task can access a specific resource at a time. It automatically
    creates locks for new resources and cleans them up when they're no longer in use.
    """

    def __init__(self):
        self._locks: dict[str, anyio.Lock] = {}
        self._waiters = Counter[str]()
        self._cleanup_lock = anyio.Lock()

    @asynccontextmanager
    async def acquire(self, resource_name: str):
        """
        Acquire a lock for the specified resource.

        This method is an async context manager that acquires a lock for the given
        resource name. If the lock doesn't exist, it creates one. It also keeps
        track of waiters to ensure proper cleanup when the resource is no longer in use.

        :param resource_name (str): The name of the resource to lock.

        Usage:
        ```python
        async with multi_lock.acquire_lock("resource_a"):
            # Critical section for "resource_a"
            ...
        ```

        Note:
            The lock is automatically released when exiting the context manager.
        """
        # Nested acquire is a noop
        if not HAS_LOCK.get():
            HAS_LOCK.set(True)
            async with self._cleanup_lock:
                if resource_name not in self._locks:
                    self._locks[resource_name] = anyio.Lock()
                self._waiters[resource_name] += 1

            try:
                async with self._locks[resource_name]:
                    yield
            finally:
                async with self._cleanup_lock:
                    self._waiters[resource_name] -= 1
                    if self._waiters[resource_name] <= 0:
                        del self._waiters[resource_name]
                        del self._locks[resource_name]
                HAS_LOCK.set(False)
        else:
            yield
