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

from pydantic import ConfigDict, SerializerFunctionWrapHandler, field_serializer

from cai_causal_graph import CausalGraph, Skeleton
from dara.components.graphs.definitions import (
    DEFAULT_LEGENDS,
    EditorMode,
    GraphLegend,
    ZoomThresholds,
)
from dara.components.graphs.graph_layout import FcoseLayout, GraphLayout
from dara.core.base_definitions import Action
from dara.core.definitions import StyledComponentInstance


class BaseGraphComponent(StyledComponentInstance):
    """
    Base class meant to be inherited by various graph viewer and editor components.

    :param additional_legends: Optional additional legends to show
    :param allow_selection_when_not_editable: Whether to allow nodes/edges to be selected even when `editable=False`
    :param available_inputs: Optional list of all available inputs. If provided, all nodes that aren't outputs and aren't
        included present in the list will be treated as latent nodes (will be renamable).
        If left blank, no nodes will be treated as latent.
    :param default_legends: A dict containing the default legends that should appear on the graph depending on the EditorMode selected.
    :param disable_edge_add: Optional flag for disabling edge addition
    :param disable_latent_node_add: Optional flag for disabling latent node addition
    :param disable_node_removal: Optional flag for disabling node removal
    :param non_removable_nodes: Optional list of node names that cannot be removed
    :param on_click_edge: Event handler for clicking on an edge
    :param on_click_node: Event handler for clicking on a node
    :param on_update: Optional action that will be executed whenever the graph is updated;
        by default will also update the `causal_graph` provided, if it's a plain Variable instance
    :param require_focus_to_zoom: Optional flag to require focus to be on the graph for the zoom to be active. Defaults to True.
    :param simultaneous_edge_node_selection: Optional allows for both a ndoe and an edge to be selected at
        the same time. When set to True will not reset edge when node selected and vice versa.
    :param tooltip_size: Optional parameter to force the tooltips to use a particular font size
    :param verbose_descriptions: Optional flag to show verbose descriptions in the editor frame
    :param zoom_thresholds: Optional user-defined zoom thresholds. See [ZoomThresholds](../definitions/#zoomthresholds) for more details.
    """

    additional_legends: Optional[List[GraphLegend]] = None
    allow_selection_when_not_editable: Optional[bool] = False
    available_inputs: Optional[List[str]] = None
    default_legends: Dict[Union[EditorMode, str], List[GraphLegend]] = DEFAULT_LEGENDS
    disable_edge_add: Optional[bool] = None
    disable_latent_node_add: Optional[bool] = None
    disable_node_removal: Optional[bool] = None
    editable: Optional[bool] = False
    graph_layout: Optional[GraphLayout] = FcoseLayout()
    non_removable_nodes: Optional[List[str]] = None
    on_click_edge: Optional[Action] = None
    on_click_node: Optional[Action] = None
    on_update: Optional[Action] = None
    require_focus_to_zoom: Optional[bool] = True
    simultaneous_edge_node_selection: Optional[bool] = False
    tooltip_size: Optional[int] = None
    verbose_descriptions: Optional[bool] = None
    zoom_thresholds: Optional[ZoomThresholds] = None

    model_config = ConfigDict(
        arbitrary_types_allowed=True,
        extra='forbid',
    )

    @field_serializer('*', mode='wrap')
    def serialize_graphs(self, value: Any, nxt: SerializerFunctionWrapHandler):
        # handle serializing fields of type CausalGraph and Skeleton
        if isinstance(value, (CausalGraph, Skeleton)):
            return value.to_dict()

        return nxt(value)
