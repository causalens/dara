import abc
from typing import Any, Dict, Literal, Optional, Tuple, Union

from pandas import DataFrame
from pydantic import BaseModel

from dara.core.auth.definitions import USER
from dara.core.interactivity.filtering import FilterQuery, Pagination, apply_filters, coerce_to_filter_query

from .any_variable import AnyVariable


class ServerBackend(BaseModel, abc.ABC):
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


class MemoryBackend(ServerBackend):
    def __init__(self, scope: Literal['user', 'global'] = 'user'):
        self.scope = scope
        self.data: Dict[str, Any] = {}

    async def write(self, key: str, value: Any):
        self.data[key] = value
        return value

    async def read(self, key: str) -> Any:
        return self.data.get(key)

    async def read_filtered(
        self, key: str, filters: Optional[Union[FilterQuery, dict]] = None, pagination: Optional[Pagination] = None
    ) -> Tuple[Optional[DataFrame], int]:
        dataset = self.data.get(key)
        # TODO: maybe in endpoint, need to convert object to str etc, format_for_display
        return apply_filters(dataset, coerce_to_filter_query(filters), pagination)


class ServerVariable(AnyVariable):
    backend: ServerBackend
    scope: Literal['user', 'global']

    def __init__(
        self,
        default: Any,
        backend: Optional[ServerBackend] = None,
        scope: Literal['user', 'global'] = 'user',
        uid: Optional[str] = None,
        **kwargs,
    ) -> None:
        if backend is None:
            backend = MemoryBackend()
        super().__init__(uid=uid, default=default, backend=backend, scope=scope, **kwargs)

    def _get_key(self):
        if self.scope == 'global':
            return 'global'

        user = USER.get()

        if user:
            user_key = user.identity_id or user.identity_name
            return user_key

        raise ValueError('User not found when trying to compute the key for a user-scoped store')

    async def read(self):
        key = self._get_key()
        return self.backend.read(key)

    async def write(self, value: Any):
        key = self._get_key()
        return self.backend.write(key, value)

    async def read_filtered(
        self, filters: Optional[Union[FilterQuery, dict]] = None, pagination: Optional[Pagination] = None
    ):
        key = self._get_key()
        return self.backend.read_filtered(key, filters, pagination)
