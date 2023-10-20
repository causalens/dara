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

from __future__ import annotations

import os
from typing import Awaitable, Callable, Optional, Tuple
from uuid import uuid4

import anyio
from pydantic import BaseModel

from dara.core.auth.definitions import USER
from dara.core.base_definitions import Cache, CachedRegistryEntry


class DownloadDataEntry(BaseModel):
    """
    Entry stored in the download registry for a given code.
    """

    uid: str
    file_path: str
    cleanup_file: bool
    identity_name: Optional[str]
    download: Callable[['DownloadDataEntry'], Awaitable[Tuple[anyio.AsyncFile, Callable[..., Awaitable]]]]
    """Handler for getting the file from the entry"""


DownloadRegistryEntry = CachedRegistryEntry(
    uid='_dara_download', cache=Cache.Policy.TTL(ttl=60 * 10)
)   # expire the codes after 10 minutes


async def download(data_entry: DownloadDataEntry) -> Tuple[anyio.AsyncFile, Callable[..., Awaitable]]:
    """
    Get the loaded filename and path from a code

    :param code: one-time download code
    :return: tuple of (async file, cleanup function)
    """
    from dara.core.internal.cache_store import CacheStore
    from dara.core.internal.registries import utils_registry

    store: CacheStore = utils_registry.get('Store')

    # Remove the entry from the store explicitly
    await store.delete(DownloadRegistryEntry, key=data_entry.uid)

    async_file = await anyio.open_file(data_entry.file_path, mode='rb')

    async def cleanup():
        await async_file.aclose()
        # If cleanup flag is set, remove the file
        if data_entry.cleanup_file:
            os.remove(data_entry.file_path)

    return (async_file, cleanup)


async def generate_download_code(file_path: str, cleanup_file: bool) -> str:
    """
    Generate a one-time download code for a given dataset.

    :param file_path: path to file
    :cleanup_file: bool with whether to erase the file after user downloads it
    """
    from dara.core.internal.cache_store import CacheStore
    from dara.core.internal.registries import utils_registry

    store: CacheStore = utils_registry.get('Store')

    user = USER.get()

    # Unique download id
    uid = str(uuid4())

    # Put it in the store under the registry entry with TTL configured
    await store.set(
        DownloadRegistryEntry,
        key=uid,
        value=DownloadDataEntry(
            uid=uid,
            file_path=file_path,
            cleanup_file=cleanup_file,
            identity_name=user.identity_name if user is not None else None,
            download=download,
        ),
    )

    return uid
