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

import hashlib
import json
from typing import Union

from pydantic import BaseModel


def hash_object(obj: Union[BaseModel, dict, None]):
    """
    Create a unique hash for the object.

    :param object: object to create a hash for
    """
    if isinstance(obj, BaseModel):
        obj = obj.model_dump()

    filter_hash = hashlib.sha1(usedforsecurity=False)  # nosec B303 # we don't use this for security purposes just as a cache key
    filter_hash.update(json.dumps(obj or {}, sort_keys=True).encode())
    return filter_hash.hexdigest()
