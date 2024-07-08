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
import { MutGraph, graphStratify } from 'd3-dag';
import { DirectedGraph } from 'graphology';
import { LayoutMapping, XYPosition } from 'graphology-layout/utils';
import isEqual from 'lodash/isEqual';
import { generate } from 'shortid';

import {
    CausalGraph,
    CausalGraphEdge,
    CausalGraphNode,
    D3SimulationEdge,
    FlatEdgeRenderingMeta,
    FlatNodeRenderingMeta,
    GraphTiers,
    SimulationAttributes,
    SimulationEdge,
    SimulationGraph,
    SimulationNode,
    SimulationNodeWithCategory,
} from '../types';
import { getNodeCategory, getNodeOrder, getTiersArray } from './utils';

interface NodeOrder {
    group: string;
    order: string;
    rank: number;
}

export type DagNodeData = SimulationNode &
    Partial<NodeOrder> & {
        parentIds: string[];
    };

/**
 * This parses the graph structure into a Dag structure that the d3-dag library can understand
 *
 * @param graph The SimulationGraph
 * @param tiers Any tiers passed to the layout
 */
export function dagGraphParser(graph: SimulationGraph, tiers?: GraphTiers): MutGraph<DagNodeData, any> {
    const nodeTiersMap = new Map<string, NodeOrder>();
    let nodesOrder: Record<string, string> = {};

    // If there are tiers we need to add group and ord properties to the node for PlanarLayout algo to consider them
    if (tiers) {
        const nodeTiersArray = getTiersArray(tiers, graph);
        if (!Array.isArray(tiers)) {
            const { order_nodes_by } = tiers;
            nodesOrder = order_nodes_by ? getNodeOrder(graph.nodes(), order_nodes_by, graph) : {};
        }

        nodeTiersArray.forEach((innerArray, index) => {
            innerArray.forEach((node) => {
                nodeTiersMap.set(node, { group: String(index), order: nodesOrder[node], rank: index });
            });
        });
    }

    const nodes: DagNodeData[] = graph.mapNodes((id: string, attributes: SimulationNode) => {
        const parentIds = graph.inboundNeighbors(id);
        let nodeType = 'latent';
        let nodeOrder;
        let nodeRank;

        if (tiers) {
            const nodeData = nodeTiersMap.get(id);
            // in the case of e.g. a new node group etc may be undefined
            nodeType = nodeData?.group;
            nodeOrder = nodeData?.order;
            nodeRank = nodeData?.rank;
        }

        return {
            ...attributes,
            group: nodeType,
            ord: nodeOrder,
            parentIds,
            rank: nodeRank,
        };
    });

    const stratify = graphStratify();

    return stratify<DagNodeData>(nodes);
}

/**
 * Get graph edges in d3 expected format
 *
 * @param graph graph to get edges from
 */
export function getD3Data(graph: SimulationGraph): [edges: D3SimulationEdge[], nodes: SimulationNodeWithCategory[]] {
    const nodes = graph.reduceNodes(
        (acc, id, attrs) => ({
            ...acc,
            [id]: {
                ...attrs,
                category: getNodeCategory(graph, id, attrs['meta.rendering_properties.latent']),
            },
        }),
        {} as Record<string, SimulationNodeWithCategory>
    );

    const edges = graph.mapEdges((edgeKey, attrs, source, target) => {
        return {
            ...attrs,
            source: nodes[source],
            target: nodes[target],
        };
    });

    return [edges, Object.values(nodes)];
}

/**
 * Format node data in a layoutmapping format
 *
 * @param nodes
 */
export function nodesToLayout(nodes: SimulationNode[]): LayoutMapping<XYPosition> {
    return nodes.reduce((acc, node) => {
        acc[node.id] = {
            x: node.x,
            y: node.y,
        };

        return acc;
    }, {} as LayoutMapping<XYPosition>);
}

/**
 * Gets any extra fields passed to a Node in a CausalGraph
 * @param nodeData
 *  */
function getExtraNodeFields(nodeData: CausalGraphNode): Record<string, any> {
    // Destructure the fields to exclude, and collect all other fields into a rest object
    const { meta, variable_type, ...extras } = nodeData;

    return extras;
}

/**
 * Parse a causal graph node into a simulation node
 *
 * @param nodeKey node id
 * @param nodeData  node data
 * @param data whole graph data
 * @param availableInputs optional list of input nodes
 */
export function parseGraphNode(
    nodeKey: string,
    nodeData: CausalGraphNode,
    data: CausalGraph,
    availableInputs?: string[]
): SimulationNode {
    // Everything that's not an available input or an output is latent
    // If available inputs is not provided, nothing is latent
    const isLatent =
        availableInputs && Array.isArray(availableInputs) ?
            !availableInputs.includes(nodeKey) && Object.keys(data.edges).includes(nodeKey)
        :   false;

    const originalEntries = Object.entries(nodeData.meta?.rendering_properties ?? {}) as Entries<FlatNodeRenderingMeta>;

    // flatten meta properties as graphology doesn't play nice with nested attributes
    const meta: FlatNodeRenderingMeta = Object.fromEntries(
        originalEntries.map((entry) => {
            const computedKey = `meta.rendering_properties.${entry[0]}`;

            return [computedKey, entry[1]];
        })
    );
    meta['meta.rendering_properties.latent'] ??= isLatent;

    // any extra fields that are not part of the meta object
    const extras = getExtraNodeFields(nodeData);

    const attributes: SimulationNode = {
        extras,
        id: nodeKey,
        originalMeta: nodeData.meta,

        variable_type: nodeData.variable_type,
        // Copy over meta.x/y to use as initial positions
        x: meta['meta.rendering_properties.x'],
        y: meta['meta.rendering_properties.y'],
        ...meta,
    };

    return attributes;
}

/**
 * Gets any extra fields passed to a Node in a CausalGraph
 * @param edgeData
 *  */
function getExtraEdgeFields(edgeData: CausalGraphEdge): Record<string, any> {
    // Destructure the fields to exclude, and collect all other fields into a rest object
    const { meta, edge_type, ...extras } = edgeData;

    return extras;
}

/**
 * Parse a causal graph edge into simulation edge
 *
 * @param edgeData edge data
 */
export function parseGraphEdge(edgeData: CausalGraphEdge): SimulationEdge {
    const originalEntries = Object.entries(edgeData.meta?.rendering_properties ?? {}) as Entries<FlatEdgeRenderingMeta>;

    // flatten meta properties as graphology doesn't play nice with nested attributes
    const meta: FlatEdgeRenderingMeta = Object.fromEntries(
        originalEntries.map((entry) => {
            const computedKey = `meta.rendering_properties.${entry[0]}`;

            return [computedKey, entry[1]];
        })
    );

    const attributes: SimulationEdge = {
        edge_type: edgeData.edge_type,
        extras: getExtraEdgeFields(edgeData),
        originalMeta: edgeData.meta,
        ...meta,
    };

    return attributes;
}

type Entries<T> = {
    [K in keyof T]: [K, T[K]];
}[keyof T][];

/**
 * Gets any extra fields passed to a CausalGraph
 * @param graphData
 *  */
function getExtraGraphFields(graphData: CausalGraph): Record<string, any> {
    // Destructure the fields to exclude, and collect all other fields into a rest object
    const { edges, nodes, version, ...extras } = graphData;

    return extras;
}

/**
 * Function which receives a list of nodes and adds property for those that share a variable_name
 *
 * @param graph Simulation graph
 */
export function updateNodesForTimeSeries(graph: SimulationGraph): void {
    // Step 1: Group nodes by variable_name
    const groupedNodes = new Map<string, string[]>();
    graph.nodes().forEach((nodeId) => {
        const variableName = graph.getNodeAttribute(nodeId, 'extras')?.variable_name;
        if (variableName) {
            // Check if variableName is not undefined
            if (!groupedNodes.has(variableName)) {
                groupedNodes.set(variableName, []);
            }
            groupedNodes.get(variableName)?.push(nodeId);
        }
    });

    // Step 2: Add 'time_series_variable' to nodes that share the same variable_name
    groupedNodes.forEach((group, variableName) => {
        if (group.length > 1) {
            group.forEach((nodeId) => {
                const attributes = graph.getNodeAttributes(nodeId);
                attributes.extras.time_series_variable = variableName;
                graph.updateNode(nodeId, () => attributes);
            });
        }
    });
}

/**
 * Parses CausalGraph structure into a SimulationGraph representation
 *
 * @param data input CausalGraph structure
 * @param availableInputs names of input nodes
 */
export function causalGraphParser(
    data: CausalGraph,
    availableInputs?: string[],
    initialGraph?: SimulationGraph
): SimulationGraph {
    // use graph provided or a new one
    const resultGraph = initialGraph ?? new DirectedGraph<SimulationNode, SimulationEdge, SimulationAttributes>();

    // get array of nodes
    const newNodes = Object.keys(data.nodes);

    // Remove nodes which no longer exist
    resultGraph.forEachNode((node) => {
        if (!newNodes.includes(node)) {
            resultGraph.dropNode(node);
        }
    });

    newNodes.forEach((nodeKey) => {
        const nodeData = data.nodes[nodeKey];

        const attributes = parseGraphNode(nodeKey, nodeData, data, availableInputs);

        try {
            const existingAttributes = resultGraph.getNodeAttributes(nodeKey);
            const { x, y, extras, ...existingAttributesWithoutPosition } = existingAttributes;

            // Check if attributes changed (not x,y,extras)
            if (!isEqual(existingAttributesWithoutPosition, attributes)) {
                // keep previous positions and extras
                resultGraph.updateNode(nodeKey, () => ({ ...attributes, extras, x, y }));
            }
        } catch {
            // Error - no node exists, add it first
            resultGraph.addNode(nodeKey, attributes);
        }
    });

    // If the graph is a time series graph, we add a property to the nodes that share the same variable_name so that they can be later grouped into layers if needed
    if (Object.values(data.nodes)[0]?.node_class === 'TimeSeriesNode') {
        updateNodesForTimeSeries(resultGraph);
    }

    // Remove edges which no longer exist
    resultGraph.forEachEdge((edgeKey, edgeData, source, target) => {
        if (!data.edges?.[source]?.[target]) {
            resultGraph.dropEdge(source, target);
        }
    });

    Object.entries(data.edges).forEach(([sourceKey, sourceEdges]) => {
        Object.entries(sourceEdges).forEach(([targetKey, edgeData]) => {
            const attributes = parseGraphEdge(edgeData);

            try {
                const existingAttributes = resultGraph.getEdgeAttributes(sourceKey, targetKey);
                const { points, ...existingAttributesWithoutPoints } = existingAttributes;

                // Check if attributes changed
                if (!isEqual(existingAttributesWithoutPoints, attributes)) {
                    resultGraph.updateEdge(sourceKey, targetKey, () => ({ ...attributes, points }));
                }
            } catch {
                // Error - no edge exists, add it first
                resultGraph.addEdge(sourceKey, targetKey, attributes);
            }
        });
    });

    resultGraph.updateAttribute('version', () => data.version);
    resultGraph.updateAttribute('uid', () => generate());

    // TODO: check if this can be simplified
    try {
        const existingGraphAttributes = resultGraph.getAttributes();
        const { extras } = existingGraphAttributes;
        if (Object.keys(extras).length === 0) {
            resultGraph.updateAttribute('extras', () => getExtraGraphFields(data));
        }
    } catch {
        resultGraph.updateAttribute('extras', () => getExtraGraphFields(data));
    }

    return resultGraph;
}
