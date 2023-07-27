"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from typing import Dict, List, Optional, Union

from cai_causal_graph.graph_components import Node
from cai_causal_graph.type_definitions import EdgeConstraint as EdgeConstraintType
from pydantic import root_validator
from typing_extensions import TypedDict

from dara.components.graphs.graph_layout import (
    GraphLayout,
    MarketingLayout,
    PlanarLayout,
)
from dara.core.base_definitions import Action
from dara.core.definitions import StyledComponentInstance
from dara.core.interactivity import NonDataVariable


class EdgeConstraint(TypedDict):
    source: str
    target: str
    type: EdgeConstraintType


class VisualEdgeEncoder(StyledComponentInstance):
    """
    ![EdgeEncoder](../../../../../docs/packages/dara-components/graphs/assets/EdgeEncoder.png)
    The VisualEdgeEncoder component allows the user to build a list of edge constraints using a graph editor component

    A VisualEdgeEncoder component is created via:

    ```python
    from dara.core import Variable, UpdateVariable
    from dara.components.graphs import VisualEdgeEncoder

    encoder = VisualEdgeEncoder(
        nodes=["First node", "Second node", "Third node"]
    )

    # saves results in a variable
    output_constraints = Variable()
    variable_encoder = VisualEdgeEncoder(
        nodes=["First node", "Second node", "Third node"],
        on_update=UpdateVariable(lambda ctx: ctx.inputs.new, variable=output_constraints)
    )

    ```

    Alternatively, you can pass in a dict of [str, Node] to the `nodes` parameter to use the `CausalGraph.Node` object:
    ```python
    from cai_causal_graph import CausalGraph
    from dara.components.graphs import VisualEdgeEncoder
    VisualEdgeEncoder(
        nodes={'a': CausalGraph.Node('a'), 'b': CausalGraph.Node('b')}
    )
    ```


    :param allow_selection_when_not_editable: Whether to allow nodes/edges to be selected even when `editable=False`
    :param editable: Optional flag to enable editing the graph by showing an editor frame around the graph
    :param graph_layout: Optional layout configuration object
    :param initial_constraints: Optional initial edge constraints
    :param node_size: Optional parameter to force the node size to be larger
    :param nodes: List of available nodes - can be passed as a list of strings or a dict of [str, Node]
    :param on_click_edge: Event handler for clicking on an edge
    :param on_click_node: Event handler for clicking on a node
    :param on_update: Optional event handler for all hierarchy changes, called with built list of constraints.
        Note that when updating a Variable passed into `initial_constraints` it will re-render the component on each update,
        use a different Variable for the output of the component.
    :param tooltip_size: Optional parameter to force a tooltip to use a particular font size
    :param zoom_thresholds: Optional user-defined zoom thresholds. See `ZoomThresholds` for more details.
    """

    js_module = '@darajs/components'

    allow_selection_when_not_editable: Optional[bool] = False
    editable: Optional[bool] = False
    graph_layout: Optional[GraphLayout] = MarketingLayout()
    initial_constraints: Optional[Union[List[EdgeConstraint], NonDataVariable]] = None
    nodes: Union[List[str], Dict[str, Node], NonDataVariable]
    on_click_edge: Optional[Action] = None
    on_click_node: Optional[Action] = None
    on_update: Optional[Action] = None
    tooltip_size: Optional[str] = None

    class Config:
        arbitrary_types_allowed = True

    @root_validator
    @classmethod
    def validate_layout(cls, values: dict):
        if isinstance(values.get('graph_layout'), PlanarLayout):
            raise ValueError('Planar Layout is not currently supported by EdgeEncoder.')

        return values
