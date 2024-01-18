/* eslint-disable react-hooks/exhaustive-deps */

import { ComponentProps, useMemo } from 'react';

import {
    Action,
    Notifications,
    StyledComponentProps,
    Variable,
    injectCss,
    useAction,
    useComponentStyles,
    useVariable,
} from '@darajs/core';
import {
    CausalGraph,
    EditorMode,
    CausalGraphViewer as UICausalGraphViewer,
    ZoomThresholds,
} from '@darajs/ui-causal-graph-editor';

import { GraphLayoutDefinition, parseLayoutDefinition } from './graph-layout';

export interface CausalGraphViewerProps extends StyledComponentProps {
    /** Optional additional legends to show */
    additional_legends?: ComponentProps<typeof UICausalGraphViewer>['additionalLegends'];
    /** Whether to allow node/edge selection even when editable = false */
    allow_selection_when_not_editable?: boolean;
    /** All available inputs; used to check which nodes are latent */
    available_inputs?: string[];
    /** The graph data to render */
    causal_graph: Variable<CausalGraph> | CausalGraph;
    /** Flag for disabling edge addition */
    disable_edge_add?: boolean;
    /** Flag for disabling latent node addition */
    disable_latent_node_add?: boolean;
    /** Flag for disabling node removal */
    disable_node_removal?: boolean;
    /** Allow editing */
    editable?: boolean;
    /** Graph viewer mode */
    editor_mode?: EditorMode;
    /** Graph layout definition object */
    graph_layout: GraphLayoutDefinition;
    /** Array of node names that cannot be removed */
    non_removable_nodes?: Array<string>;
    /** Action def for clicking on an edge in the graph */
    on_click_edge?: Action;
    /** Action def for clicking on a node in the graph */
    on_click_node?: Action;
    /** Action def for any updates to the graph */
    on_update?: Action;
    /** Optional boolean defining whether a node and an edge can be selected simultaneously */
    simultaneous_edge_node_selection?: boolean;
    /** Optional parameter to force a tooltip to use a particular font size */
    tooltip_size?: number;
    /** Whether to show verbose descriptions in the editor frame */
    verbose_descriptions?: boolean;
    /** Optional user-defined zoom thresholds to use instead of defaults */
    zoom_thresholds?: ZoomThresholds;
}

const StyledGraphViewer = injectCss(UICausalGraphViewer);

/**
 * A simple wrapper around the UICausalGraphViewer that calls into the Causalnet Extension to get the causal graph
 * and display it
 *
 * @param props the component props
 * @returns
 */
function CausalGraphViewer(props: CausalGraphViewerProps): JSX.Element {
    const { pushNotification } = Notifications.useNotifications();
    const [style, css] = useComponentStyles(props);

    const [graphData, setCausalGraphVariable] = useVariable(props.causal_graph);
    const [onClickNode] = useAction(props.on_click_node);
    const [onClickEdge] = useAction(props.on_click_edge);
    const [onUpdate] = useAction(props.on_update);

    const graphLayout = useMemo(() => parseLayoutDefinition(props.graph_layout), []);

    const onGraphUpdate = (value: CausalGraph): void => {
        setCausalGraphVariable(value);
        onUpdate(value);
    };

    if (!props.causal_graph) {
        return null;
    }

    console.log('AYO');
    console.log(props.simultaneous_edge_node_selection);

    return (
        <StyledGraphViewer
            $rawCss={css}
            additionalLegends={props.additional_legends}
            allowSelectionWhenNotEditable={props.allow_selection_when_not_editable}
            availableInputs={props.available_inputs}
            disableEdgeAdd={props.disable_edge_add}
            disableLatentNodeAdd={props.disable_latent_node_add}
            disableNodeRemoval={props.disable_node_removal}
            editable={props.editable}
            editorMode={props.editor_mode}
            graphData={graphData}
            graphLayout={graphLayout}
            nonRemovableNodes={props.non_removable_nodes}
            onClickEdge={onClickEdge}
            onClickNode={onClickNode}
            onNotify={pushNotification}
            onUpdate={onGraphUpdate}
            simultaneousEdgeNodeSelection={props.simultaneous_edge_node_selection}
            style={style}
            tooltipSize={props.tooltip_size}
            verboseDescriptions={props.verbose_descriptions}
            zoomThresholds={props.zoom_thresholds}
        />
    );
}

export default CausalGraphViewer;
