import abc
from collections import defaultdict
from typing import Any, DefaultDict, Dict, Literal, Optional, Tuple, Union

from pandas import DataFrame
from pydantic import BaseModel, ConfigDict, Field, SerializerFunctionWrapHandler, model_serializer

from dara.core.auth.definitions import USER
from dara.core.base_definitions import CachedRegistryEntry
from dara.core.interactivity.filtering import FilterQuery, Pagination, apply_filters, coerce_to_filter_query
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
        # TODO: maybe in endpoint, need to convert object to str etc, format_for_display
        return apply_filters(dataset, coerce_to_filter_query(filters), pagination)

    async def get_sequence_number(self, key: str) -> int:
        return self.sequence_number.get(key, 0)


class ServerVariable(AnyVariable):
    backend: ServerBackend = Field(exclude=True)
    scope: Literal['user', 'global']

    def __init__(
        self,
        default: Any,
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
    async def get_sequence_number(cls, entry: 'ServerVariableRegistryEntry'):
        """
        Internal method to get the sequence number of a server variable based in its registry entry.
        """
        key = cls.get_key(entry.backend.scope)
        return await entry.backend.get_sequence_number(key)

    @classmethod
    def get_key(cls, scope: Literal['global', 'user']):
        if scope == 'global':
            return 'global'

        user = USER.get()

        if user:
            user_key = user.identity_id or user.identity_name
            return user_key

        raise ValueError('User not found when trying to compute the key for a user-scoped store')

    @property
    def key(self):
        return self.get_key(self.scope)

    async def _notify(self):
        from dara.core.internal.registries import utils_registry

        ws_mgr: WebsocketManager = utils_registry.get('WebsocketManager')

        # Broadcast the latest sequence number to all clients for this variable
        await ws_mgr.broadcast(
            ServerVariableMessage(
                uid=self.uid,
                sequence_number=await self.backend.get_sequence_number(self.key),
            )
        )

    async def read(self):
        return await self.backend.read(self.key)

    async def write(self, value: Any):
        value = await self.backend.write(self.key, value)
        await self._notify()
        return value

    async def read_filtered(
        self, filters: Optional[Union[FilterQuery, dict]] = None, pagination: Optional[Pagination] = None
    ):
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
