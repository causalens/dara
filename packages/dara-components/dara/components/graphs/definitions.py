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
from typing import ClassVar, Dict, List, Literal, Optional, Type, Union

from pydantic import Field

from dara.core.base_definitions import DaraBaseModel as BaseModel


class EditorMode(str, Enum):
    DEFAULT = 'DEFAULT'
    """Default DAG viewer, assumes all edges are directed"""

    PAG = 'PAG'
    """PAG viewer, displays all edge types"""

    RESOLVER = 'RESOLVER'
    """Resolver mode - allows users to accept edges"""


class ArrowType(str, Enum):
    NONE = 'none'
    NORMAL = 'normal'
    FILLED = 'filled'
    EMPTY = 'empty'
    SOFT = 'soft'


class CenterSymbol(str, Enum):
    NONE = 'none'
    CROSS = 'cross'
    QUESTION = 'question'
    BIDIRECTED = 'bidirected'


class Legend(BaseModel):
    type: str

    Edge: ClassVar[Type['EdgeLegend']]
    Spacer: ClassVar[Type['SpacerLegend']]
    Node: ClassVar[Type['NodeLegend']]


class SpacerLegend(Legend):
    """
    Defines a spacer legend for a graph element.

    :param label: Optional label to show in the legend
    """

    type: Literal['spacer'] = Field(default='spacer', frozen=True)  # type: ignore
    label: Optional[str] = None


class EdgeLegend(Legend):
    """
    Defines an edge legend for a graph element.

    :param label: Optional label to show in the legend
    :param color: Optional color for the edge symbol in the legend
    :param arrow_type: Optional edge head to show at end of line
    :param center_symbol: Optional symbol to show at the center of the edge
    :param dash_array: Optional [stroke-dasharray](https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/stroke-dasharray) SVG path property - line will be dashed if specified
    """

    type: Literal['edge'] = Field(default='edge', frozen=True)  # type: ignore
    label: Optional[str] = None
    arrow_type: Optional[ArrowType] = ArrowType.NORMAL
    center_symbol: Optional[CenterSymbol] = CenterSymbol.NONE
    color: Optional[str] = 'theme.grey5'
    dash_array: Optional[str] = None


class NodeLegend(Legend):
    """
    Defines a node legend for a graph element.

    :param label: Optional label to show in the legend
    :param color: Optional color to fill the node symbol in the legend
    :param highlight_color: Optional color for the node symbol rim in the legend
    """

    type: Literal['node'] = Field(default='node', frozen=True)  # type: ignore
    label: Optional[str] = None
    color: Optional[str] = 'theme.blue4'
    highlight_color: Optional[str] = 'theme.primary'


Legend.Edge = EdgeLegend
Legend.Spacer = SpacerLegend
Legend.Node = NodeLegend

GraphLegend = Union[EdgeLegend, SpacerLegend, NodeLegend]

DEFAULT_NODE_LEGENDS: List[GraphLegend] = [
    Legend.Node(color='theme.blue1', label='Latent'),
    Legend.Node(color='theme.secondary', label='Target'),
    Legend.Node(label='Other'),
]

# Default legends for each editor mode
DEFAULT_LEGENDS: Dict[Union[EditorMode, str], List[GraphLegend]] = {
    EditorMode.DEFAULT: DEFAULT_NODE_LEGENDS,
    EditorMode.PAG: [
        *DEFAULT_NODE_LEGENDS,
        Legend.Spacer(),
        Legend.Edge(arrow_type=ArrowType.FILLED, label='Directed'),
        Legend.Edge(arrow_type=ArrowType.EMPTY, label='Wildcard'),
        Legend.Edge(arrow_type=ArrowType.NONE, label='Undirected'),
    ],
    EditorMode.RESOLVER: [
        *DEFAULT_NODE_LEGENDS,
        Legend.Spacer(),
        Legend.Edge(center_symbol=CenterSymbol.QUESTION, dash_array='10 6', label='Unresolved'),
        Legend.Edge(dash_array='10 6', label='Not accepted'),
        Legend.Edge(dash_array='6 4', label='Accepted'),
        Legend.Edge(label='Domain knowledge'),
    ],
    'EDGE_ENCODER': [
        *DEFAULT_NODE_LEGENDS,
        Legend.Spacer(),
        Legend.Edge(label='Hard Directed'),
        Legend.Edge(arrow_type=ArrowType.SOFT, label='Soft Directed'),
        Legend.Edge(
            arrow_type=ArrowType.NONE,
            center_symbol=CenterSymbol.BIDIRECTED,
            label='Undirected',
        ),
        Legend.Edge(arrow_type=ArrowType.NONE, center_symbol=CenterSymbol.CROSS, label='Prohibited'),
    ],
}


class ZoomThresholds(BaseModel):
    """
    Defines minimum scales at which a given graph element should be visible.
    Each value should be a float between 0 and 2, where 2 is the maximum zoom level
    and 0 is the minimum zoom level.
    """

    edge: float
    """Minimum scale at which edges should be visible (defaults to 0.08)"""

    label: float
    """Minimum scale at which node labels should be visible (defaults to 0.3)"""

    shadow: float
    """Minimum scale at which node/edge shadows should be visible (defaults to 0.6)"""

    symbol: float
    """Minimum scale at which edge symbols (arrow heads etc.) should be visible (defaults to 0.2)"""
