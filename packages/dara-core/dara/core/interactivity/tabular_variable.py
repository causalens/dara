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

import io
import os
from typing import Literal, Optional, TypedDict, Union, cast

import pandas
from fastapi import UploadFile

from dara.core.base_definitions import UploadResolverDef
from dara.core.internal.registry_lookup import RegistryLookup
from dara.core.internal.utils import run_user_handler


class FieldType(TypedDict):
    name: Union[str, tuple[str, ...]]
    type: Literal['integer', 'number', 'boolean', 'datetime', 'duration', 'any', 'str']


class DataFrameSchema(TypedDict):
    fields: list[FieldType]
    primaryKey: list[str]


async def upload(data: UploadFile, data_uid: Optional[str] = None, resolver_id: Optional[str] = None):
    """
    Handler for uploading data.

    :param data: the file to upload
    :param data_uid: optional uid of the data variable to upload to
    :param resolver_id: optional id of the upload resolver to use, falls back to default handlers for csv/xlsx
    """
    from dara.core.interactivity.server_variable import ServerVariable
    from dara.core.internal.registries import (
        server_variable_registry,
        upload_resolver_registry,
        utils_registry,
    )

    registry_mgr: RegistryLookup = utils_registry.get('RegistryLookup')

    if data.filename is None:
        raise ValueError('Filename not provided')

    variable_entry = None

    _name, file_type = os.path.splitext(data.filename)

    if data_uid is not None:
        try:
            variable_entry = await registry_mgr.get(server_variable_registry, data_uid)
        except KeyError as e:
            raise ValueError(f'Data Variable {data_uid} does not exist') from e

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

    # If a server variable is provided, update it with the new content
    if variable_entry:
        await ServerVariable.write_value(variable_entry, content)
