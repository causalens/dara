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

from pydantic import field_validator, model_validator

from cai_causal_graph import CausalGraph, Skeleton
from dara.components.graphs.components.base_graph_component import BaseGraphComponent
from dara.components.graphs.definitions import EditorMode
from dara.components.graphs.graph_layout import PlanarLayout
from dara.core.interactivity import DerivedVariable, Variable
from dara.core.logging import dev_logger


class CausalGraphViewer(BaseGraphComponent):
    """
    ![Causal Graph Viewer](../../../../../docs/packages/dara-components/graphs/assets/CausalGraphViewer.png)

    The causal graph is rendered using the High-Level CausalGraph Viewer JS component.

    To use the `CausalGraphViewer`, you need to provide a `CausalGraph` instance, a `Variable` or a `DerivedVariable` containing
    a causal graph. The causal graph can be provided either as a `CausalGraph` instance, as a `Skeleton` instance of the `CausalGraph` or as a `dict`.

    ```python
    from dara.components import CausalGraphViewer

    from cai_causal_graph import CausalGraph

    causal_graph = CausalGraph()
    causal_graph.add_edge('A', 'B')
    causal_graph.add_edge('B', 'C')
    causal_graph.add_edge('A', 'C')

    CausalGraphViewer(causal_graph=causal_graph)
    ```

    The causal graph can be edited by setting `editable=True`. The editor mode can be set to `EditorMode.DEFAULT`
    (default), `EditorMode.PAG` or `EditorMode.RESOLVER`. The `EditorMode.DEFAULT` mode assumes all edges
    are directed (the causal graph is a DAG). The `EditorMode.PAG` mode displays all edge types (beyond directed), while
    `EditorMode.RESOLVER` allows users to confirm and accept edges. To change the editor mode, set the `editor_mode`
    parameter.

    ```python
    from dara.components import CausalGraphViewer, EditorMode
    from cai_causal_graph import CausalGraph

    causal_graph = CausalGraph()
    causal_graph.add_edge('A', 'B')
    causal_graph.add_edge('B', 'C')
    causal_graph.add_edge('A', 'C')

    CausalGraphViewer(
        causal_graph=causal_graph,
        editor_mode=EditorMode.PAG,
    )
    ```

    The causal graph can be rendered in a custom layout by providing a `graph_layout` object. The layout can be
    specified either a `GraphLayout` instance. The following layouts are supported:

    - `PlanarLayout` - a layout that places nodes in a grid-like fashion, with optional support for
        specifying the direction (horizontal or vertical).
    - `CircularLayout` - a layout that places nodes in a circle.
    - `SpringLayout` - a layout that uses a simple force-directed algorithm to place nodes.
    - `ForceAtlasLayout` - a layout that uses a `ForceAtlas2` algorithm to place nodes.
    - `FCoseLayout` - a layout that uses a `fCoSE` algorithm to place nodes.
    - `MarketingLayout` - a layout that uses a force-directed algorithm to place nodes, however it does not
        offer any protection against edge crossings.

    ```python
    from dara.components import CausalGraphViewer, PlanarLayout

    from cai_causal_graph import CausalGraph

    causal_graph = CausalGraph()
    causal_graph.add_edge('A', 'B')
    causal_graph.add_edge('B', 'C')
    causal_graph.add_edge('A', 'C')

    CausalGraphViewer(
        causal_graph=causal_graph,
        editable=True,
        graph_layout=PlanarLayout(),
    )
    ```

    ![Causal Graph Viewer](../../../../../docs/packages/dara-components/graphs/assets/CausalGraphViewerPlanar.png)

    In order to interact with the causal graph, you can provide `on_click_node` and `on_click_edge`
    event handlers in order to trigger actions upon clicking on an edge or a node. The following example
    demonstrates how to use the `on_click_node` and `on_click_edge` event handlers to update a variable
    with the name of the clicked node or edge.

    ```python
    from dara.core import Variable, py_component, action
    from dara.components import CausalGraphViewer, PlanarLayout, Stack, Text

    from cai_causal_graph import CausalGraph

    selected_node = Variable(None)
    selected_edge = Variable(None)

    causal_graph = CausalGraph()
    causal_graph.add_edge('A', 'B')
    causal_graph.add_edge('B', 'C')
    causal_graph.add_edge('A', 'C')

    @action
    async def resolver_on_click_node(ctx: action.Ctx):
        value = ctx.input.get('identifier') if isinstance(ctx.input, dict) else None
        await ctx.update(variable=selected_node, value=value)

    @action
    async def resolver_on_click_edge(ctx: action.Ctx):
        await ctx.update(variable=selected_edge, value=f"{ctx.input.get('source')} -> {ctx.input.get('destination')}")

    @py_component
    def display(selected_node, selected_edge):
        return Stack(
            Text(f"Selected Node: {selected_node}"),
            Text(f"Selected Edge: {selected_edge}"),
        )

    Stack(
        CausalGraphViewer(
            causal_graph=causal_graph,
            graph_layout=PlanarLayout(),
            on_click_node=resolver_on_click_node(),
            on_click_edge=resolver_on_click_edge(),
        ),
        display(selected_node, selected_edge),
    )
    ```

    ![Causal Graph Viewer](../../../../../docs/packages/dara-components/graphs/assets/CausalGraphViewerUpdate.png)

    The `CausalGraph` supports the following metadata properties on edges and nodes:

    `edge.meta.rendering_properties`
    - accepted: boolean - whether edge was accepted (used by resolver component)
    - color: string - edge color, defaults to `Theme.colors.grey5`
    - description: string - description/note displayed in side panel
    - forced: boolean - whether edge was forced by constraints from domain knowledge
    - thickness: number - edge thickness; provided values are normalized and scaled across all edge thicknesses provided
    - tooltip: string | dict[string, string] - extra information to display in tooltip

    `node.meta.rendering_properties`
    - color: string - node color, defaults to `Theme.colors.background` for latent nodes, `Theme.colors.secondary` for output nodes and to `Theme.colors.blue4` for other nodes
    - highlight_color: string - color used for border and selected shadow, defaults to `Theme.colors.primary`
    - label: string - human-readable alternative label to display instead of the node name
    - label_color: string - node font color
    - label_size: string | number - node font size
    - latent: boolean - whether the node is latent; if not provided, computed based on available_inputs set
    - size: number - node radius in pixels
    - tooltip: string | dict[string, string] - extra information to display in tooltip
    - x: number - x position of node
    - y: number - y position of node

    To use rendering properties, you can provide them in the metadata of the causal graph, e.g.:

    ```python
    from dara.components import CausalGraphViewer

    from cai_causal_graph import CausalGraph

    causal_graph = CausalGraph()
    causal_graph.add_edge('A', 'B')
    causal_graph.add_edge('B', 'C')
    causal_graph.add_edge('A', 'C')

    causal_graph.nodes[0].meta['rendering_properties'] = {
        'color': 'salmon',
        'highlight_color': 'red',
        'label_color': 'purple',
        'label_size': 20,
        'size': 20,
        'tooltip': 'Node A tooltip',
    }

    causal_graph.edges[0].meta['rendering_properties'] = {
        'color': 'blue',
        'description': 'Edge A -> B',
        'thickness': 1,
        'tooltip': 'Edge A -> B tooltip',
    }

    causal_graph.edges[1].meta['rendering_properties'] = {
        'color': 'green',
        'description': 'Edge B -> C',
        'thickness': 2,
        'tooltip': 'Edge B -> C tooltip',
    }

    CausalGraphViewer(causal_graph=causal_graph)

    ```

    ![Causal Graph Viewer](../../../../../docs/packages/dara-components/graphs/assets/CausalGraphViewerStyling.png)

    If both `x` and `y` coordinates are provided for all nodes, the graph initializes in the precomputed layout
    rather than running the specified `graph_layout`. Afterwards pressing `Recalculate Layout` will
    re-run the specified layout. Providing `CustomLayout` can be useful to make the `Recalculate...` button
    restore the initial pre-computed layout.

    :param allow_selection_when_not_editable: Whether to allow nodes/edges to be selected even when `editable=False`
    :param additional_legends: Optional additional legends to show
    :param available_inputs: Optional list of all available inputs. If provided, all nodes that aren't outputs and aren't
        included present in the list will be treated as latent nodes (will be renamable).
        If left blank, no nodes will be treated as latent.
    :param causal_graph: The CausalGraph data to render, or a Skeleton representation of the graph
    :param default_legends: A dict containing the default legends that should appear on the graph depending on the EditorMode selected.
    :param disable_edge_add: Optional flag for disabling edge addition
    :param disable_latent_node_add: Optional flag for disabling latent node addition
    :param disable_node_removal: Optional flag for disabling node removal
    :param editable: Optional flag to enable editing the graph by showing an editor frame around the graph
    :param editor_mode: Optional editor mode to use. The following options are available:
        EditorMode.DEFAULT - Default DAG viewer, assumes all edges are directed.
        EditorMode.PAG - PAG viewer, displays all edge types.
        EditorMode.RESOLVER - Resolver mode, allows users to accept edges.
    :param graph_layout: Optional layout configuration object
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
    :param zoom_thresholds: Optional user-defined zoom thresholds. See `ZoomThresholds` for more details.
    """

    js_module = '@darajs/components'

    causal_graph: Union[CausalGraph, DerivedVariable, Variable, dict, Skeleton]
    editor_mode: Optional[EditorMode] = None

    @field_validator('causal_graph')
    @classmethod
    def validate_causal_graph(cls, causal_graph):
        """
        Validate that the causal graph is valid
        """
        if isinstance(causal_graph, (DerivedVariable, Variable)):
            return causal_graph

        if not isinstance(causal_graph, (CausalGraph, Skeleton, dict)):
            raise ValueError(
                f'Invalid causal graph type: {causal_graph}, must be a CausalGraph instance, its Skeleton, its dict representation, or a variable containing an instance'
            )
        return causal_graph

    @model_validator(mode='after')
    def validate_layout(self):
        if isinstance(self.graph_layout, PlanarLayout) and self.editor_mode != EditorMode.DEFAULT:
            dev_logger.warning(
                'Planar Layout is currently only supported with EditorMode.DEFAULT. Setting editor_mode to EditorMode.DEFAULT.'
            )
            self.editor_mode = EditorMode.DEFAULT
        return self
