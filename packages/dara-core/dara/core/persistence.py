import abc
import json
import os
from typing import TYPE_CHECKING, Any, Dict, Literal, Set
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
    """

    uid: str = Field(default_factory=lambda: str(uuid4()))
    backend: PersistenceBackend = Field(default_factory=InMemoryBackend, exclude=True)
    scope: Literal['global', 'user'] = 'global'

    _default_value: Any = PrivateAttr(default=None)
    _initialized_scopes: Set[str] = PrivateAttr(default_factory=set)

    async def _get_key(self):
        """
        Get the key for this store
        """
        if self.scope == 'global':
            key = self.uid

            # Make sure the store is initialized
            if 'global' not in self._initialized_scopes:
                self._initialized_scopes.add('global')
                await run_user_handler(self.backend.write, (key, self._default_value))

            return key

        user = USER.get()

        if user:
            user_key = user.identity_id or user.identity_name
            key = f'{user_key}:{self.uid}'

            # Make sure the store is initialized
            if user_key not in self._initialized_scopes:
                self._initialized_scopes.add(user_key)
                await run_user_handler(self.backend.write, (key, self._default_value))

            return key

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
        from dara.core.internal.registries import (
            sessions_registry,
            utils_registry,
            websocket_registry,
        )
        from dara.core.internal.websocket import WebsocketManager

        ws_mgr: WebsocketManager = utils_registry.get('WebsocketManager')

        if self.scope == 'global':
            return await ws_mgr.broadcast({'store_uid': self.uid, 'value': value})

        # For user scope, we need to find channels for the user and notify them
        user = USER.get()

        if not user:
            return

        user_identifier = user.identity_id or user.identity_name
        if sessions_registry.has(user_identifier):
            user_sessions = sessions_registry.get(user_identifier)

            channels: Set[str] = set()
            for session_id in user_sessions:
                if websocket_registry.has(session_id):
                    channels |= websocket_registry.get(session_id)

            # Notify all channels
            async with anyio.create_task_group() as tg:
                for channel in channels:
                    tg.start_soon(ws_mgr.send_message, channel, {'store_uid': self.uid, 'value': value})

    async def init(self, variable: 'Variable'):
        """
        Write the default value to the store if it's not set

        :param variable: the variable to initialize the store for
        """
        self._register()
        self._default_value = variable.default

    async def write(self, value: Any, notify=True):
        """
        Persist a value to the store

        :param value: value to write
        :param notify: whether to broadcast the new value to clients
        """
        key = await self._get_key()

        if notify:
            await self._notify(value)

        return await run_user_handler(self.backend.write, (key, value))

    async def read(self):
        """
        Read a value from the store
        """

        key = await self._get_key()
        return await run_user_handler(self.backend.read, (key,))

    async def delete(self, notify=True):
        """
        Delete the persisted value from the store

        :param notify: whether to broadcast that the value was deleted to clients
        """
        key = await self._get_key()
        if notify:
            # Schedule notification on delete
            await self._notify(None)
        return await run_user_handler(self.backend.delete, (key,))

    async def get_all(self):
        """
        Get all the values from the store
        """
        all_data = await run_user_handler(self.backend.get_all)

        # Clean keys to be just user ids
        if self.scope == 'user':
            return {k.split(':')[0]: v for k, v in all_data.items()}

        return all_data


class BackendStoreEntry(BaseModel):
    uid: str
    store: BackendStore
    """Store instance"""
