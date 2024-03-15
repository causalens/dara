import abc
import json
import os
from typing import TYPE_CHECKING, Any, Dict, Literal, Optional, Set
from uuid import uuid4

import aiorwlock
import anyio
from pydantic import BaseModel, Field, PrivateAttr, validator

from dara.core.auth.definitions import USER
from dara.core.internal.utils import run_user_handler

if TYPE_CHECKING:
    from dara.core.interactivity.plain_variable import Variable


class PersistenceBackend(BaseModel, abc.ABC):
    """
    Abstract base class for a BackendStore backend

    Warning: the API is not stable yet and may change in the future
    """

    @abc.abstractmethod
    async def has(self, key: str) -> bool:
        """
        Check if a key exists
        """

    @abc.abstractmethod
    async def write(self, key: str, value: Any):
        """
        Persist a value
        """

    @abc.abstractmethod
    async def read(self, key: str) -> Any:
        """
        Read a value
        """

    @abc.abstractmethod
    async def delete(self, key: str):
        """
        Delete a value
        """

    @abc.abstractmethod
    async def get_all(self) -> Dict[str, Any]:
        """
        Get all the values as a dictionary of key-value pairs
        """


class InMemoryBackend(PersistenceBackend):
    """
    In-memory persistence backend
    """

    data: Dict[str, Any] = Field(default_factory=dict)

    async def has(self, key: str) -> bool:
        return key in self.data

    async def write(self, key: str, value: Any):
        self.data[key] = value

    async def read(self, key: str):
        return self.data.get(key)

    async def delete(self, key: str):
        if key in self.data:
            del self.data[key]

    async def get_all(self):
        return self.data.copy()


class FileBackend(PersistenceBackend):
    """
    File persistence backend implementation.

    Stores data in a JSON file
    """

    path: str
    _lock: aiorwlock.RWLock = PrivateAttr(default_factory=aiorwlock.RWLock)

    @validator('path', check_fields=True)
    @classmethod
    def validate_path(cls, value):
        if not os.path.splitext(value)[1] == '.json':
            raise ValueError('FileBackend path must be a .json file')
        return value

    async def _read_data(self):
        async with await anyio.open_file(self.path, 'r') as f:
            content = await f.read()
            return json.loads(content) if content else {}

    async def _write_data(self, data: Dict[str, Any]):
        async with await anyio.open_file(self.path, 'w') as f:
            await f.write(json.dumps(data))

    async def has(self, key: str) -> bool:
        if not os.path.exists(self.path):
            return False

        async with self._lock.reader:
            data = await self._read_data()
            return key in data

    async def write(self, key: str, value: Any):
        async with self._lock.writer:
            data = await self._read_data() if os.path.exists(self.path) else {}
            data[key] = value
            await self._write_data(data)

    async def read(self, key: str):
        if not os.path.exists(self.path):
            return None

        async with self._lock.reader:
            data = await self._read_data()
            return data.get(key)

    async def delete(self, key: str):
        async with self._lock.writer:
            data = await self._read_data()
            if key in data:
                del data[key]
                await self._write_data(data)

    async def get_all(self):
        async with self._lock.reader:
            return await self._read_data()


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

    :param uid: unique identifier for this store; defaults to a random UUID
    :param backend: the backend to use for storing data; defaults to an in-memory backend
    :param scope: the scope for the store; if 'global' a single value is stored for all users,
        if 'user' a value is stored per user
    """

    uid: str = Field(default_factory=lambda: str(uuid4()))
    backend: PersistenceBackend = Field(default_factory=InMemoryBackend, exclude=True)
    scope: Literal['global', 'user'] = 'global'

    default_value: Any = Field(default=None, exclude=True)
    initialized_scopes: Set[str] = Field(default_factory=set, exclude=True)

    def __init__(
        self, backend: Optional[PersistenceBackend] = None, uid: Optional[str] = None, scope: Optional[str] = None
    ):
        """
        Persistence store implementation that uses a backend implementation to store data server-side

        :param uid: unique identifier for this store; defaults to a random UUID
        :param backend: the backend to use for storing data; defaults to an in-memory backend
        :param scope: the scope for the store; if 'global' a single value is stored for all users,
            if 'user' a value is stored per user
        """
        kwargs: Dict[str, Any] = {}
        if backend:
            kwargs['backend'] = backend

        if uid:
            kwargs['uid'] = uid

        if scope:
            kwargs['scope'] = scope

        super().__init__(**kwargs)

    async def _get_key(self):
        """
        Get the key for this store
        """
        if self.scope == 'global':
            key = 'global'

            # Make sure the store is initialized
            if 'global' not in self.initialized_scopes:
                self.initialized_scopes.add('global')
                if not await run_user_handler(self.backend.has, args=(key,)):
                    await run_user_handler(self.backend.write, (key, self.default_value))

            return key

        user = USER.get()

        if user:
            user_key = user.identity_id or user.identity_name

            # Make sure the store is initialized
            if user_key not in self.initialized_scopes:
                self.initialized_scopes.add(user_key)
                if not await run_user_handler(self.backend.has, args=(user_key,)):
                    await run_user_handler(self.backend.write, (user_key, self.default_value))

            return user_key

        raise ValueError('User not found when trying to compute the key for a user-scoped store')

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
        msg = {'store_uid': self.uid, 'value': value}

        if self.scope == 'global':
            return await ws_mgr.broadcast(msg)

        # For user scope, we need to find channels for the user and notify them
        user = USER.get()

        if not user:
            return

        user_identifier = user.identity_id or user.identity_name
        return await ws_mgr.send_message_to_user(user_identifier, msg)

    async def init(self, variable: 'Variable'):
        """
        Write the default value to the store if it's not set

        :param variable: the variable to initialize the store for
        """
        self._register()
        self.default_value = variable.default

    async def write(self, value: Any, notify=True):
        """
        Persist a value to the store.

        If scope='user', the value is written for the current user so the method can only
        be used in authenticated contexts.

        :param value: value to write
        :param notify: whether to broadcast the new value to clients
        """
        key = await self._get_key()

        if notify:
            await self._notify(value)

        return await run_user_handler(self.backend.write, (key, value))

    async def read(self):
        """
        Read a value from the store.

        If scope='user', the value is read for the current user so the method can only
        be used in authenticated contexts.

        """

        key = await self._get_key()
        return await run_user_handler(self.backend.read, (key,))

    async def delete(self, notify=True):
        """
        Delete the persisted value from the store

        If scope='user', the value is deleted for the current user so the method can only
        be used in authenticated contexts.


        :param notify: whether to broadcast that the value was deleted to clients
        """
        key = await self._get_key()
        if notify:
            # Schedule notification on delete
            await self._notify(None)
        return await run_user_handler(self.backend.delete, (key,))

    async def get_all(self) -> Dict[str, Any]:
        """
        Get all the values from the store as a dictionary of key-value pairs.

        For global scope, the dictionary contains a single key-value pair `{'global': value}`.
        For user scope, the dictionary contains a key-value pair for each user `{'user1': value1, 'user2': value2, ...}`.
        """
        return await run_user_handler(self.backend.get_all)


class BackendStoreEntry(BaseModel):
    uid: str
    store: BackendStore
    """Store instance"""
