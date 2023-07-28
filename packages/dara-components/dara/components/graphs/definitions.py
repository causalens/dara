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
