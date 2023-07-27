"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from __future__ import annotations

import abc
from typing import Optional

from dara.core.interactivity.any_variable import AnyVariable


class NonDataVariable(AnyVariable, abc.ABC):
    """
    NonDataVariable represents any variable that is not specifically designed to hold datasets (i.e. Variable, DerivedVariable, UrlVariable)

    :param uid: the unique identifier for this variable; if not provided a random one is generated
    """

    uid: str

    def __init__(self, uid: Optional[str] = None, **kwargs) -> None:
        super().__init__(uid=uid, **kwargs)
