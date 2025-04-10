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
from typing import List, Optional, Union

from pydantic import Field

from dara.core.base_definitions import DaraBaseModel as BaseModel


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


class DirectionType(str, Enum):
    HORIZONTAL = 'horizontal'
    VERTICAL = 'vertical'


class LayeringAlgorithm(Enum):
    LONGEST_PATH = 'longest_path'
    SIMPLEX = 'simplex'


Number = Union[int, float]


class GraphLayout(BaseModel, abc.ABC):
    """
    Base graph layout class

    :param node_size: node size in pixels
    :param node_font_size: node font size in pixels
    """

    node_size: Optional[int] = None
    node_font_size: Optional[int] = None


class TiersConfig(BaseModel):
    r"""
    TiersConfig provides a way of defining tiers for a graph layout.

    :param group: Path within node to group property which defines the tier it belong to,
        e.g. 'meta.group' would correspond to a group attribute in the meta of the node, 'meta': \{'group': 'countries'\}
    :param order_nodes_by: A path to a node property which contains a number defining the order of nodes within a tier,
        e.g. 'meta.order' would correspond to an order attribute in the meta of the node, 'meta': \{'order': 1\}
    :param rank: A list of group values defining the order they should appear in, e.g. ['countries', 'currency', 'industry']
        would result in the nodes representing nodes appearing in the first tier, then nodes representing currency in the second tier and finally those representing industry.
    """

    group: str
    order_nodes_by: Optional[str] = None
    rank: Optional[List[str]] = None


class TieringLayout(BaseModel):
    """
    TieringLayout provides a tiering layout for a graph. It can be used to define tiers for a graph.

    A way of setting tiers is to pass it as an array of array of nodes:
    ```
    from dara.components import CausalGraphViewer, FcoseLayout
    from cai_causal_graph import CausalGraph

    cg = CausalGraph()
    cg.add_edge('A', 'C')
    cg.add_edge('B', 'D')
    cg.add_edge('C', 'E')
    cg.add_edge('D', 'E')

    tiers = [['A', 'B'], ['C', 'D'], ['E']]

    CausalGraphViewer(
        causal_graph=cg,
        graph_layout=FcoseLayout(
                tiers=tiers,
                orientation='vertical'
            ),
    )
    ```

    Alternatively you can pass the tiers based on some node property with the use of TiersConfig:
    ```
    from dara.components import CausalGraphViewer, FcoseLayout, TiersConfig
    from cai_causal_graph import CausalGraph

    cg = CausalGraph()
    cg.add_node(identifier='A', meta={'group': 'first', order: 2})
    cg.add_node(identifier='B', meta={'group': 'first', order: 1})
    cg.add_node(identifier='C', meta={'group': 'second'})
    cg.add_node(identifier='D', meta={'group': 'second'})
    cg.add_node(identifier='E', meta={'group': 'third'})
    cg.add_edge('A', 'C')
    cg.add_edge('B', 'D')
    cg.add_edge('C', 'E')
    cg.add_edge('D', 'E')

    CausalGraphViewer(
        causal_graph=cg,
        graph_layout=FcoseLayout(
            tiers=TiersConfig(group='meta.group', rank=['first', 'second', 'third'], order_nodes_by='meta.order'),
            ),
    )
    ```

    :param tiers: A TiersConfig object or an array of arrays of node ids outlining the tier structure
    :param orientation: Orientation the tiers are displayed in default is horizontal
    """

    tiers: Optional[Union[TiersConfig, List[List[str]]]] = None
    orientation: Optional[DirectionType] = DirectionType.HORIZONTAL


class GroupingLayout(BaseModel):
    """
    GroupingLayout provides a grouping or cluster layout for a graph. It can be used to represent nodes within groups or cluster which are collapsible.

    You can set the group on the meta of a node and then define the path to this property on the layout:
    ```
    from dara.components import CausalGraphViewer, FcoseLayout
    from cai_causal_graph import CausalGraph

    cg = CausalGraph()
    cg.add_node(identifier='A', meta={'group': 'group1'})
    cg.add_node(identifier='B', meta={'group': 'group1'})
    cg.add_node(identifier='C', meta={'group': 'group2'})
    cg.add_node(identifier='D', meta={'group': 'group2'})
    cg.add_node(identifier='E', meta={'group': 'group3'})
    cg.add_edge('A', 'C')
    cg.add_edge('B', 'D')
    cg.add_edge('C', 'E')
    cg.add_edge('D', 'E')

    CausalGraphViewer(
        causal_graph=cg,
        graph_layout=FcoseLayout(
            group='meta.group',
            ),
    )
    ```

    :param group: Path within node to group property which defines the group it belong to,
    """

    group: Optional[str] = None


class CircularLayout(GraphLayout):
    """
    CircularLayout provides a circular layout where nodes are aligned on a circle. The circle's radius scales
    automatically with node size and number of nodes.

    :param node_size: node size in pixels
    """

    layout_type: GraphLayoutType = Field(default=GraphLayoutType.CIRCULAR, frozen=True)


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

    layout_type: GraphLayoutType = Field(default=GraphLayoutType.CUSTOM, frozen=True)


class FcoseLayout(GraphLayout, TieringLayout, GroupingLayout):
    """
    FcoseLayout utilizes `fCoSE` (fast Compound Spring Embedder) algorithm to compute the layout.
    It works well in most circumstances and is highly configurable.

    See https://github.com/iVis-at-Bilkent/cytoscape.js-fcose for more details and interactive demos.

    :param edge_elasticity: Divisor to compute edge forces (default value: 0.45)
    :param edge_length: Ideal edge length multiplier, the layout's `idealEdgeLength = avgNodeSize * edgeLength` (default value: 3)
    :param energy: Initial cooling factor for incremental layout (default value: 0.1)
    :param gravity: Gravity force multiplier (default value: 35)
    :param gravity_range: Gravity range (default value: 80)
    :param high_quality: Whether to produce high-quality layout a slight performance cost, lowers cooling rate so might require more iterations (default value: `True`)
    :param iterations: Number of iterations to run the layout for, per computation (default value: 2500)
    :param node_repulsion: Non-overlapping node force multiplier (default value: 6500)
    :param node_separation: Separation force between nodes (default value: 75)
    :param tier_separation: Separation force between tiers (default value: 200)
    """

    layout_type: GraphLayoutType = Field(default=GraphLayoutType.FCOSE, frozen=True)

    edge_elasticity: Optional[Number] = 0.45
    edge_length: Optional[Number] = 3
    energy: Optional[Number] = 0.1
    gravity: Optional[Number] = 35
    gravity_range: Optional[Number] = 80
    high_quality: Optional[bool] = True
    iterations: Optional[int] = 2500
    node_repulsion: Optional[Number] = 6_500
    node_separation: Optional[Number] = 75
    tier_separation: Optional[Number] = 200


class ForceAtlasLayout(GraphLayout):
    """
    ForceAtlas utilizes the `ForceAtlas2` algorithm to compute the layout. It is a force-directed layout
    which integrates various optimizations and is highly configurable.

    See https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0098679 for more details and
    in-depth explanations of the parameters.

    :param barnes_hut_optimize: Whether to use the Barnes-Hut approximation to calculate repulsive forces.
        Enabling it improves the performance at cost of accuracy. (default value: `False`)
    :param edge_weight_influence: Influence of edge weights on the layout. If set to 0, edge weights are ignored.
        Higher values emphasize the weight effects. This parameter is used to modify the attraction force between nodes. (default value: 1)
    :param gravity: This force prevents disconnected components from drifting away, attracting nodes towards the center
        of the space. Its main purpose is to compensate repulsion for nodes that are far away from the center. (default value:0.2)
    :param iterations: Number of iterations to run the layout for, per computation (default value: 10_000)
    :param lin_log_mode: Whether to use LinLog energy model, using logarithmic attraction force. Enabling it makes clusters
        tighter but converges slower. (default value: `True`)
    :param outbound_attraction_distribution: Whether to scale the attraction force between nodes according to their degree. (default value: `True`)
    :param scaling_ratio: Parameter to adjust the size of the produced graph (default value: 8)
    :param strong_gravity_mode: Whether to use strong gravity mode, which sets a force that attracts the nodes that are distant
        from the center more. This force has the drawback of being so strong that it is sometimes stronger than the other forces. It may result in a biased placement of the nodes.
        However, its advantage is to force a very compact layout, which may be useful for certain purposes. (default value: `False`)
    """

    layout_type: GraphLayoutType = Field(default=GraphLayoutType.FORCE_ATLAS, frozen=True)

    barnes_hut_optimize: Optional[bool] = False
    edge_weight_influence: Optional[Number] = 1
    gravity: Optional[Number] = 0.2
    iterations: Optional[int] = 10_000
    lin_log_mode: Optional[bool] = True
    outbound_attraction_distribution: Optional[bool] = True
    scaling_ratio: Optional[Number] = 8
    strong_gravity_mode: Optional[bool] = False


class MarketingLayout(GraphLayout, TieringLayout):
    """
    MarketingLayout provides the default graph layout which works well for smaller
    number of nodes, although it does not offer any protection against excessive edge crossings.

    :param node_size: node size in pixels
    :param target_location: Location of the target node
    :param tier_separation: Separation force between tiers (default value: 300)
    """

    layout_type: GraphLayoutType = Field(default=GraphLayoutType.MARKETING, frozen=True)
    target_location: Optional[TargetLocation] = None
    tier_separation: Optional[Number] = 300


class PlanarLayout(GraphLayout, TieringLayout):
    """
    PlanarLayout provides a planar layout similar to the layout offered in low-level editor. The implementation
    uses d3-dag's sugiyama layout under the hood to minimize edge crossings.

    :param orientation: Orientation of target node relative to other nodes (horizontal or vertical). (default value: horizontal)
    :param layering_algorithm: Algorithm to use for the layering step of sugyiama algorithm. Can chosen between simplex which
        optimizes for minimum edge length or long path which optimizes for minimum graph height.
        Do note that if tiers are passed in conjunction to this prop, its value will revert to simplex
        as tiers are only supported by it (defaults to: simplex)
    """

    layout_type: GraphLayoutType = Field(default=GraphLayoutType.PLANAR, frozen=True)
    layering_algorithm: Optional[LayeringAlgorithm] = LayeringAlgorithm.SIMPLEX
    orientation: Optional[DirectionType] = None


class SpringLayout(GraphLayout, TieringLayout, GroupingLayout):
    """
    SpringLayout provides a simple force-directed graph layout which produces the "spring" behavior of edges.
    This is a 'live' layout, which means a simulation keeps running in the background to compute the layout.

    :param collision_force: Multiplier for collision force between nodes (default value: 2)
    :param gravity: Gravity strength; negative values pull nodes together, positive values push them apart (default value: -50)
    :param link_force: Multiplier for link force between nodes, higher values produce shorter links (default value: 5)
    :param warmup_ticks: Number of ticks to run the simulation for before displaying the layout. Increasing it should
        make the initial render of the graph more stable (i.e. nodes won't move by themselves) but it comes at a
        small performance cost. (default value: 100)
    :param tier_separation: Separation force between tiers (default value: 300)
    :param group_repel_strength: Strength of repulsion force between groups (default value: 2000)
    """

    layout_type: GraphLayoutType = Field(default=GraphLayoutType.SPRING, frozen=True)

    collision_force: Optional[Number] = 2
    gravity: Optional[Number] = -50
    link_force: Optional[Number] = 5
    warmup_ticks: Optional[Number] = 100
    tier_separation: Optional[Number] = 300
    group_repel_strength: Optional[Number] = 2000
