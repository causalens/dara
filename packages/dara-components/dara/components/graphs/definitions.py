"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from enum import Enum

from pydantic import BaseModel


class EditorMode(str, Enum):
    DEFAULT = 'DEFAULT'
    """Default DAG viewer, assumes all edges are directed"""

    PAG = 'PAG'
    """PAG viewer, displays all edge types"""

    RESOLVER = 'RESOLVER'
    """Resolver mode - allows users to accept edges"""


class ZoomThresholds(BaseModel):
    """
    Defines minimum scales at which a given graph element should be visible.
    Each value should be a float between 0 and 2, where 2 is the maximum zoom level
    and 0 is the minimum zoom level.
    """

    edge: float
    """Minimum scale at which edges should be visible"""

    label: float
    """Minimum scale at which node labels should be visible"""

    shadow: float
    """Minimum scale at which node/edge shadows should be visible"""

    symbol: float
    """Minimum scale at which edge symbols (arrow heads etc.) should be visible"""
