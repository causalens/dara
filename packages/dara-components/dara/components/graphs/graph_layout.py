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

import abc
from enum import Enum
from typing import Optional, Union

from pydantic import BaseModel, Field


class GraphLayoutType(Enum):
    CIRCULAR = 'circular'
    CUSTOM = 'custom'
    FCOSE = 'fcose'
    FORCE_ATLAS = 'force_atlas'
    MARKETING = 'marketing'
    PLANAR = 'planar'
    SPRING = 'spring'


class TargetLocation(Enum):
    CENTER = 'center'
    BOTTOM = 'bottom'


class DirectionType(Enum):
    HORIZONTAL = 'horizontal'
    VERTICAL = 'vertical'


Number = Union[int, float]


class GraphLayout(BaseModel, abc.ABC):
    """
    Base graph layout class

    :param node_size: node size in pixels
    :param node_font_size: node font size in pixels
    """

    node_size: Optional[int] = None
    node_font_size: Optional[int] = None


class CircularLayout(GraphLayout):
    """
    CircularLayout provides a circular layout where nodes are aligned on a circle. The circle's radius scales
    automatically with node size and number of nodes.

    :param node_size: node size in pixels
    """

    layout_type: GraphLayoutType = Field(default=GraphLayoutType.CIRCULAR, const=True)


class CustomLayout(GraphLayout):
    """
    CustomLayout provides a custom layout for the graph. The layout is defined by the user.

    This layout can be used if all nodes have coordinates defined in the metadata, e.g.:

    ```python
    {
        'nodes': {
            'a': {
                'meta': {
                    'rendering_properties': {
                        'x': 0,
                        'y': 0,
                    }
               }
            }
        }
    }
    ```

    If not all nodes have coordinates defined, the graph editor will fall back to a default layout.
    """

    layout_type: GraphLayoutType = Field(default=GraphLayoutType.CUSTOM, const=True)


class FcoseLayout(GraphLayout):
    """
    FcoseLayout utilises `fCoSE` (fast Compound Spring Embedder) algorithm to compute the layout.
    It works well in most circumstances and is highly configurable.

    See https://github.com/iVis-at-Bilkent/cytoscape.js-fcose for more details and interactive demos.

    :param edge_elasticity: Divisor to compute edge forces
    :param edge_length: Ideal edge length multiplier, the layout's `idealEdgeLength = avgNodeSize * edgeLength`
    :param energy: Initial cooling factor for incremental layout
    :param gravity: Gravity force multiplier
    :param gravity_range: Gravity range
    :param high_quality: Whether to produce high-quality layout a slight performance cost, lowers cooling rate so might require more iterations
    :param iterations: Number of iterations to run the layout for, per computation
    :param node_repulsion: Non-overlapping node force multiplier
    :param node_separation: Separation force between nodes
    """

    layout_type: GraphLayoutType = Field(default=GraphLayoutType.FCOSE, const=True)

    edge_elasticity: Optional[Number] = 0.45
    edge_length: Optional[Number] = 3
    energy: Optional[Number] = 0.1
    gravity: Optional[Number] = 35
    gravity_range: Optional[Number] = 80
    high_quality: Optional[bool] = True
    iterations: Optional[int] = 2500
    node_repulsion: Optional[Number] = 6_500
    node_separation: Optional[Number] = 75


class ForceAtlasLayout(GraphLayout):
    """
    ForceAtlas utilises the `ForceAtlas2` algorithm to compute the layout. It is a force-directed layout
    which integrates various optimizations and is highly configurable.

    See https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0098679 for more details and
    in-depth explanations of the parameters.

    :param barnes_hut_optimize: Whether to use the Barnes-Hut approximation to calculate repulsive forces.
    Enabling it improves the performance at cost of accuracy.
    :param edge_weight_influence: Influence of edge weights on the layout. If set to 0, edge weights are ignored.
    Higher values emphasize the weight effects. This parameter is used to modify the attraction force between nodes.
    :param gravity: This force prevents disconnected components from drifting away, attracting nodes towards the center
    of the space. Its main purpose is to compensate repulsion for nodes that are far away from the center.
    :param iterations: Number of iterations to run the layout for, per computation
    :param lin_log_mode: Whether to use LinLog energy model, using logarithmic attraction force. Enabling it makes clusters
    tighter but coverges slower.
    :param outbound_attraction_distribution: Whether to scale the attraction force between nodes according to their degree.
    :param scaling_ratio: Parameter to adjust the size of the produced graph
    :param strong_gravity_mode: Whether to use strong gravity mode, which sets a force that attracts the nodes that are distant
    from the center more. This force has the drawback of being so strong that it is sometimes stronger than the other forces. It may result in a biased placement of the nodes.
    However, its advantage is to force a very compact layout, which may be useful for certain purposes.
    """

    layout_type: GraphLayoutType = Field(default=GraphLayoutType.FORCE_ATLAS, const=True)

    barnes_hut_optimize: Optional[bool] = False
    edge_weight_influence: Optional[Number] = 1
    gravity: Optional[Number] = 0.2
    iterations: Optional[int] = 10_000
    lin_log_mode: Optional[bool] = True
    outbound_attraction_distribution: Optional[bool] = True
    scaling_ratio: Optional[Number] = 8
    strong_gravity_mode: Optional[bool] = False


class MarketingLayout(GraphLayout):
    """
    MarketingLayout provides the default graph layout which works well for smaller
    number of nodes, although it does not offer any protection against excessive edge crossings.

    :param node_size: node size in pixels
    :param target_location: Location of the target node
    """

    layout_type: GraphLayoutType = Field(default=GraphLayoutType.MARKETING, const=True)
    target_location: Optional[TargetLocation] = None


class PlanarLayout(GraphLayout):
    """
    PlanarLayout provides a planar layout similar to the layout offered in low-level editor. The implementation
    uses d3-dag's sugiyama layout under the hood to minimize edge crossings.

    :param orientation: Orientation of target node relative to other nodes (horizontal or vertical)
    """

    layout_type: GraphLayoutType = Field(default=GraphLayoutType.PLANAR, const=True)
    orientation: Optional[DirectionType] = None


class SpringLayout(GraphLayout):
    """
    SpringLayout provides a simple force-directed graph layout which produces the "spring" behaviour of edges.
    This is a 'live' layout, which means a simulation keeps running in the background to compute the layout.

    :param collision_force: Multiplier for collision force between nodes
    :param gravity: Gravity strength; negative values pull nodes together, positive values push them apart
    :param link_force: Multiplier for link force between nodes, higher values produce shorter links
    :param warmup_ticks: Number of ticks to run the simulation for before displaying the layout. Increasing it should
        make the initial render of the graph more stable (i.e. nodes won't move by themselves) but it comes at a
        small performance cost.
    """

    layout_type: GraphLayoutType = Field(default=GraphLayoutType.SPRING, const=True)

    collision_force: Optional[Number] = 2
    gravity: Optional[Number] = -50
    link_force: Optional[Number] = 5
    warmup_ticks: Optional[Number] = 100
