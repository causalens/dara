"""
Copyright 2023 Impulse Innovations Limited


Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
"""

import abc
import io
import os
from collections.abc import Awaitable
from typing import Any, Callable, Literal, Optional, TypedDict, Union, cast

import pandas
from fastapi import UploadFile
from pydantic import ConfigDict

from dara.core.base_definitions import CachedRegistryEntry, UploadResolverDef
from dara.core.interactivity.any_variable import AnyVariable
from dara.core.interactivity.filtering import FilterQuery
from dara.core.internal.cache_store.cache_store import CacheStore
from dara.core.internal.registry_lookup import RegistryLookup
from dara.core.internal.utils import run_user_handler


class AnyDataVariable(AnyVariable, abc.ABC):
    """
    AnyDataVariable represents any variable that is specifically designed to hold datasets (i.e. DataVariable, DerivedDataVariable)

    :param uid: the unique identifier for this variable; if not provided a random one is generated
    :param filters: a dictionary of filters to apply to the data
    """

    uid: str
    filters: Optional[FilterQuery] = None

    def __init__(self, uid: Optional[str] = None, **kwargs) -> None:
        super().__init__(uid=uid, **kwargs)

    def filter(self, filters: FilterQuery):
        return self.copy(update={'filters': filters}, deep=True)


class FieldType(TypedDict):
    name: Union[str, tuple[str, ...]]
    type: Literal['integer', 'number', 'boolean', 'datetime', 'duration', 'any', 'str']


class DataFrameSchema(TypedDict):
    fields: list[FieldType]
    primaryKey: list[str]


class DataVariableRegistryEntry(CachedRegistryEntry):
    """
    Registry entry for DataVariable.
    """

    type: Literal['plain', 'derived']
    get_data: Callable[..., Awaitable[Any]]
    """Handler to get the data from the data variable. Defaults to DataVariable.get_value for type=plain, and DerivedDataVariable.get_data for type=derived"""

    get_total_count: Callable[..., Awaitable[int]]
    """Handler to get the total number of rows in the data variable. Defaults to DataVariable.get_total_count for type=plain, and DerivedDataVariable.get_total_count for type=derived"""

    get_schema: Callable[..., Awaitable[DataFrameSchema]]
    """Handler to get the schema for data variable. Defaults to DataVariable.get_schema for type=plain, and DerivedDataVariable.get_schema for type=derived"""
    model_config = ConfigDict(extra='forbid', arbitrary_types_allowed=True)


async def upload(data: UploadFile, data_uid: Optional[str] = None, resolver_id: Optional[str] = None):
    """
    Handler for uploading data.

    :param data: the file to upload
    :param data_uid: optional uid of the data variable to upload to
    :param resolver_id: optional id of the upload resolver to use, falls back to default handlers for csv/xlsx
    """
    from dara.core.interactivity.data_variable import DataVariable
    from dara.core.internal.registries import (
        data_variable_registry,
        upload_resolver_registry,
        utils_registry,
    )

    store: CacheStore = utils_registry.get('Store')
    registry_mgr: RegistryLookup = utils_registry.get('RegistryLookup')

    if data.filename is None:
        raise ValueError('Filename not provided')

    variable = None

    _name, file_type = os.path.splitext(data.filename)

    if data_uid is not None:
        try:
            variable = await registry_mgr.get(data_variable_registry, data_uid)
        except KeyError as e:
            raise ValueError(f'Data Variable {data_uid} does not exist') from e

        if variable.type == 'derived':
            raise ValueError('Cannot upload data to DerivedDataVariable')

    content = cast(bytes, await data.read())

    resolver = None

    # If Id is provided, lookup the definition from registry
    if resolver_id is not None:
        resolver_def: UploadResolverDef = await registry_mgr.get(upload_resolver_registry, resolver_id)
        resolver = resolver_def.resolver

    if resolver:
        content = await run_user_handler(handler=resolver, args=(content, data.filename))
    # If resolver is not provided, follow roughly the cl_dataset_parser logic
    elif file_type == '.xlsx':
        file_object_xlsx = io.BytesIO(content)
        content = pandas.read_excel(file_object_xlsx, index_col=None)
        content.columns = content.columns.str.replace('Unnamed: *', 'column_', regex=True)  # type: ignore
    else:
        # default to csv
        file_object_csv = io.StringIO(content.decode('utf-8'))
        content = pandas.read_csv(file_object_csv, index_col=0)
        content.columns = content.columns.str.replace('Unnamed: *', 'column_', regex=True)  # type: ignore

    # If a data variable is provided, update it with the new content
    if variable:
        DataVariable.update_value(variable, store, content)
