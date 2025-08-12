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

from typing import Any, Dict, List, Optional, Union

from fastapi.encoders import jsonable_encoder
from pydantic import (
    ConfigDict,
    SerializerFunctionWrapHandler,
    field_serializer,
    model_validator,
)
from typing_extensions import TypedDict

from cai_causal_graph.graph_components import Node
from cai_causal_graph.type_definitions import EdgeConstraint as EdgeConstraintType
from dara.components.graphs.definitions import DEFAULT_LEGENDS, EditorMode, GraphLegend
from dara.components.graphs.graph_layout import (
    GraphLayout,
    MarketingLayout,
    PlanarLayout,
)
from dara.core.base_definitions import Action
from dara.core.definitions import StyledComponentInstance
from dara.core.interactivity import AnyVariable, ClientVariable


class EdgeConstraint(TypedDict):
    """
    EdgeConstraint object denotes a constraint between two nodes in the graph.

    It is used to build a list of constraints for `VisualEdgeEncoder` component.
    """

    source: str
    target: str
    type: EdgeConstraintType


class VisualEdgeEncoder(StyledComponentInstance):
    """
    ![EdgeEncoder](../../../../../docs/packages/dara-components/graphs/assets/EdgeEncoder.png)
    The VisualEdgeEncoder component allows the user to build a list of edge constraints using a graph editor component

    A VisualEdgeEncoder component is created via:

    ```python
    from dara.core import Variable
    from dara.components import VisualEdgeEncoder

    encoder = VisualEdgeEncoder(
        nodes=["First node", "Second node", "Third node"]
    )

    # saves results in a variable
    output_constraints = Variable()
    variable_encoder = VisualEdgeEncoder(
        nodes=["First node", "Second node", "Third node"],
        on_update=output_constraints.sync(),
    )

    ```

    Alternatively, you can pass in a dict of [str, Node] to the `nodes` parameter to use the `CausalGraph.Node` object:

    ```python
    from cai_causal_graph import CausalGraph
    from dara.components import VisualEdgeEncoder
    output_constraints = Variable()

    VisualEdgeEncoder(
        nodes={
            "First node": CausalGraph.Node("First node"),
            "Second node": CausalGraph.Node("Second node")
        },
        on_update=output_constraints.sync(),
    )
    ```

    You can also pass in a list of `EdgeConstraint` objects to the `initial_constraints` parameter to pre-populate the graph:

    ```python
    from cai_causal_graph import CausalGraph
    from cai_causal_graph.type_definitions import EdgeConstraint as EdgeConstraintType
    from dara.components import VisualEdgeEncoder, EdgeConstraint

    output_constraints = Variable()

    VisualEdgeEncoder(
        nodes=["First node", "Second node", "Third node"],
        initial_constraints=[
            EdgeConstraint(source="First node", target="Second node", type=EdgeConstraintType.HARD_UNDIRECTED_EDGE),
            EdgeConstraint(source="Second node", target="Third node", type=EdgeConstraintType.HARD_DIRECTED_EDGE)
        ],
        on_update=output_constraints.sync(),
    )
    ```
    :param additional_legends: Optional additional legends to show
    :param allow_selection_when_not_editable: Whether to allow nodes/edges to be selected even when `editable=False`
    :param default_legends: A dict containing the default legends that should appear on the graph depending on the EditorMode selected.
    :param editable: Optional flag to enable editing the graph by showing an editor frame around the graph
    :param graph_layout: Optional layout configuration object
    :param initial_constraints: Optional initial edge constraints. Can be passed as a list of `EdgeConstraint` objects or a Variable.
    :param node_size: Optional parameter to force the node size to be larger
    :param nodes: List of available nodes - can be passed as a list of strings or a dict of [str, Node]
    :param on_click_edge: Optional `Action` triggered when clicking on an edge
    :param on_click_node: Optional `Action` triggered when clicking on a node
    :param on_update: Optional `Action` for all hierarchy changes, called with built list of constraints.
        Note that when updating a Variable passed into `initial_constraints` it will re-render the component on each update,
        use a different Variable for the output of the component.
    :param require_focus_to_zoom: Optional flag to require focus to be on the graph for the zoom to be active. Defaults to True.
    :param tooltip_size: Optional parameter to force a tooltip to use a particular font size
    :param zoom_thresholds: Optional user-defined zoom thresholds. See `ZoomThresholds` for more details.
    """

    js_module = '@darajs/components'

    additional_legends: Optional[List[GraphLegend]] = None
    allow_selection_when_not_editable: Optional[bool] = False
    default_legends: Dict[Union[EditorMode, str], List[GraphLegend]] = DEFAULT_LEGENDS
    editable: Optional[bool] = False
    graph_layout: Optional[GraphLayout] = MarketingLayout()
    initial_constraints: Optional[Union[List[EdgeConstraint], ClientVariable]] = None
    nodes: Union[List[str], Dict[str, Node], ClientVariable]
    on_click_edge: Optional[Action] = None
    on_click_node: Optional[Action] = None
    on_update: Optional[Action] = None
    require_focus_to_zoom: Optional[bool] = True
    tooltip_size: Optional[str] = None

    model_config = ConfigDict(
        arbitrary_types_allowed=True,
        extra='forbid',
    )

    @model_validator(mode='after')
    def validate_layout(self):
        if isinstance(self.graph_layout, PlanarLayout):
            raise ValueError('Planar Layout is not currently supported by EdgeEncoder.')

        return self

    @field_serializer('nodes', mode='wrap')
    def serialize_nodes(self, value: Any, nxt: SerializerFunctionWrapHandler):
        if isinstance(value, dict):
            if len(value.keys()) == 0:
                return value
            # Handle dict[str, Node]
            if isinstance(value.get(list(value.keys())[0]), Node):
                result = {k: v.to_dict() for k, v in value.items()}
                return result

        # For some reason just invoking nxt() in it will not invoke the proper variable serialization
        if isinstance(value, AnyVariable):
            return jsonable_encoder(value)

        return nxt(value)
