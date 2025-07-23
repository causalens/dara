from collections import Counter
from contextlib import asynccontextmanager
from contextvars import ContextVar

import anyio

LOCKED_RESOURCES = ContextVar[set[str]]('LOCKED_RESOURCES', default=set())


class LockRecursionError(RuntimeError):
    """Raised when a lock is acquired recursively with a lock that is not re-entrant."""

    pass


class MultiResourceLock:
    """
    A class that manages multiple named locks for concurrent access to shared resources.

    This class allows for acquiring and releasing locks on named resources, ensuring
    that only one task can access a specific resource at a time. It automatically
    creates locks for new resources and cleans them up when they're no longer in use.

    :reentrant:
        If True a task can acquire the same resource more than once; every
        subsequent acquire of an already-held lock is a no-op.  If False the
        second attempt raises ``RuntimeError``.
    """

    def __init__(self, reentrant: bool = True):
        self._reentrant = reentrant
        self._locks: dict[str, anyio.Lock] = {}
        self._waiters = Counter[str]()
        self._cleanup_lock = anyio.Lock()

    def is_locked(self, resource_name: str) -> bool:
        """
        Check if a lock for the specified resource is currently held.

        :param resource_name (str): The name of the resource to check.
        :return: True if the lock is held, False otherwise.
        """
        return resource_name in self._locks and self._locks[resource_name].locked()

    def is_locked_by_current_task(self, resource_name: str) -> bool:
        """
        Check if a lock for the specified resource is currently held by the current task.

        :param resource_name (str): The name of the resource to check.
        :return: True if the lock is held by the current task, False otherwise.
        """
        return resource_name in LOCKED_RESOURCES.get()

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
        already_locked = self.is_locked_by_current_task(resource_name)

        if already_locked:
            if self._reentrant:
                yield
                return
            raise LockRecursionError(
                f'Resource {resource_name} is already locked by the current task and the lock is not re-entrant'
            )

        # add to the set of locked resources
        locked_resources = LOCKED_RESOURCES.get().copy()
        locked_resources.add(resource_name)
        LOCKED_RESOURCES.set(locked_resources)

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

                # remove from the set of locked resources
                locked_resources = LOCKED_RESOURCES.get().copy()
                locked_resources.remove(resource_name)
                LOCKED_RESOURCES.set(locked_resources)
