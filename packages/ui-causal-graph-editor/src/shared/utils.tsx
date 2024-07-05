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
import { hasCycle } from 'graphology-dag';

import { DefaultTheme } from '@darajs/styled-components';

import { EdgeType, GraphTiers, NodeCategory, SimulationGraph } from '../types';

export const DEFAULT_NODE_SIZE = 64;
export const TARGET_NODE_MULTIPLIER = 1.25;

/**
 * Check if adding an edge to the graph will create a cycle.
 *
 * @param graph current graph state instance
 * @param edge edge to add
 */
export function willCreateCycle(graphOriginal: SimulationGraph, edge: [string, string]): boolean {
    const graph = graphOriginal.copy();
    // Drop the edge in both directions if they exist
    try {
        graph.dropEdge(edge);
        // eslint-disable-next-line no-empty
    } catch {}

    try {
        graph.dropEdge([edge[1], edge[0]]);
        // eslint-disable-next-line no-empty
    } catch {}

    // Add the edge in the direction we want to check
    graph.addEdge(edge[0], edge[1], { edge_type: EdgeType.DIRECTED_EDGE, originalMeta: {} });

    // adding edge from node to itself will always create a self loop
    if (edge[0] === edge[1]) {
        return true;
    }

    // check that the destination node will not depend on itself after adding it
    const checkedNodes = new Set<string>();
    const nodesToCheck = [edge[1]];
    let currentNode: string | undefined;

    // keep traversing the graph until we have checked all nodes that are reachable from the destination node
    while (nodesToCheck.length > 0) {
        currentNode = nodesToCheck.pop();

        // Only check this condition after first iteration; if we reach the destination node again, we have a cycle
        if (currentNode === edge[1] && checkedNodes.size > 0) {
            return true;
        }

        checkedNodes.add(currentNode);

        // eslint-disable-next-line no-loop-func
        graph.forEachEdge(currentNode, (_, edgeAttrs, source, target) => {
            // only if it's an inbound directed edge, check the source node
            if (target === currentNode && edgeAttrs.edge_type === EdgeType.DIRECTED_EDGE) {
                nodesToCheck.push(source);
                // check for backwards edges
            } else if (source === currentNode && edgeAttrs.edge_type === EdgeType.BACKWARDS_DIRECTED_EDGE) {
                nodesToCheck.push(target);
            }
        });
    }

    return false;
}

/**
 * Format a given name, i.e. a snake_case label to 'Sentence case'
 *
 * @param name name to format
 */
export function formatName(name: string): string {
    return name
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
}

export function coerceToArray<T>(value: T | T[]): T[] {
    if (!value) {
        return [];
    }

    return Array.isArray(value) ? value : [value];
}

/**
 * A function that generates a tooltip to be displayed for nodes and edges
 *
 * @param id - the id of the Node or Edge to display on top
 * @param data - the key values pairs of data to be displayed
 * @param label - a label to show instead of the id and preserve the id for the key
 * @param tooltipSize - font size to use for the tooltip
 */
export function getTooltipContent(
    id: string,
    data: { [k: string]: any } | string,
    theme: DefaultTheme,
    label?: string,
    tooltipSize?: number
): JSX.Element {
    return (
        <div>
            <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'center' }}>
                <h2 style={{ fontSize: tooltipSize ? `${tooltipSize}px` : theme.font.size }}>{label ?? id}</h2>
            </div>
            {data && typeof data === 'object' && (
                <ul style={{ margin: 0, padding: 0, paddingLeft: '1rem', paddingTop: '1rem' }}>
                    {Object.keys(data).map((key) => (
                        <li key={`${id}-${String(data[key])}`}>
                            <p style={{ fontSize: tooltipSize ? `${tooltipSize}px` : theme.font.size }}>
                                <strong>{key}: </strong>
                                {data[key]}
                            </p>
                        </li>
                    ))}
                </ul>
            )}
            {data && typeof data === 'string' && (
                <span style={{ margin: 0, padding: 0, paddingTop: '1rem' }}>{data}</span>
            )}
        </div>
    );
}

/**
 * Get node category
 *
 * @param graph current graph state instance
 * @param id node id
 * @param isLatent whether the node is latent
 */
export function getNodeCategory(graph: SimulationGraph, id: string, isLatent?: boolean): NodeCategory {
    let category: NodeCategory = 'other';
    if (isLatent) {
        category = 'latent';
    } else if (graph.hasNode(id) && graph.inDegree(id) > 0 && graph.outDegree(id) === 0) {
        category = 'target';
    }

    return category;
}

/**
 * Defines if a Graph is a DAG (directed acyclic graph). Two criteria must be met for this, the first it must not have cyclews and the second is that all edges must be directed.
 *
 * @param graph current graph state instance
 */
export function isDag(graph: SimulationGraph): boolean {
    // check that there are no cycles
    if (hasCycle(graph)) {
        return false;
    }
    // check that all edges are directed
    const isDirected = graph.everyEdge((edge, attributes) => {
        if (attributes.edge_type !== EdgeType.DIRECTED_EDGE) {
            return false;
        }
        return true;
    });
    return isDirected;
}

/**
 * Based on a node attribute checks if the path is in the attribute or in extras, if not found returns undefined
 * @param attributes node object or a sub attribute of the node object
 * @param path path to the attribute
 *  */
export function getPathInNodeAttribute(attributes: Record<string, any>, path: string): any {
    let searchablePath = path;
    // If there are no attributes return early, could be either a typo from the user within a node or a new node that has been added
    if (attributes === undefined) {
        return undefined;
    }
    // If path is in meta change it to originalMeta
    if (searchablePath === 'meta') {
        searchablePath = 'originalMeta';
    }
    // Check if path is in node attributes
    if (Object.prototype.hasOwnProperty.call(attributes, searchablePath)) {
        return attributes[searchablePath];
    }
    // If not check if it has been moved to extras
    if (attributes?.extras && searchablePath in attributes.extras) {
        return attributes.extras[searchablePath];
    }
    // If not found the node does not have that attribute
    return undefined;
}

/**
 * Gets nodes grouped by a given attribute
 * @param nodes nodes to be grouped
 * @param group the attribute to group by
 * @param graph the graph
 * @returns a record of group name to an array of nodes
 *  */
export function getGroupToNodesMap(nodes: string[], group: string, graph: SimulationGraph): Record<string, string[]> {
    const attributePathArray = group.split('.');

    return nodes.reduce((groupAccumulator: Record<string, string[]>, node) => {
        const nodeAttributes = graph.getNodeAttributes(node);
        // The node attribute containing the group can be deep within the node, e.g. meta.rendering_properties.group
        // or anywhere else defined by the user. Here we tranverse the path checking what the group value is.
        const nodeGroup = attributePathArray.reduce(getPathInNodeAttribute, nodeAttributes);

        // If it is not undefined at this point i.e. node group was found
        if (nodeGroup !== undefined) {
            const groupKey = String(nodeGroup);
            // if group is not in tieredNodes add it, if it is add node to that tier
            if (groupKey in groupAccumulator) {
                groupAccumulator[groupKey].push(node);
            } else {
                groupAccumulator[groupKey] = [node];
            }
        }
        return groupAccumulator;
    }, {});
}

/**
 * Gets the group for each node based on a given attribute
 * @param nodes nodes to be checked
 * @param group the attribute to check
 * @param graph the graph
 * @returns a map of node to group
 */
export function getNodeToGroupMap(nodes: string[], group: string, graph: SimulationGraph): Record<string, string> {
    const attributePathArray = group.split('.');

    return nodes.reduce((nodeToGroupMap: Record<string, string>, node) => {
        const nodeAttributes = graph.getNodeAttributes(node);
        // Traverse the attribute path to get the group value
        const nodeGroup = attributePathArray.reduce(getPathInNodeAttribute, nodeAttributes);

        // If the node group is found, map the node to its group
        if (nodeGroup !== undefined) {
            const groupKey = String(nodeGroup);
            nodeToGroupMap[node] = groupKey;
        }
        return nodeToGroupMap;
    }, {});
}

/**
 * Gets nodes grouped by a given attribute
 * @param nodes nodes to be grouped
 * @param group the attribute to group by
 * @param graph the graph
 *  */
export function getNodeOrder(nodes: string[], orderPath: string, graph: SimulationGraph): Record<string, string> {
    const attributePathArray = orderPath.split('.');

    return nodes.reduce((groupAccumulator: Record<string, string>, node) => {
        const nodeAttributes = graph.getNodeAttributes(node);
        // The node attribute containing the group can be deep within the node, e.g. meta.rendering_properties.group
        // or anywhere else defined by the user. Here we tranverse the path checking what the group value is.
        const nodeOrder = attributePathArray.reduce(getPathInNodeAttribute, nodeAttributes);

        // If it is not undefined at this point i.e. node order was found
        if (nodeOrder !== undefined) {
            const order = String(nodeOrder);
            groupAccumulator[node] = order;
        }
        return groupAccumulator;
    }, {});
}

/**
 * Gets an array of array of nodes where if rank is defined in the coorect hierarchical order
 * @param tiers the GraphTiers information passed to the layout
 * @param graph the graph
 *  */
export function getTiersArray(tiers: GraphTiers, graph: SimulationGraph): string[][] {
    let tiersArray: string[][] = Array.isArray(tiers) ? tiers : [];

    if (!Array.isArray(tiers)) {
        // must be of type TiersConfig
        const { group, rank } = tiers;
        const nodes = graph.nodes();
        const tieredNodes = getGroupToNodesMap(nodes, group, graph);

        // if rank is defined use it to order the tiers
        if (rank) {
            const missingGroups: string[] = [];
            tiersArray = rank.map((key) => {
                if (!(key in tieredNodes)) {
                    missingGroups.push(key);
                    return [];
                }
                return tieredNodes[key];
            });

            if (missingGroups.length > 0) {
                throw new Error(`Group(s) ${missingGroups.join(', ')} defined in rank not found within any Nodes`);
            }
        } else {
            tiersArray = Object.values(tieredNodes);
        }
    }
    return tiersArray;
}
