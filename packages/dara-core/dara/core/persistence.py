import abc
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

    # TODO: this only has a link to JS impl I guess?
    """

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

    TODO: in the future key is self.uid + user_id if scope='user'
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

    def init(self, variable: 'Variable'):
        """
        Write the default value to the store if it's not set
        """
        if self.read() is None:
            self.write(variable.default)

    def write(self, value: Any):
        """
        Persist a value to the store
        """
        return self.backend.write(self.uid, value)

    def read(self):
        """
        Read a value from the store
        """
        return self.backend.read(self.uid)

    def delete(self):
        """
        Delete the persisted value from the store
        """
        return self.backend.delete(self.uid)


class BackendStoreEntry(BaseModel):
    uid: str
    store: BackendStore
    """Store instance"""
