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
from collections.abc import Awaitable
from contextvars import ContextVar
from typing import Callable, Optional, Tuple
from uuid import uuid4

import anyio

from dara.core.auth.definitions import USER
from dara.core.base_definitions import Cache, CachedRegistryEntry
from dara.core.base_definitions import DaraBaseModel as BaseModel


class DownloadDataEntry(BaseModel):
    """
    Entry stored in the download registry for a given code.
    """

    uid: str
    file_path: str
    cleanup_file: bool
    identity_name: Optional[str] = None
    download: Callable[[DownloadDataEntry], Awaitable[Tuple[anyio.AsyncFile, Callable[..., Awaitable]]]]
    """Handler for getting the file from the entry"""


DownloadRegistryEntry = CachedRegistryEntry(
    uid='_dara_download', cache=Cache.Policy.TTL(ttl=60 * 10)
)  # expire the codes after 10 minutes


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


GENERATE_CODE_OVERRIDE = ContextVar[Optional[Callable[[str], str]]]('GENERATE_CODE_OVERRIDE', default=None)
"""
Optional context variable which can be used to override the default behaviour of code generation.
Invoked with the file path to generate a download code for.
"""


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
    uid = override(file_path) if (override := GENERATE_CODE_OVERRIDE.get()) else str(uuid4())

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
