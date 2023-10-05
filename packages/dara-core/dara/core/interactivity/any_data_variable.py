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
from typing import Literal, Optional, cast
import os

from dara.core.base_definitions import CachedRegistryEntry
from dara.core.interactivity.any_variable import AnyVariable
from dara.core.interactivity.filtering import FilterQuery
from dara.core.internal.utils import run_user_handler
from fastapi import UploadFile
import pandas


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


class DataVariableRegistryEntry(CachedRegistryEntry):
    """
    Registry entry for DataVariable.
    """

    type: Literal['plain', 'derived']


    class Config:
        extra = 'forbid'
        arbitrary_types_allowed = True

async def upload(data: UploadFile, data_var_uid: Optional[str] = None, resolver_id: Optional[str] = None):
    """
    Handle upload of a file.

    :param data: the file to upload
    :param data_var_uid: the uid of the DataVariable to update, if provided will attempt to update the DataVariable
    :param resolver_id: the resolver id to use for the upload, if provided will run the data through the resolver
    """
    from dara.core.internal.registries import data_variable_registry, upload_resolver_registry, utils_registry
    from dara.core.internal.cache_store import CacheStore
    from dara.core.internal.registry_lookup import RegistryLookup
    from dara.core.interactivity.data_variable import DataVariable

    store: CacheStore = utils_registry.get('Store')
    registry_mgr: RegistryLookup = utils_registry.get('RegistryLookup')
    variable = None

    if data.filename is None:
        raise ValueError('Filename not provided')

    _name, file_type = os.path.splitext(data.filename)

    if data_var_uid is not None:
        try:
            variable = await registry_mgr.get(data_variable_registry, data_var_uid)
        except KeyError:
            raise ValueError(f'Data Variable {data_var_uid} does not exist')

        if variable.type == 'derived':
            raise ValueError('Cannot upload data to DerivedDataVariable')

    content = cast(bytes, await data.read())

    if resolver_id is not None:
        resolver = await registry_mgr.get(upload_resolver_registry, resolver_id)

        content = await run_user_handler(handler=resolver, args=(content, data.filename))

    # If resolver is not provided, follow roughly the cl_dataset_parser logic
    elif file_type == '.xlsx':
        file_object_xlsx = io.BytesIO(content)
        content = pandas.read_excel(file_object_xlsx, index_col=None)
        content.columns = content.columns.str.replace('Unnamed: *', 'column_', regex=True)   # type: ignore
    else:
        # default to csv
        file_object_csv = io.StringIO(content.decode('utf-8'))
        content = pandas.read_csv(file_object_csv, index_col=0)
        content.columns = content.columns.str.replace('Unnamed: *', 'column_', regex=True)   # type: ignore

    # If a data variable is provided, update it with the new content
    if variable:
        DataVariable.update_value(variable, store, content)

    return True
