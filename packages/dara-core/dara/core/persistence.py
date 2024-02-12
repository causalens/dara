import abc
import asyncio
import uuid
from typing import TYPE_CHECKING, Any

from pydantic import BaseModel, Field

if TYPE_CHECKING:
    from dara.core.interactivity.plain_variable import Variable


class PersistenceBackend(BaseModel, abc.ABC):
    """
    Abstract base class for a BackendStore backend

    Warning: the API is not stable yet and may change in the future
    """

    @abc.abstractmethod
    def write(self, key: str, value: Any):
        """
        Persist a value
        """
        pass

    @abc.abstractmethod
    def read(self, key: str) -> Any:
        """
        Read a value
        """
        pass

    @abc.abstractmethod
    def delete(self, key: str):
        """
        Delete a value
        """
        pass


class InMemoryBackend(PersistenceBackend):
    """
    In-memory persistence backend
    """

    data: dict[str, Any] = Field(default_factory=dict)

    def write(self, key: str, value: Any):
        self.data[key] = value

    def read(self, key: str):
        return self.data.get(key)

    def delete(self, key: str):
        if key in self.data:
            del self.data[key]


class PersistenceStore(BaseModel, abc.ABC):
    """
    Base class for a variable persistence store
    """

    # TODO: if need be this can also hold a reference to js impl

    @abc.abstractmethod
    def init(self, variable: 'Variable'):
        """
        Initialize the store when connecting to a variable
        """
        pass

    def dict(self, *args, **kwargs):
        parent_dict = super().dict(*args, **kwargs)
        parent_dict['__typename'] = self.__class__.__name__
        return parent_dict


class BackendStore(PersistenceStore):
    """
    Persistence store implementation that uses a backend to store data server-side

    """

    uid: str
    backend: PersistenceBackend

    def __init__(self, backend: PersistenceBackend, uid: str):
        super().__init__(backend=backend, uid=uid)

        from dara.core.internal.registries import backend_store_registry

        try:
            backend_store_registry.register(
                self.uid,
                BackendStoreEntry(
                    uid=self.uid,
                    store=self,
                ),
            )
        except ValueError as e:
            raise ValueError('BackendStore uid must be unique') from e

    async def _notify(self, value: Any):
        """
        Notify all clients about the new value for this store
        """
        from dara.core.internal.registries import utils_registry
        from dara.core.internal.websocket import WebsocketManager

        ws_mgr: WebsocketManager = utils_registry.get('WebsocketManager')
        await ws_mgr.broadcast({'store_uid': self.uid, 'value': value})

    def init(self, variable: 'Variable'):
        """
        Write the default value to the store if it's not set
        """
        if self.read() is None:
            self.write(variable.default, notify=False)

    def write(self, value: Any, notify=True):
        """
        Persist a value to the store
        """
        if notify:
            # Schedule notification on write
            asyncio.create_task(self._notify(value))

        # TODO: in the future key can be self.uid + user_id if scope='user'
        return self.backend.write(self.uid, value)

    def read(self):
        """
        Read a value from the store
        """
        return self.backend.read(self.uid)

    def delete(self, notify=True):
        """
        Delete the persisted value from the store
        """
        if notify:
            # Schedule notification on delete
            asyncio.create_task(self._notify(None))
        return self.backend.delete(self.uid)


class BackendStoreEntry(BaseModel):
    uid: str
    store: BackendStore
    """Store instance"""
