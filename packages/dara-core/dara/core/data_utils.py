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
from typing import List, Optional, Union

import pandas
from pandas import DataFrame

from dara.core.base_definitions import CacheType
from dara.core.base_definitions import DaraBaseModel as BaseModel
from dara.core.interactivity import (
    ClientVariable,
    DerivedVariable,
    DownloadContent,
    SideEffect,
    Variable,
)
from dara.core.internal.utils import get_cache_scope


class FileStore(BaseModel):
    """
    Provides a low level data storage API.
    Acts as a cache Store but for files stored on disk
    """

    root_path: str
    """Path to where the data is stored"""

    def get_scoped_path(self, cache_type: CacheType) -> str:
        """
        Get a path to the sub-store for given cache scope.

        :param cache_type: cache type to get the scoped path to
        :returns: a path to the sub-store for the given cache type


        Examples:

        ```python

        from dara.core.data_utils import FileStore
        from dara.core.base_definitions import CacheType

        file_store = FileStore(root_path='./data_root')

        # Note: The following must be executed in an authenticated context
        # to take effect, which means inside a variable or action resolver, or a py_component;
        # otherwise the scoped path will always be global
        file_store.get_scoped_path(CacheType.USER)
        # > './data_root/{user_id}'
        file_store.get_scoped_path(CacheType.SESSION)
        # > './data_root/{session_id}'
        file_store.get_scoped_path(CacheType.GLOBAL)
        # > './data_root/global'

        ```
        """
        scope = get_cache_scope(cache_type)
        return os.path.join(self.root_path, scope)

    def list_files(self, cache_type: CacheType) -> List[str]:
        """
        List files in a directory for a given cache type

        :param cache_type: cache type to get the files for
        :returns: a list of file names or an empty list if the directory for the given cache does not exist
        """
        scope_path = self.get_scoped_path(cache_type)

        if not os.path.exists(scope_path):
            return []

        return os.listdir(scope_path)

    def file_exists(self, cache_type: CacheType, name: str) -> bool:
        """
        Whether a file with a given name exists

        :param cache_type: cache type to get the files for
        :param name: name of the file
        :returns: True if the file exists, False otherwise
        """
        scope_path = self.get_scoped_path(cache_type)
        file_path = os.path.join(scope_path, name)
        return os.path.exists(file_path)

    def get_file(self, cache_type: CacheType, name: str) -> Optional[io.BufferedReader]:
        """
        Get a BufferedReader to read a file from the data store

        :param cache_type: cache type to get the files for
        :param name: name of the file
        :returns: a BufferedReader to read the file or None if the file does not exist
        """
        scope_path = self.get_scoped_path(cache_type)
        file_path = os.path.join(scope_path, name)

        if not os.path.exists(file_path):
            return None

        return open(file_path, 'rb')

    def write_file(self, cache_type: CacheType, name: str) -> io.BufferedWriter:
        """
        Get a BufferedWriter to write a file to the data store.

        Creates the directory for the cache type if it does not exist.

        :param cache_type: cache type to get the files for
        :param name: name of the file
        :returns: a BufferedWriter to write the file
        """
        scope_path = self.get_scoped_path(cache_type)
        os.makedirs(scope_path, exist_ok=True)
        return open(os.path.join(scope_path, name), 'wb')

    def delete_file(self, cache_type: CacheType, name: str) -> None:
        """
        Delete a file from the data store

        :param cache_type: cache type to get the files for
        :param name: name of the file
        """
        scope_path = self.get_scoped_path(cache_type)
        os.remove(os.path.join(scope_path, name))


class DataFactory(BaseModel):
    """
    Acts as a factory of variables, actions and methods to interact with data stored locally.

    Internally datasets are stored as parquet files.
    """

    file_store: FileStore

    def __init__(self, root_path: str):
        """
        Acts as a factory of variables, actions and methods to interact with data stored locally

        :param root_path: root path to the directory where data should be stored
        """
        file_store = FileStore(root_path=root_path)
        super().__init__(file_store=file_store)

    def list_datasets(self, cache: CacheType = CacheType.GLOBAL) -> List[str]:
        """
        Get a list of datasets (filenames) available for a given cache type

        :param cache: cache type to get the list of datasets for
        :returns: a list of datasets (filenames) available for a given cache type
        """
        return self.file_store.list_files(cache)

    def list_datasets_var(
        self,
        cache: Union[CacheType, ClientVariable] = CacheType.GLOBAL,
        polling_interval: Optional[int] = None,
    ) -> DerivedVariable[List[str]]:
        """
        Create a DerivedVariable which stores a list of datasets (filenames) available for a given cache type

        :param cache: cache type to get the list of datasets for
        :param polling_interval: optional polling_interval in seconds for the derived variable
        """
        cache_var = cache if isinstance(cache, ClientVariable) else Variable(cache)

        return DerivedVariable(
            lambda cache_val: self.file_store.list_files(cache_val or CacheType.GLOBAL),
            variables=[cache_var],
            cache=CacheType.SESSION,  # the variable itself should be cached restrictively
            polling_interval=polling_interval,
        )

    def write_dataset(self, dataset: DataFrame, name: str, cache: CacheType = CacheType.GLOBAL) -> None:
        """
        Write a dataset to disk.
        Creates a new one or overwrites an existing one.

        Can be used e.g. as a resolver for UploadDropzone or in a SideEffect to create an arbitrary dataset.

        :param dataset: DataFrame to write to disk
        :param name: name to use for the dataset
        :param cache: cache type to get the list of datasets for

        Upload example

        ```python

        import pandas
        import io
        from dara.components import UploadDropzone
        from dara.core.data_utils import DataFactory

        ds_factory = DataFactory('./data_root')

        def resolver(content: bytes, name: str) -> None:
            # Assumes uploaded file is csv
            file_object_io = io.StringIO(content.decode('utf-8'))
            dataset = pandas.read_csv(file_object_io)
            ds_factory.write_dataset(dataset, name)

        UploadDropzone(resolver=resolver)

        ```

        Arbitrary creation example

        ```python

        import pandas
        import numpy as np
        import io
        from uuid import uuid4
        from dara.components import UploadDropzone
        from dara.core.data_utils import DataFactory
        from dara.core import SideEffect, Variable

        ds_factory = DataFactory('./data_root')

        def create_df(ctx: SideEffect.Ctx):
            df = pandas.DataFrame(np.random.randint(ctx.extras[0], 100, size=(100, 4)), columns=list('ABCD'))
            uid = str(uuid4())
            ds_factory.write_dataset(df, f'random_{uid}')

        extra_data = Variable(1) # some extra data used to create the DataFrame
        SideEffect(resolver=create_df, extras=[extra_data])

        ```
        """
        name_clean, _ext = os.path.splitext(name)
        name = name_clean + '.parquet'

        writer = self.file_store.write_file(cache, name)
        dataset.to_parquet(writer)
        writer.close()

    def get_dataset_path(self, name: str, cache: CacheType = CacheType.GLOBAL) -> str:
        """
        Get path to a dataset on disk

        :param name: name of the dataset
        :param cache: cache type to get dataset for
        :returns: path to the dataset on disk
        """
        return os.path.join(self.file_store.get_scoped_path(cache), name)

    def read_dataset(self, name: str, cache: CacheType = CacheType.GLOBAL) -> Optional[DataFrame]:
        """
        Read a dataset from disk to a DataFrame.

        :param name: name of the dataset
        :param cache: cache type to get dataset for
        :returns: DataFrame or None if the dataset does not exist
        """
        if name is None:
            return None

        # Assume we're reading a parquet file
        name_clean, _ext = os.path.splitext(name)
        name = name_clean + '.parquet'

        reader = self.file_store.get_file(cache, name)

        if reader is None:
            return None

        df = pandas.read_parquet(reader)
        reader.close()
        return df

    def read_dataset_var(
        self,
        name: Union[str, ClientVariable],
        cache: Union[CacheType, ClientVariable] = CacheType.GLOBAL,
        polling_interval: Optional[int] = None,
    ) -> DerivedVariable:
        """
        Create a DerivedVariable which reads a specific dataset from disk

        :param name: name of the dataset
        :param cache: cache to get the dataset for
        :param polling_interval: optional polling interval in seconds for the derived variable
        """
        name_var = name if isinstance(name, ClientVariable) else Variable(name)
        cache_var = cache if isinstance(cache, ClientVariable) else Variable(cache)

        return DerivedVariable(
            self.read_dataset,
            variables=[name_var, cache_var],
            cache=CacheType.SESSION,
            polling_interval=polling_interval,
        )

    def delete_dataset(self, name: str, cache: CacheType = CacheType.GLOBAL) -> None:
        """
        Delete a dataset from disk

        :param name: name of the dataset
        :param cache: cache to remove the dataset for
        """
        self.file_store.delete_file(cache, name)

    def delete_dataset_action(
        self, name: Union[str, ClientVariable], cache: Union[CacheType, ClientVariable] = CacheType.GLOBAL
    ):
        """
        Get a SideEffect action which deletes a given dataset

        :param name: name of the dataset
        :param cache: cache to remove the daatset for
        """
        name_var = name if isinstance(name, ClientVariable) else Variable(name)
        cache_var = cache if isinstance(cache, ClientVariable) else Variable(cache)

        return SideEffect(lambda ctx: self.delete_dataset(ctx.extras[0], ctx.extras[1]), extras=[name_var, cache_var])

    def download_dataset_action(
        self, name: Union[str, ClientVariable], cache: Union[CacheType, ClientVariable] = CacheType.GLOBAL
    ):
        """
        Get a DownloadContent action which downloads a dataset with a given name as a .csv

        :param name: name of the dataset to download
        :param cache: cache to download dataset for
        """
        name_var = name if isinstance(name, ClientVariable) else Variable(name)
        cache_var = cache if isinstance(cache, ClientVariable) else Variable(cache)

        def _resolver(ctx: DownloadContent.Ctx):  # type: ignore
            ds_name, sel_cache = ctx.extras  # type: ignore
            df = self.read_dataset(ds_name, sel_cache)

            if df is None:
                raise LookupError(f'Dataset {ds_name} does not exist')

            clean_name, _ext = os.path.splitext(ds_name)

            # Write the dataset as a .csv temporarily, will be cleaned up after download
            csv_path = os.path.join(self.file_store.get_scoped_path(sel_cache), clean_name + '.csv')
            df.to_csv(csv_path)
            return csv_path

        return DownloadContent(resolver=_resolver, extras=[name_var, cache_var], cleanup_file=True)
