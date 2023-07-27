"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from dara.core.definitions import ComponentInstance


class InvalidComponent(ComponentInstance):
    """
    Represents an invalid component. Does not have a Dara implementation, it is handled separately in the frontend
    """

    error: str

    class Config:
        extra = 'forbid'
