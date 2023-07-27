"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
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
        obj = obj.dict()

    filter_hash = hashlib.sha1()   # nosec B303 # we don't use this for security purposes just as a cache key
    filter_hash.update(json.dumps(obj or {}, sort_keys=True).encode())
    return filter_hash.hexdigest()
