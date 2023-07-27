"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""

from typing import Dict, List, Optional

from dara.components.graphs.definitions import ZoomThresholds
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
    :param disable_edge_add: Optional flag for disabling edge addition
    :param disable_latent_node_add: Optional flag for disabling latent node addition
    :param disable_node_removal: Optional flag for disabling node removal
    :param non_removable_nodes: Optional list of node names that cannot be removed
    :param on_click_edge: Event handler for clicking on an edge
    :param on_click_node: Event handler for clicking on a node
    :param on_update: Optional action that will be executed whenever the graph is updated;
        by default will also update the `causal_graph` provided, if it's a plain Variable instance
    :param tooltip_size: Optional parameter to force the tooltips to use a particular font size
    :param verbose_descriptions: Optional flag to show verbose descriptions in the editor frame
    :param zoom_thresholds: Optional user-defined zoom thresholds. See `ZoomThresholds` for more details.
    """

    additional_legends: Optional[List[Dict[str, str]]] = None
    allow_selection_when_not_editable: Optional[bool] = False
    available_inputs: Optional[List[str]] = None
    disable_edge_add: Optional[bool] = None
    disable_latent_node_add: Optional[bool] = None
    disable_node_removal: Optional[bool] = None
    editable: Optional[bool] = False
    graph_layout: Optional[GraphLayout] = FcoseLayout()
    non_removable_nodes: Optional[List[str]] = None
    on_click_edge: Optional[Action] = None
    on_click_node: Optional[Action] = None
    on_update: Optional[Action] = None
    tooltip_size: Optional[int] = None
    verbose_descriptions: Optional[bool] = None
    zoom_thresholds: Optional[ZoomThresholds] = None

    class Config:
        arbitrary_types_allowed = True
        extra = 'forbid'
