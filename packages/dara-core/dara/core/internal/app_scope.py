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

import os
from hashlib import sha256
from importlib.util import find_spec
from pathlib import Path


def _get_config_module_scope() -> str | None:
    config_path = os.environ.get('DARA_CONFIG_PATH')
    if config_path is None:
        return None

    module_name = config_path.split(':', maxsplit=1)[0]

    try:
        module_spec = find_spec(module_name)
    except (ImportError, ValueError):
        return config_path

    if module_spec is None:
        return config_path

    if module_spec.origin:
        return str(Path(module_spec.origin).resolve())

    if module_spec.submodule_search_locations:
        return os.path.commonpath([str(Path(path).resolve()) for path in module_spec.submodule_search_locations])

    return config_path


def get_app_scope() -> str:
    """
    Return the stable app identity used to scope local framework-owned files.
    """

    return _get_config_module_scope() or str(Path.cwd().resolve())


def get_app_key() -> str:
    """
    Return a filesystem-safe hash of the stable app identity.
    """

    return sha256(get_app_scope().encode()).hexdigest()
