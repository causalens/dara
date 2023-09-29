/* eslint-disable react-hooks/exhaustive-deps */

import { useMemo } from 'react';

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
    CausalGraphEdge,
    CausalGraphNode,
    CausalGraphViewer,
    EdgeConstraint,
    EdgeConstraintType,
    EdgeType,
    EditorMode,
    ZoomThresholds,
} from '@darajs/ui-causal-graph-editor';

import { GraphLayoutDefinition, parseLayoutDefinition } from './graph-layout';

interface VisualEdgeEncoderProps extends StyledComponentProps {
    /** Whether to allow node/edge selection even when editable = false */
    allow_selection_when_not_editable?: boolean;
    /** Allow editing */
    editable?: boolean;
    /** Graph layout definition object */
    graph_layout: GraphLayoutDefinition;
    /** Edge constraints to show */
    initial_constraints?: Variable<EdgeConstraint[]> | EdgeConstraint[];
    /** Available nodes */
    nodes: Variable<string[] | Record<string, CausalGraphNode>> | string[] | Record<string, CausalGraphNode>;
    /** Action def for clicking on an edge in the graph */
    on_click_edge?: Action;
    /** Action def for clicking on a node in the graph */
    on_click_node?: Action;
    /** Handler called whenever constraints are updated */
    on_update?: Action;
    /** Optional parameter to force a tooltip to use a particular font size */
    tooltip_size?: number;
    /** Optional user-defined zoom thresholds to use instead of defaults */
    zoom_thresholds?: ZoomThresholds;
}

const StyledGraphEditor = injectCss(CausalGraphViewer);

/**
 * Parse initially defined constraints.
 * Reverses backward directed edges.
 *
 * @param constraints constraints to parse
 */
function parseConstraints(constraints?: EdgeConstraint[]): EdgeConstraint[] {
    if (!constraints) {
        return [];
    }

    return constraints.map((c) => {
        let constraintType = c.type;
        let { source, target } = c;

        // Reverse backward edges
        if (constraintType === EdgeConstraintType.BACKWARD_DIRECTED) {
            [source, target] = [target, source];
            constraintType = EdgeConstraintType.DIRECTED;
        }

        return {
            ...c,
            source,
            target,
            type: constraintType,
        };
    });
}

function isNodeList(nodes: string[] | Record<string, CausalGraphNode>): nodes is string[] {
    return Array.isArray(nodes);
}

/**
 * Parse nodes provided by user to the uniform format
 *
 * @param nodes nodes to parse
 */
function parseNodes(nodes: string[] | Record<string, CausalGraphNode>): Record<string, CausalGraphNode> {
    if (isNodeList(nodes)) {
        return nodes.reduce((acc, n) => {
            return { ...acc, [n]: {} };
        }, {});
    }

    return nodes;
}

/**
 * A wrapper using essentially a preset of the high level causal graph editor under the hood,
 * exposing a similar API to SimpleEdgeEncoder + extra graph editor props which can be modified in this preset
 */
function VisualEdgeEncoder(props: VisualEdgeEncoderProps): JSX.Element {
    const { pushNotification } = Notifications.useNotifications();
    const [style, css] = useComponentStyles(props);
    const [nodes] = useVariable(props.nodes);
    const parsedNodes = useMemo(() => parseNodes(nodes), [nodes]);

    const [initialConstraints] = useVariable(props.initial_constraints);
    const parsedConstraints = useMemo(() => parseConstraints(initialConstraints), [initialConstraints]);

    const graphLayout = useMemo(() => parseLayoutDefinition(props.graph_layout), []);

    const [onClickEdge] = useAction(props.on_click_edge);
    const [onClickNode] = useAction(props.on_click_node);
    const [onUpdate] = useAction(props.on_update);

    // Parse provided list of nodes into a graph data object that's understood by the graph editor
    const graphData = useMemo<CausalGraph>(() => {
        return {
            // If initial constraints are passed, we need to also add edges for each constraint
            edges: parsedConstraints.reduce((acc, c) => {
                // Make sure the constraint is fully built - could be i.e. half-built by simple edge encoder
                if (c.source && c.target) {
                    if (!(c.source in acc)) {
                        acc[c.source] = {};
                    }

                    acc[c.source][c.target] = {
                        edge_type: EdgeType.UNDIRECTED_EDGE,
                        meta: {},
                    };
                }

                return acc;
            }, {} as Record<string, Record<string, CausalGraphEdge>>),
            nodes: parsedNodes,
            version: 'none', // doesn't matter as we don't output a whole graph
        };
    }, [parsedNodes, parsedConstraints]);

    return (
        <StyledGraphEditor
            $rawCss={css}
            allowSelectionWhenNotEditable={props.allow_selection_when_not_editable}
            editable={props.editable}
            editorMode={EditorMode.EDGE_ENCODER}
            graphData={graphData}
            graphLayout={graphLayout}
            initialConstraints={parsedConstraints}
            onClickEdge={onClickEdge}
            onClickNode={onClickNode}
            onEdgeConstraintsUpdate={onUpdate}
            onNotify={pushNotification}
            style={style}
            tooltipSize={props.tooltip_size}
            zoomThresholds={props.zoom_thresholds}
        />
    );
}

export default VisualEdgeEncoder;
