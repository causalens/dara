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
