"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from __future__ import annotations

from typing import Generic, List, Optional, TypeVar

from dara.core.interactivity.non_data_variable import NonDataVariable

VariableType = TypeVar('VariableType')


class UrlVariable(NonDataVariable, Generic[VariableType]):
    """
    A UrlVariable is very similar to a normal Variable however rather than it's state being stored in the memory of
    the client it's value is stored in the url of page as a query parameter. This is very useful for parameterizing
    pages as you switch from one to the other.
    """

    default: Optional[VariableType]
    nested: List[str] = []
    query: str
    uid: str

    class Config:
        extra = 'forbid'

    def __init__(self, query: str, default: Optional[VariableType] = None, uid: Optional[str] = None):
        """
        A UrlVariable is very similar to a normal Variable however rather than it's state being stored in the memory of
        the client it's value is stored in the url of page as a query parameter. This is very useful for parameterizing
        pages as you switch from one to the other.

        :param query: the key in the query string to identify this variable
        :param default: the initial value for the variable, defaults to None
        :param uid: the unique identifier for this variable; if not provided a random one is generated
        """
        super().__init__(query=query, default=default, uid=uid)

    def dict(self, *args, **kwargs):
        parent_dict = super().dict(*args, **kwargs)
        return {**parent_dict, '__typename': 'UrlVariable', 'uid': str(parent_dict['uid'])}
