import abc
import json
import os
from collections.abc import Awaitable
from typing import (
    TYPE_CHECKING,
    Any,
    Callable,
    Dict,
    List,
    Literal,
    Optional,
    Set,
    Union,
)
from uuid import uuid4

import aiorwlock
import anyio
import jsonpatch
from pydantic import (
    BaseModel,
    Field,
    PrivateAttr,
    SerializerFunctionWrapHandler,
    field_validator,
    model_serializer,
)

from dara.core.auth.definitions import USER
from dara.core.internal.utils import run_user_handler
from dara.core.logging import dev_logger

if TYPE_CHECKING:
    from dara.core.interactivity.plain_variable import Variable
    from dara.core.internal.websocket import WebsocketManager


class PersistenceBackend(BaseModel, abc.ABC):
    """
    Abstract base class for a BackendStore backend.
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

    async def subscribe(self, on_value: Callable[[str, Any], Awaitable[None]]):
        """
        Subscribe to changes in the backend. Called with a callback that should be invoked whenever a value is updated.
        """
        # Default implementation does nothing, not all backends need to support this


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

    @field_validator('path', check_fields=True)
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

    @model_serializer(mode='wrap')
    def ser_model(self, nxt: SerializerFunctionWrapHandler) -> dict:
        parent_dict = nxt(self)
        parent_dict['__typename'] = self.__class__.__name__
        return parent_dict


class BackendStore(PersistenceStore):
    """
    Persistence store implementation that uses a backend implementation to store data server-side

    :param uid: unique identifier for this store; defaults to a random UUID
    :param backend: the backend to use for storing data; defaults to an in-memory backend
    :param scope: the scope for the store; if 'global' a single value is stored for all users,
        if 'user' a value is stored per user
    :param readonly: whether to use the backend in read-only mode, i.e. skip syncing values from client to backend and raise if write()/delete() is called
    """

    uid: str = Field(default_factory=lambda: str(uuid4()))
    backend: PersistenceBackend = Field(default_factory=InMemoryBackend, exclude=True)
    scope: Literal['global', 'user'] = 'global'
    readonly: bool = False

    default_value: Any = Field(default=None, exclude=True)
    initialized_scopes: Set[str] = Field(default_factory=set, exclude=True)
    sequence_number: Dict[str, int] = Field(
        default_factory=dict, exclude=True
    )  # Track sequence numbers per user for patch validation

    def __init__(
        self,
        backend: Optional[PersistenceBackend] = None,
        uid: Optional[str] = None,
        scope: Optional[str] = None,
        readonly: bool = False,
    ):
        """
        Persistence store implementation that uses a backend implementation to store data server-side

        :param uid: unique identifier for this store; defaults to a random UUID
        :param backend: the backend to use for storing data; defaults to an in-memory backend
        :param scope: the scope for the store; if 'global' a single value is stored for all users,
            if 'user' a value is stored per user
        :param readonly: whether to use the backend in read-only mode, i.e. skip syncing values from client to backend and raise if write()/delete() is called
        """
        kwargs: Dict[str, Any] = {}
        if backend:
            kwargs['backend'] = backend

        if uid:
            kwargs['uid'] = uid

        if scope:
            kwargs['scope'] = scope

        if readonly:
            kwargs['readonly'] = readonly

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
                    # Initialize sequence number for this key
                    self.sequence_number[key] = 0

            return key

        user = USER.get()

        if user:
            user_key = user.identity_id

            # Make sure the store is initialized
            if user_key not in self.initialized_scopes:
                self.initialized_scopes.add(user_key)
                if not await run_user_handler(self.backend.has, args=(user_key,)):
                    await run_user_handler(self.backend.write, (user_key, self.default_value))
                    # Initialize sequence number for this key
                    self.sequence_number[user_key] = 0

            return user_key

        raise ValueError('User not found when trying to compute the key for a user-scoped store')

    def _get_user(self, key: str) -> Optional[str]:
        """
        Get the user for a given key. Returns None if the key is global.
        Reverts the `_get_key` method to get the user for a given key.
        """
        if key == 'global':
            return None

        # otherwise key is a user identity_id
        return key

    def _register(self):
        """
        Register this store in the backend store registry.
        Warns if the uid is not unique, i.e. another store with the same uid already exists.

        :return: True if the store was registered, False if it was already registered previously
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
            return True
        except ValueError:
            dev_logger.info(f'BackendStore with uid "{self.uid}" already exists, reusing the same instance')
            return False

    @property
    def ws_mgr(self) -> 'WebsocketManager':
        from dara.core.internal.registries import utils_registry

        return utils_registry.get('WebsocketManager')

    def _create_msg(self, scope_key: str, **payload) -> Dict[str, Any]:
        """
        Create a message to send to the frontend.
        :param scope_key: scope key for sequence number
        :param payload: either value=... or patches=...
        """
        if not payload or len(payload) != 1:
            raise ValueError("Exactly one of 'value' or 'patches' must be provided")

        return {
            'store_uid': self.uid,
            'sequence_number': self.sequence_number.get(scope_key, 0),
            **payload,
        }

    def _get_next_sequence_number(self, key: str) -> int:
        """
        Get the next sequence number for this store.

        :param key: key for the store
        """
        current = self.sequence_number.get(key, 0)
        self.sequence_number[key] = current + 1
        return self.sequence_number[key]

    async def _notify_user(self, user_identifier: str, ignore_channel: Optional[str] = None, **payload):
        """
        Notify a given user about updates to this store.
        :param user_identifier: user to notify
        :param ignore_channel: if specified, ignore the specified channel
        :param payload: either value=... or patches=...
        """
        return await self.ws_mgr.send_message_to_user(
            user_identifier,
            self._create_msg(user_identifier, **payload),
            ignore_channel=ignore_channel,
        )

    async def _notify_global(self, ignore_channel: Optional[str] = None, **payload):
        """
        Notify all users about updates to this store.
        :param ignore_channel: if specified, ignore the specified channel
        :param payload: either value=... or patches=...
        """
        return await self.ws_mgr.broadcast(
            self._create_msg('global', **payload),
            ignore_channel=ignore_channel,
        )

    async def _notify_value(self, value: Any, ignore_channel: Optional[str] = None):
        """
        Notify all clients about the new value for this store.
        Broadcasts to all users if scope is global or sends to the current user if scope is user.

        :param value: value to notify about
        :param ignore_channel: if passed, ignore the specified channel when broadcasting
        """
        if self.scope == 'global':
            return await self._notify_global(value=value, ignore_channel=ignore_channel)

        # For user scope, we need to find channels for the user and notify them
        user = USER.get()

        if not user:
            return

        user_identifier = user.identity_id
        return await self._notify_user(user_identifier, value=value, ignore_channel=ignore_channel)

    async def _notify_patches(self, patches: List[Dict[str, Any]]):
        """
        Notify all clients about partial updates to this store.
        Broadcasts to all users if scope is global or sends to the current user if scope is user.

        :param patches: list of JSON patch operations
        """
        if self.scope == 'global':
            return await self._notify_global(patches=patches)

        # For user scope, we need to find channels for the user and notify them
        user = USER.get()

        if not user:
            return

        user_identifier = user.identity_id
        return await self._notify_user(user_identifier, patches=patches)

    async def init(self, variable: 'Variable'):
        """
        Write the default value to the store if it's not set

        :param variable: the variable to initialize the store for
        """
        self.default_value = variable.default

        # only if successfully registered, subscribe to the backend - this makes sure we do it once
        if self._register():

            async def _on_value(key: str, value: Any):
                # here we explicitly DON'T ignore the current channel, in case we created this variable inside e.g. a py_component we want to notify its creator as well
                if user := self._get_user(key):
                    return await self._notify_user(user, value=value)
                return await self._notify_global(value=value)

            await self.backend.subscribe(_on_value)

    async def write_partial(self, data: Union[List[Dict[str, Any]], Any], notify: bool = True):
        """
        Apply partial updates to the store using JSON Patch operations or automatic diffing.

        If scope='user', the patches are applied for the current user so the method can only
        be used in authenticated contexts.

        :param data: Either a list of JSON patch operations (RFC 6902) or a full object to diff against current value
        :param notify: whether to broadcast the patches to clients
        """
        if self.readonly:
            raise ValueError('Cannot write to a read-only store')

        key = await self._get_key()

        # Read current value
        current_value = await run_user_handler(self.backend.read, (key,))

        if current_value is None:
            # If no current value, create an empty dict as the base
            current_value = {}

        # Determine if data is patches or a full object
        if isinstance(data, list) and all(isinstance(item, dict) and 'op' in item for item in data):
            # Data is a list of patch operations
            patches = data

            if not isinstance(current_value, (dict, list)):
                # JSON patches can only be applied to structured data (objects/arrays)
                raise ValueError(
                    f'Cannot apply JSON patches to non-structured data. '
                    f'Current value is of type {type(current_value).__name__}, but patches require dict or list.'
                )

            # Apply patches to current value
            try:
                updated_value = jsonpatch.apply_patch(current_value, patches)
            except (jsonpatch.InvalidJsonPatch, jsonpatch.JsonPatchException) as e:
                raise ValueError(f'Invalid JSON patch operation: {e}') from e
        else:
            # Data is a full object - generate patches by diffing
            patches = jsonpatch.make_patch(current_value, data).patch
            updated_value = data

        # Write updated value back to store
        await run_user_handler(self.backend.write, (key, updated_value))
        # Increment sequence number for this update
        self._get_next_sequence_number(key)

        if notify:
            # Notify clients about the patches, not the full value
            await self._notify_patches(patches)

        return updated_value

    async def write(self, value: Any, notify=True, ignore_channel: Optional[str] = None):
        """
        Persist a value to the store.

        If scope='user', the value is written for the current user so the method can only
        be used in authenticated contexts.

        :param value: value to write
        :param notify: whether to broadcast the new value to clients
        :param ignore_channel: if passed, ignore the specified websocket channel when broadcasting
        """
        if self.readonly:
            raise ValueError('Cannot write to a read-only store')

        key = await self._get_key()

        res = await run_user_handler(self.backend.write, (key, value))
        # Increment sequence number for this update
        self._get_next_sequence_number(key)

        if notify:
            await self._notify_value(value, ignore_channel=ignore_channel)

        return res

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
        if self.readonly:
            raise ValueError('Cannot delete from a read-only store')

        key = await self._get_key()
        if notify:
            # Schedule notification on delete
            await self._notify_value(None)
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


class BrowserStore(PersistenceStore):
    """
    Persistence store implementation that uses browser local storage
    """

    async def init(self, variable: 'Variable'):
        # noop
        pass


class QueryParamStore(PersistenceStore):
    """
    Persistence store implementation that uses a URL query parameter
    """

    query: str

    async def init(self, variable: 'Variable'):
        # noop
        pass
