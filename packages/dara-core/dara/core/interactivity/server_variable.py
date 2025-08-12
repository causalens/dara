import abc
from collections import defaultdict
from typing import Any, DefaultDict, Dict, Literal, Optional, Tuple, Union

from pandas import DataFrame
from pydantic import BaseModel, ConfigDict, Field, SerializerFunctionWrapHandler, model_serializer

from dara.core.auth.definitions import USER
from dara.core.base_definitions import CachedRegistryEntry, NonTabularDataError
from dara.core.interactivity.filtering import FilterQuery, Pagination, apply_filters, coerce_to_filter_query
from dara.core.internal.pandas_utils import DataResponse, append_index, build_data_response
from dara.core.internal.utils import call_async
from dara.core.internal.websocket import ServerMessagePayload, WebsocketManager

from .any_variable import AnyVariable


class ServerVariableMessage(ServerMessagePayload):
    typ: Literal['ServerVariable'] = Field(alias='__type', default='ServerVariable')
    uid: str
    sequence_number: int


class ServerBackend(BaseModel, abc.ABC):
    scope: Literal['global', 'user']

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
    async def read_filtered(
        self, key: str, filters: Optional[Union[FilterQuery, dict]] = None, pagination: Optional[Pagination] = None
    ) -> Tuple[Optional[DataFrame], int]:
        """
        Read a value
        :param filters: filters to apply
        :param pagination: pagination to apply
        """

    @abc.abstractmethod
    async def get_sequence_number(self, key: str) -> int:
        """
        Get the sequence number for a given key
        """


class MemoryBackend(ServerBackend):
    data: Dict[str, Any] = Field(default_factory=dict)
    sequence_number: DefaultDict[str, int] = Field(default_factory=lambda: defaultdict(int))

    def __init__(self, scope: Literal['user', 'global'] = 'user'):
        super().__init__(scope=scope)

    async def write(self, key: str, value: Any):
        self.data[key] = value
        self.sequence_number[key] += 1
        return value

    async def read(self, key: str) -> Any:
        return self.data.get(key)

    async def read_filtered(
        self, key: str, filters: Optional[Union[FilterQuery, dict]] = None, pagination: Optional[Pagination] = None
    ) -> Tuple[Optional[DataFrame], int]:
        dataset = self.data.get(key)

        # print user-friendly error message if the data is not a DataFrame
        # most likely due to user passing a non-tabular server variable to e.g. a Table
        if dataset is not None and not isinstance(dataset, DataFrame):
            raise NonTabularDataError(
                f'Failed to retrieve ServerVariable tabular data, expected pandas.DataFrame, got {type(dataset)}'
            )

        dataset = append_index(dataset)
        return apply_filters(dataset, coerce_to_filter_query(filters), pagination)

    async def get_sequence_number(self, key: str) -> int:
        return self.sequence_number[key]


class ServerVariable(AnyVariable):
    """
    A ServerVariable represents server-side data that is synchronized with the client.

    Unlike Variables with BackendStore (which are client state persisted on server),
    ServerVariable holds data that originates and is managed on the server, with
    clients receiving reactive updates when the data changes.

    ServerVariable can store any Python object, including non-serializable data like
    database connections, ML models, or complex objects.

    However, when used with components expecting tabular data (like Table), the data must be
    serializable or a NonTabularDataError will be raised. The default backend implementation
    expects the tabular data to be a pandas DataFrame. To support other data types, you can
    implement a custom backend that translates the data into a filtered DataFrame in the
    `read_filtered` method.

    ```python
    import pandas as pd
    from dara.core import ServerVariable, action
    from dara.core.interactivity.server_variable import ServerBackend
    from sklearn.ensemble import RandomForestClassifier

    # Basic usage with DataFrame
    data = ServerVariable(pd.DataFrame({'a': [1, 2, 3]}))

    # Non-serializable data (ML model)
    model = ServerVariable(trained_sklearn_model, scope='global')

    # Custom backend
    class DatabaseBackend(ServerBackend):
        # ... implements all the methods as DB operations

    data = ServerVariable(backend=DatabaseBackend(...))

    # User-specific data
    user_prefs = ServerVariable(scope='user')

    @action
    async def on_click(ctx):
        # write to the data for the user who initiated the action
        await user_prefs.write('dark')
    ```

    :param default: Initial value for the variable (global scope only)
    :param backend: Custom backend for data storage and retrieval
    :param scope: 'global' (shared across all users) or 'user' (per-user data)
    """

    backend: ServerBackend = Field(exclude=True)
    scope: Literal['user', 'global']

    def __init__(
        self,
        default: Optional[Any] = None,
        backend: Optional[ServerBackend] = None,
        scope: Literal['user', 'global'] = 'global',
        uid: Optional[str] = None,
        **kwargs,
    ) -> None:
        from dara.core.internal.registries import server_variable_registry

        if backend is None:
            backend = MemoryBackend(scope=scope)

        if default is not None:
            assert scope == 'global', (
                'ServerVariable can only be used with global scope, cannot initialize user-specific values'
            )
            call_async(backend.write, 'global', default)

        super().__init__(uid=uid, backend=backend, scope=scope, **kwargs)

        var_entry = ServerVariableRegistryEntry(uid=str(self.uid), backend=backend)
        server_variable_registry.register(str(self.uid), var_entry)

    @classmethod
    async def get_value(cls, entry: 'ServerVariableRegistryEntry'):
        """
        Internal method to get the value of a server variable based in its registry entry.
        """
        key = cls.get_key(entry.backend.scope)
        return await entry.backend.read(key)

    @classmethod
    async def write_value(cls, entry: 'ServerVariableRegistryEntry', value: Any):
        """
        Internal method to write the value of a server variable based in its registry entry.
        """
        key = cls.get_key(entry.backend.scope)
        await entry.backend.write(key, value)
        await cls._notify(entry.uid, key, entry.backend)

    @classmethod
    async def get_sequence_number(cls, entry: 'ServerVariableRegistryEntry'):
        """
        Internal method to get the sequence number of a server variable based in its registry entry.
        """
        key = cls.get_key(entry.backend.scope)
        return await entry.backend.get_sequence_number(key)

    @classmethod
    async def get_tabular_data(
        cls,
        entry: 'ServerVariableRegistryEntry',
        filters: Optional[FilterQuery] = None,
        pagination: Optional[Pagination] = None,
    ) -> DataResponse:
        """
        Internal method to get tabular data from the backend
        """
        key = cls.get_key(entry.backend.scope)
        data, count = await entry.backend.read_filtered(key, filters, pagination)
        if data is None:
            return DataResponse(data=None, count=0, schema=None)
        return build_data_response(data, count)

    @classmethod
    def get_key(cls, scope: Literal['global', 'user']):
        """
        Resolve the key for the given scope

        :param scope: the scope to resolve the key for
        """
        if scope == 'global':
            return 'global'

        user = USER.get()

        if user:
            return user.identity_id

        raise ValueError('User not found when trying to compute the key for a user-scoped store')

    @property
    def key(self):
        """
        Current key for the backend
        """
        return self.get_key(self.scope)

    @classmethod
    async def _notify(cls, uid: str, key: str, backend: ServerBackend):
        """
        Internal method to notify clients of a change in the value

        :param uid: the uid of the variable
        :param key: the key for the backend
        :param backend: the backend instance
        """
        from dara.core.internal.registries import utils_registry

        ws_mgr: WebsocketManager = utils_registry.get('WebsocketManager')

        message = ServerVariableMessage(uid=uid, sequence_number=await backend.get_sequence_number(key))

        if backend.scope == 'global':
            return await ws_mgr.broadcast(message)

        user = USER.get()
        assert user is not None, 'User not found when trying to send notification'
        user_id = user.identity_id
        return await ws_mgr.send_message_to_user(user_id, message)

    def update(self, value: Any):
        """
        Create an action to update the value of this Variable to a provided value.

        ```python
        import pandas as pd
        from dara.core import ServerVariable
        from dara.components import Button

        data = ServerVariable(pd.DataFrame({'a': [1, 2, 3]}))

        Button(
            'Empty Data',
            onclick=data.update(None),
        )

        ```
        """
        from dara.core.interactivity.actions import UpdateVariableImpl

        return UpdateVariableImpl(variable=self, value=value)

    def reset(self):
        raise NotImplementedError('ServerVariable does not support reset')

    async def read(self):
        """
        Read the current value from the backend.
        Depending on the scope, the value will be global or user-specific.
        """
        return await self.backend.read(self.key)

    async def write(self, value: Any):
        """
        Write a new value to the backend.
        Depending on the scope, the value will be global or user-specific.

        :param value: the new value to write
        """
        value = await self.backend.write(self.key, value)
        await self._notify(self.uid, self.key, self.backend)
        return value

    async def read_filtered(
        self, filters: Optional[Union[FilterQuery, dict]] = None, pagination: Optional[Pagination] = None
    ):
        """
        Read a filtered value from the backend.
        Depending on the scope, the value will be global or user-specific.

        :param filters: the filters to apply
        :param pagination: the pagination to apply
        """
        return await self.backend.read_filtered(self.key, filters, pagination)

    @model_serializer(mode='wrap')
    def ser_model(self, nxt: SerializerFunctionWrapHandler) -> dict:
        parent_dict = nxt(self)
        return {**parent_dict, '__typename': 'ServerVariable', 'uid': str(parent_dict['uid'])}


class ServerVariableRegistryEntry(CachedRegistryEntry):
    """
    Registry entry for ServerVariable.
    """

    backend: ServerBackend
    """
    Backend instance
    """

    model_config = ConfigDict(extra='forbid', arbitrary_types_allowed=True)
