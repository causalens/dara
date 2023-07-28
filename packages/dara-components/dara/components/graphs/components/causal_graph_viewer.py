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

from typing import Optional, Union

from cai_causal_graph import CausalGraph
from pydantic import root_validator, validator

from dara.components.graphs.components.base_graph_component import BaseGraphComponent
from dara.components.graphs.definitions import EditorMode
from dara.components.graphs.graph_layout import PlanarLayout
from dara.core.interactivity import DerivedVariable, Variable


class CausalGraphViewer(BaseGraphComponent):
    """
    ![Causal Graph Viewer](../../../../../docs/packages/dara-components/graphs/assets/CausalGraphViewer.png)

    Render a causal_graph using the High-Level CausalGraph Viewer JS component.

    Supports the following metadata properties on edges and nodes:

    `edge.meta.rendering_properties`
    - accepted?: boolean - whether edge was accepted (used by resolver component)
    - color?: string - edge color
    - description?: string - description/note displayed in side panel
    - forced?: boolean - whether edge was forced by constraints from domain knowledge
    - thickness?: number - edge thickness; provided values are normalized and scaled across all edge thicknesses provided
    - tooltip?: string | dict[string, string] - extra information to display in tooltip

    `node.meta.rendering_properties`
    - color?: string - whether edge was accepted (used by resolver component)
    - highlight_color?: string - color used for border and selected shadow
    - label?: string - human-readable alternative label to display instead of the node name
    - label_color?: string - node font color
    - label_size?: string | number - node font size
    - latent?: boolean - whether the node is latent; if not provided, computed based on available_inputs set
    - size?: number - node radius in pixels
    - tooltip?: string | dict[string, string] - extra information to display in tooltip
    - x?: number - x position of node
    - y?: number - y position of node

    If both `x` and `y` coordinates are provided for all nodes, the graph initializes in the precomputed layout
    rather than running the specified `graph_layout`. Afterwards pressing `Recalculate Layout` will
    re-run the specified layout. Providing `CustomLayout` can be useful to make the `Recalculate...` button
    restore the initial pre-computed layout.

    :param allow_selection_when_not_editable: Whether to allow nodes/edges to be selected even when `editable=False`
    :param additional_legends: Optional additional legends to show
    :param available_inputs: Optional list of all available inputs. If provided, all nodes that aren't outputs and aren't
        included present in the list will be treated as latent nodes (will be renamable).
        If left blank, no nodes will be treated as latent.
    :param causal_graph: The CausalGraph data to render
    :param disable_edge_add: Optional flag for disabling edge addition
    :param disable_latent_node_add: Optional flag for disabling latent node addition
    :param disable_node_removal: Optional flag for disabling node removal
    :param editable: Optional flag to enable editing the graph by showing an editor frame around the graph
    :param graph_layout: Optional layout configuration object
    :param non_removable_nodes: Optional list of node names that cannot be removed
    :param on_click_edge: Event handler for clicking on an edge
    :param on_click_node: Event handler for clicking on a node
    :param on_update: Optional action that will be executed whenever the graph is updated;
        by default will also update the `causal_graph` provided, if it's a plain Variable instance
    :param tooltip_size: Optional parameter to force the tooltips to use a particular font size
    :param verbose_descriptions: Optional flag to show verbose descriptions in the editor frame
    :param zoom_thresholds: Optional user-defined zoom thresholds. See `ZoomThresholds` for more details.
    """

    js_module = '@darajs/components'

    causal_graph: Optional[Union[CausalGraph, DerivedVariable, Variable]]
    editor_mode: EditorMode = EditorMode.DEFAULT

    @validator('causal_graph')
    @classmethod
    def validate_causal_graph(cls, causal_graph):
        """
        Validate that the causal graph is valid
        """
        if isinstance(causal_graph, (DerivedVariable, Variable)):
            return causal_graph

        if not isinstance(causal_graph, (CausalGraph, dict)):
            raise ValueError(
                f'Invalid causal graph type: {causal_graph}, must be a CausalGraph instance, its dict representation, or a variable containing an instance'
            )
        return causal_graph

    @root_validator
    @classmethod
    def validate_layout(cls, values: dict):
        if (
            isinstance(values.get('graph_layout'), PlanarLayout)
            and values.get('editor_mode', EditorMode.DEFAULT) != EditorMode.DEFAULT
        ):
            raise ValueError('Planar Layout is currently only supported with EditorMode.DEFAULT.')

        return values
