import abc
from typing import TYPE_CHECKING, Any, Dict
from uuid import uuid4

from pydantic import BaseModel, Field

from dara.core.internal.utils import run_user_handler

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

    @abc.abstractmethod
    def read(self, key: str) -> Any:
        """
        Read a value
        """

    @abc.abstractmethod
    def delete(self, key: str):
        """
        Delete a value
        """


class InMemoryBackend(PersistenceBackend):
    """
    In-memory persistence backend
    """

    data: Dict[str, Any] = Field(default_factory=dict)

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
    async def init(self, variable: 'Variable'):
        """
        Initialize the store when connecting to a variable
        """

    def dict(self, *args, **kwargs):
        parent_dict = super().dict(*args, **kwargs)
        parent_dict['__typename'] = self.__class__.__name__
        return parent_dict


class BackendStore(PersistenceStore):
    """
    Persistence store implementation that uses a backend implementation to store data server-side
    """

    uid: str = Field(default_factory=lambda: str(uuid4()))
    backend: PersistenceBackend = Field(default_factory=InMemoryBackend, exclude=True)

    def _register(self):
        """
        Register this store in the backend store registry.
        Raises ValueError if the uid is not unique, i.e. another store with the same uid already exists
        """
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

        :param value: value to notify about
        """
        from dara.core.internal.registries import utils_registry
        from dara.core.internal.websocket import WebsocketManager

        ws_mgr: WebsocketManager = utils_registry.get('WebsocketManager')
        await ws_mgr.broadcast({'store_uid': self.uid, 'value': value})

    async def init(self, variable: 'Variable'):
        """
        Write the default value to the store if it's not set

        :param variable: the variable to initialize the store for
        """
        self._register()

        if await self.read() is None:
            await self.write(variable.default, notify=False)

    async def write(self, value: Any, notify=True):
        """
        Persist a value to the store

        :param value: value to write
        :param notify: whether to broadcast the new value to clients
        """
        if notify:
            # Schedule notification on write
            await self._notify(value)

        # TODO: in the future key can be self.uid + user_id if scope='user'
        return await run_user_handler(self.backend.write, (self.uid, value))

    async def read(self):
        """
        Read a value from the store
        """
        return await run_user_handler(self.backend.read, (self.uid,))

    async def delete(self, notify=True):
        """
        Delete the persisted value from the store

        :param notify: whether to broadcast that the value was deleted to clients
        """
        if notify:
            # Schedule notification on delete
            await self._notify(None)
        return await run_user_handler(self.backend.delete, (self.uid,))


class BackendStoreEntry(BaseModel):
    uid: str
    store: BackendStore
    """Store instance"""
