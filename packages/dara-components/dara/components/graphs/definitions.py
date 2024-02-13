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
from typing import Optional

from pydantic import BaseModel


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


class GraphLegendType(str, Enum):
    SPACER = 'spacer'
    EDGE = 'edge'
    NODE = 'node'


class GraphLegend(BaseModel):
    """
    Defines a legend for a graph element.

    :param type: Defines the symbol of the legend, can be an edge, node, or spacer if you would like it to be empty
    :param label: Optional label to show in the legend

    `type: 'spacer' params`
    A way of setting an empty line or a label without a symbol in the legend

    `type: 'node' params`
    :param color: Optional color to fill the node symbol in the legend
    :param highlight_color: Optional color for the node symbol rim in the legend

    `type: 'edge' params`
    :param color: Optional color for the edge symbol in the legend
    :param arrow_type: Optional edge head to show at end of line
    :param center_symbol: Optional symbol to show at the center of the edge
    :param dash_array: Optional dashArray SVG path property - line will be dashed if specified
    """

    arrow_type: Optional[ArrowType]
    center_symbol: Optional[CenterSymbol]
    color: Optional[str]
    dash_array: Optional[str]
    highlight_color: Optional[str]
    label: Optional[str]
    type: GraphLegendType


DEFAULT_NODE_LEGENDS = [
    GraphLegend(type=GraphLegendType.NODE, color='theme.blue1', label='Latent'),
    GraphLegend(type=GraphLegendType.NODE, color='theme.secondary', label='Target'),
    GraphLegend(type=GraphLegendType.NODE, label='Other'),
]

# Default legends for each editor mode
DEFAULT_LEGENDS = {
    EditorMode.DEFAULT: DEFAULT_NODE_LEGENDS,
    EditorMode.PAG: [
        *DEFAULT_NODE_LEGENDS,
        GraphLegend(type=GraphLegendType.SPACER),
        GraphLegend(type=GraphLegendType.EDGE, arrow_type=ArrowType.FILLED, label='Directed'),
        GraphLegend(type=GraphLegendType.EDGE, arrow_type=ArrowType.EMPTY, label='Wildcard'),
        GraphLegend(type=GraphLegendType.EDGE, arrow_type=ArrowType.NONE, label='Undirected'),
    ],
    EditorMode.RESOLVER: [
        *DEFAULT_NODE_LEGENDS,
        GraphLegend(type=GraphLegendType.SPACER),
        GraphLegend(
            type=GraphLegendType.EDGE, center_symbol=CenterSymbol.QUESTION, dash_array='10 6', label='Unresolved'
        ),
        GraphLegend(type=GraphLegendType.EDGE, dash_array='10 6', label='Not accepted'),
        GraphLegend(type=GraphLegendType.EDGE, dash_array='6 4', label='Accepted'),
        GraphLegend(type=GraphLegendType.EDGE, label='Domain knowledge'),
    ],
    'EDGE_ENCODER': [
        *DEFAULT_NODE_LEGENDS,
        GraphLegend(type=GraphLegendType.SPACER),
        GraphLegend(type=GraphLegendType.EDGE, label='Hard Directed'),
        GraphLegend(type=GraphLegendType.EDGE, arrow_type=ArrowType.SOFT, label='Soft Directed'),
        GraphLegend(
            type=GraphLegendType.EDGE,
            arrow_type=ArrowType.NONE,
            center_symbol=CenterSymbol.BIDIRECTED,
            label='Undirected',
        ),
        GraphLegend(
            type=GraphLegendType.EDGE, arrow_type=ArrowType.NONE, center_symbol=CenterSymbol.CROSS, label='Prohibited'
        ),
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
