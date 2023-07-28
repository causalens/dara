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
from datetime import datetime, timedelta, timezone
from typing import Set, Tuple

import jwt

from dara.core.auth.definitions import JWT_ALGO, USER
from dara.core.internal.settings import get_settings

download_registry: Set[str] = set()


def get_by_code(code: str) -> Tuple[str, str, str, str]:
    """
    Get the loaded filename and path from a code

    :param code: one-time download code
    """

    try:

        if code not in download_registry:
            raise ValueError('Invalid download code')

        code_data = jwt.decode(code, get_settings().jwt_secret, algorithms=[JWT_ALGO])

        # Cleanup
        download_registry.remove(code)

        current_path = code_data['file_path']
        cleanup_file = code_data['cleanup_file']
        username = code_data['identity_name']
        file_name = os.path.basename(current_path)

        return (current_path, file_name, cleanup_file, username)
    except jwt.ExpiredSignatureError:
        raise ValueError('Download code expired')
    except jwt.DecodeError:
        raise ValueError('Invalid download code')


def generate_download_code(file_path: str, cleanup_file: bool) -> str:
    """
    Generate a one-time download code for a given dataset.

    :param file_path: path to file
    :cleanup_file: bool with whether to erase the file after user downloads it
    """

    user = USER.get()

    code = jwt.encode(
        {
            'file_path': file_path,
            'exp': datetime.now(tz=timezone.utc) + timedelta(minutes=10),
            'cleanup_file': cleanup_file,
            'identity_name': user.identity_name if user is not None else None,
        },
        get_settings().jwt_secret,
        algorithm=JWT_ALGO,
    )
    download_registry.add(code)

    return code
