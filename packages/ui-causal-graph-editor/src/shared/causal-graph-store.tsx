/**
 * Copyright 2023 Impulse Innovations Limited
 *
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { IPointData } from 'pixi.js';
import { Reducer } from 'react';

import { EdgeType, EditorMode, GraphState, SimulationEdge, SimulationGraph, VariableType } from '../types';

export enum GraphActionType {
    ACCEPT_EDGE = 'ACCEPT_EDGE',
    ADD_EDGE = 'ADD_EDGE',
    ADD_LATENT_NODE = 'ADD_LATENT_NODE',
    INIT = 'INIT',
    INIT_GRAPH = 'INIT_GRAPH',
    REMOVE_EDGE = 'REMOVE_EDGE',
    REMOVE_NODE = 'REMOVE_NODE',
    RENAME_NODE = 'RENAME_NODE',
    REVERSE_EDGE = 'REVERSE_EDGE',
    UPDATE_EDGE = 'UPDATE_EDGE',
    UPDATE_EDGE_NOTE = 'UPDATE_EDGE_NOTE',
    UPDATE_EDGE_TYPE = 'UPDATE_EDGE_TYPE',
    UPDATE_NODE = 'UPDATE_NODE',
}

interface AcceptEdgeAction {
    source: string;
    target: string;
    type: GraphActionType.ACCEPT_EDGE;
}

interface AddEdgeAction {
    edgeEncoderMode?: boolean;
    source: string;
    target: string;
    type: GraphActionType.ADD_EDGE;
}

interface AddLatentNodeAction {
    position: IPointData;
    type: GraphActionType.ADD_LATENT_NODE;
}

interface InitGraphAction {
    graph: SimulationGraph;
    editorMode: EditorMode;
    type: GraphActionType.INIT_GRAPH;
}

interface RenameNodeAction {
    label: string;
    node: string;
    type: GraphActionType.RENAME_NODE;
}

interface RemoveEdgeAction {
    edge: [string, string];
    type: GraphActionType.REMOVE_EDGE;
}

interface ReverseEdgeAction {
    edge: [string, string];
    type: GraphActionType.REVERSE_EDGE;
}

interface RemoveNodeAction {
    node: string;
    type: GraphActionType.REMOVE_NODE;
}

interface UpdateEdgeAction {
    extras: Record<string, any>;
    source: string;
    target: string;
    type: GraphActionType.UPDATE_EDGE;
}

interface UpdateEdgeTypeAction {
    edge_type: EdgeType;
    source: string;
    target: string;
    type: GraphActionType.UPDATE_EDGE_TYPE;
}

interface UpdateEdgeNoteAction {
    note: string;
    source: string;
    target: string;
    type: GraphActionType.UPDATE_EDGE_NOTE;
}

interface UpdateNodeAction {
    extras: Record<string, any>;
    node: string;
    type: GraphActionType.UPDATE_NODE;
}

export type GraphAction =
    | AcceptEdgeAction
    | AddEdgeAction
    | AddLatentNodeAction
    | InitGraphAction
    | RenameNodeAction
    | RemoveEdgeAction
    | ReverseEdgeAction
    | RemoveNodeAction
    | UpdateEdgeAction
    | UpdateEdgeTypeAction
    | UpdateNodeAction
    | UpdateEdgeNoteAction;

/**
 * The main reducer for applying edits to a graph and keeping the structure consistent.
 *
 * @param state the current state of the graph to apply mutations to
 * @param action the action to perform
 */
export const GraphReducer: Reducer<GraphState, GraphAction> = (state, action) => {
    const draft = { ...state };

    // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
    switch (action.type) {
        case GraphActionType.ACCEPT_EDGE: {
            draft.graph.setEdgeAttribute(action.source, action.target, 'meta.rendering_properties.accepted', true);

            break;
        }

        case GraphActionType.ADD_EDGE: {
            const edgeType =
                [EditorMode.DEFAULT, EditorMode.RESOLVER].includes(state.editorMode) ?
                    EdgeType.DIRECTED_EDGE
                :   EdgeType.UNDIRECTED_EDGE;

            const attributes: SimulationEdge = {
                edge_type: edgeType,
                originalMeta: {},
            };

            draft.graph.addEdge(action.source, action.target, attributes);

            break;
        }

        case GraphActionType.ADD_LATENT_NODE: {
            // Find all default-named latent nodes
            const re = RegExp('^L\\d+$');
            const latentNodes = draft.graph
                .filterNodes((key) => re.test(key))
                .sort((a, b) => parseInt(a) - parseInt(b));

            const lastNodeNum =
                latentNodes[latentNodes.length - 1] ? parseInt(latentNodes[latentNodes.length - 1].slice(1)) : -1;
            const nextNode = `L${lastNodeNum + 1}`;

            draft.graph.addNode(nextNode, {
                id: nextNode,
                'meta.rendering_properties.latent': true,
                'meta.rendering_properties.x': action.position.x,
                'meta.rendering_properties.y': action.position.y,
                originalMeta: {},
                size: draft.graph.getAttribute('size'),
                variable_type: VariableType.UNSPECIFIED,
                ...(draft.newNodesRequirePosition ? { x: action.position.x, y: action.position.y } : {}),
            });

            break;
        }

        case GraphActionType.INIT_GRAPH: {
            draft.graph = action.graph;
            draft.editorMode = action.editorMode;

            break;
        }

        case GraphActionType.REMOVE_EDGE: {
            const [source, target] = action.edge;

            draft.graph.dropEdge(source, target);

            break;
        }

        case GraphActionType.REVERSE_EDGE: {
            const [source, target] = action.edge;

            const edgeKey = draft.graph.edge(source, target);
            const edgeAttributes = draft.graph.getEdgeAttributes(edgeKey);

            // drop previous edge
            draft.graph.dropEdge(edgeKey);

            // Add same edge but reversed
            draft.graph.addEdgeWithKey(edgeKey, target, source, edgeAttributes);

            break;
        }

        case GraphActionType.RENAME_NODE: {
            draft.graph.setNodeAttribute(action.node, 'meta.rendering_properties.label', action.label);

            break;
        }

        case GraphActionType.REMOVE_NODE: {
            draft.graph.dropNode(action.node);

            break;
        }

        case GraphActionType.UPDATE_EDGE: {
            draft.graph.updateEdgeAttribute(action.source, action.target, 'extras', () => {
                return action.extras;
            });

            break;
        }

        case GraphActionType.UPDATE_EDGE_TYPE: {
            draft.graph.setEdgeAttribute(action.source, action.target, 'edge_type', action.edge_type);

            break;
        }

        case GraphActionType.UPDATE_EDGE_NOTE: {
            draft.graph.setEdgeAttribute(
                action.source,
                action.target,
                'meta.rendering_properties.description',
                action.note
            );
            break;
        }

        case GraphActionType.UPDATE_NODE: {
            draft.graph.setNodeAttribute(action.node, 'extras', action.extras);

            break;
        }
    }

    return draft;
};

const addLatentNode = (position: IPointData): AddLatentNodeAction => ({
    position,
    type: GraphActionType.ADD_LATENT_NODE,
});
const removeEdge = (edge: [string, string]): RemoveEdgeAction => ({ edge, type: GraphActionType.REMOVE_EDGE });
const removeNode = (node: string): RemoveNodeAction => ({ node, type: GraphActionType.REMOVE_NODE });
const addEdge = (edge: [string, string]): AddEdgeAction => ({
    source: edge[0],
    target: edge[1],
    type: GraphActionType.ADD_EDGE,
});
const updateEdge = (edge: [string, string], extras: Record<string, any>): UpdateEdgeAction => ({
    extras,
    source: edge[0],
    target: edge[1],
    type: GraphActionType.UPDATE_EDGE,
});
const updateEdgeType = (edge: [string, string], symbol: string): UpdateEdgeTypeAction => ({
    edge_type: symbol as EdgeType,
    source: edge[0],
    target: edge[1],
    type: GraphActionType.UPDATE_EDGE_TYPE,
});
const updateEdgeNote = (edge: [string, string], note: string): UpdateEdgeNoteAction => ({
    note,
    source: edge[0],
    target: edge[1],
    type: GraphActionType.UPDATE_EDGE_NOTE,
});
const reverseEdge = (edge: [string, string]): ReverseEdgeAction => ({
    edge,
    type: GraphActionType.REVERSE_EDGE,
});
const renameNode = (node: string, label: string): RenameNodeAction => ({
    label,
    node,
    type: GraphActionType.RENAME_NODE,
});

const acceptEdge = ([source, target]: [string, string]): AcceptEdgeAction => ({
    source,
    target,
    type: GraphActionType.ACCEPT_EDGE,
});
const updateNode = (node: string, extras: Record<string, any>): UpdateNodeAction => ({
    extras,
    node,
    type: GraphActionType.UPDATE_NODE,
});

export const GraphActionCreators = {
    acceptEdge,
    addEdge,
    addLatentNode,
    removeEdge,
    removeNode,
    renameNode,
    reverseEdge,
    updateEdge,
    updateEdgeNote,
    updateEdgeType,
    updateNode,
};
