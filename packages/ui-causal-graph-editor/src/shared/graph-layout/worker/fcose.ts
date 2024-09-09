import cytoscape, { ElementDefinition, NodeSingular } from 'cytoscape';
import fcose, { FcoseLayoutOptions, FcoseRelativePlacementConstraint } from 'cytoscape-fcose';
import type { LayoutMapping, XYPosition } from 'graphology-layout/utils';

import { type DirectionType, type GraphTiers, type SimulationGraph } from '../../../types';
import { getGroupToNodesMap, getNodeOrder, getTiersArray } from '../../utils';
import { LayoutComputationResult } from '../common';
import type { FcoseLayoutParams } from '../fcose-layout';

cytoscape.use(fcose);

interface TiersProperties {
    alignmentConstraint?: string[][];
    relativePlacementConstraint?: FcoseRelativePlacementConstraint[];
}

/**
 * Updates elements object for each node child to append a parent prop containing the group they belong to
 *
 * @param elements cytoscape elements, includes nodes and edges
 * @param relationships an object containing the group as a key and array of node ids as value
 */
function assignParents(elements: cytoscape.ElementDefinition[], relationships: Record<string, string[]>): void {
    // Create a lookup table for elements by their ID
    const elementLookup: Record<string, cytoscape.ElementDefinition> = {};

    // Populate the lookup table
    elements.forEach((element) => {
        elementLookup[element.data.id] = element;
    });

    // Iterate over each parent in the relationships object
    for (const [parent, children] of Object.entries(relationships)) {
        // Iterate over each child ID
        children.forEach((childId) => {
            // Find the node using the lookup table
            const node = elementLookup[childId];

            // If the node is found, set its 'parent' attribute
            if (node) {
                node.data.parent = parent;
            }
        });
    }
}

/**
 * Creates an array of relative placements for a given tier given a certain order of nodes and orientation
 * @param tier tier to be placed
 * @param orientation the orientation of the graph
 * @param tierSeparation tier separation
 * @param nodesOrder nodes order
 *  */
function createPositionedArray(
    tier: string[],
    orientation: 'horizontal' | 'vertical',
    tierSeparation: number,
    nodesOrder: Record<string, string>
): FcoseRelativePlacementConstraint[] {
    // Filter out any nodes that do not have an order defined in nodesOrder
    const validNodes = tier.filter((node) => node in nodesOrder);

    // sort tier based on nodesOrder
    const sortedArray = validNodes.sort((a, b) => {
        const orderA = nodesOrder[a];
        const orderB = nodesOrder[b];

        const parsedA = parseInt(orderA);
        const parsedB = parseInt(orderB);

        if (Number.isNaN(parsedA) || Number.isNaN(parsedB)) {
            throw new Error(`Non-numeric order value encountered for nodes`);
        }

        return parsedA - parsedB;
    });
    // if horizontal we place nodes to the left of each other, if vertical we place nodes to the top of each other
    if (orientation === 'horizontal') {
        return sortedArray.slice(0, -1).map((item, index) => ({
            bottom: sortedArray[index + 1],
            gap: tierSeparation,
            top: item,
        }));
    } // orientation === 'vertical'
    return sortedArray.slice(0, -1).map((item, index) => ({
        gap: tierSeparation,
        left: item,
        right: sortedArray[index + 1],
    }));
}

/**
 * Gets relative placements for tiered fcose layout when tiers are given as string[][]. Defines so that given nodes within a tier are placed
 * right/left or top/bottom of each other. Following the defined hierarchy of tiers.
 * @param tiers node tiers defined by the user
 * @param orientation the orientation of the graph
 * @param tierSeparation tier separation
 * @param nodesOrder the order the nodes should appear in the tier
 *  */
function getRelativeTieredArrayPlacement(
    tiers: string[][],
    orientation: DirectionType,
    tierSeparation: number,
    nodesOrder?: Record<string, string>
): FcoseRelativePlacementConstraint[] {
    const relativePlacements: FcoseRelativePlacementConstraint[] = [];

    tiers.forEach((tier, tierIndex) => {
        // if within the tier a node order should be followed we add those placements
        if (nodesOrder) {
            const positionedArray = createPositionedArray(tier, orientation, tierSeparation, nodesOrder);
            relativePlacements.push(...positionedArray);
        }
        // Next we take care of the hierarchical placement of the tiers
        // if last tier do not add relative placement
        if (tierIndex === tiers.length - 1) {
            return;
        }
        // get one element for each subsequent tiers
        const firstElement = tier[0];
        const nextTierFirstElement = tiers[tierIndex + 1][0];
        // Place onde node from the first tier to the left/top of the first node of the next tier
        // That way we have one node from each tier defining the position of the tier relative to the other tiers
        const placement =
            orientation === 'horizontal' ?
                { gap: tierSeparation, left: firstElement, right: nextTierFirstElement }
            :   { bottom: nextTierFirstElement, gap: tierSeparation, top: firstElement };
        relativePlacements.push(placement);
    });

    return relativePlacements;
}

/**
 * Get properties values for tiered fcose layout
 * @param tiers node tiers defined by the user
 * @param orientation the orientation of the graph
 * @param tierSeparation tier separation
 *  */
export function getTieredLayoutProperties(
    graph: SimulationGraph,
    tiers: GraphTiers,
    orientation: DirectionType,
    tierSeparation: number
): TiersProperties {
    let tiersArray = getTiersArray(tiers, graph);
    let nodesOrder: Record<string, string>;
    const nodes = graph.nodes();

    if (!Array.isArray(tiers)) {
        // must be of type TiersConfig
        const { order_nodes_by } = tiers;
        nodesOrder = order_nodes_by ? getNodeOrder(nodes, order_nodes_by, graph) : undefined;
    } else {
        // if in the array of tiers passed a node present does not exist in the graph we remove it
        tiersArray = tiersArray
            .map((tier) => tier.filter((node) => nodes.includes(node)))
            .filter((filteredTier) => filteredTier.length > 0);
    }

    return {
        alignmentConstraint: tiersArray,
        relativePlacementConstraint: getRelativeTieredArrayPlacement(
            tiersArray,
            orientation,
            tierSeparation,
            nodesOrder
        ),
    };
}

export default function compute(
    layoutParams: FcoseLayoutParams,
    graph: SimulationGraph
): Promise<LayoutComputationResult> {
    return new Promise((resolve) => {
        if (graph.nodes().length === 0) {
            resolve({ layout: {} });
        }

        const hasPositions = graph.getNodeAttribute(graph.nodes()[0], 'x');
        const size = graph.getAttribute('size');
        const tiersPlacement =
            layoutParams.tiers ?
                getTieredLayoutProperties(
                    graph,
                    layoutParams.tiers,
                    layoutParams.orientation,
                    layoutParams.tierSeparation
                )
            :   { alignmentConstraint: undefined, relativePlacementConstraint: undefined };

        const elements = [
            ...graph.mapNodes<ElementDefinition>((id, attrs) => ({
                data: { ...attrs, height: size, width: size },
                group: 'nodes',
                position: { x: attrs.x, y: attrs.y },
            })),
            ...graph.mapEdges<ElementDefinition>((id, attrs, source, target) => ({
                data: { ...attrs, source, target },
                group: 'edges',
            })),
        ];

        // for grouping we are going to assign and utilise compound nodes
        if (layoutParams.group) {
            const groupedNodes = getGroupToNodesMap(graph.nodes(), layoutParams.group, graph);

            // create a node element for each group
            Object.keys(groupedNodes).forEach((groupLabel) => {
                elements.push({
                    data: { id: groupLabel, height: size, width: size },
                    group: 'nodes',
                });
            });

            // assign parents to nodes based on the group they belong to
            assignParents(elements, groupedNodes);
        }

        cytoscape({
            elements,
            headless: true,
            layout: {
                alignmentConstraint: {
                    horizontal:
                        layoutParams.orientation === 'vertical' ? tiersPlacement.alignmentConstraint : undefined,
                    vertical:
                        layoutParams.orientation === 'horizontal' ? tiersPlacement.alignmentConstraint : undefined,
                },
                animate: false,
                edgeElasticity: layoutParams.edgeElasticity,
                gravity: layoutParams.gravity,
                gravityRange: layoutParams.gravityRange,
                idealEdgeLength: size * layoutParams.edgeLength,
                initialEnergyOnIncremental: layoutParams.energy,
                name: 'fcose',

                nodeRepulsion: layoutParams.nodeRepulsion,

                nodeSeparation: layoutParams.nodeSeparation,

                numIters: layoutParams.iterations,
                quality: layoutParams.highQuality ? 'proof' : 'default',

                // only randomize if there are no position in graph yet
                randomize: !hasPositions,

                relativePlacementConstraint: tiersPlacement.relativePlacementConstraint,

                stop: (ev) => {
                    const positions: LayoutMapping<XYPosition> = Object.fromEntries(
                        ev.cy.elements('node').map((node: NodeSingular) => {
                            return [node.id(), node.position()];
                        })
                    );
                    resolve({ layout: positions });
                },
                uniformNodeDimensions: true,
            } as FcoseLayoutOptions,
            // use internal cytoscape styling to make the layout account for node sizes
            style: [
                {
                    selector: 'node',
                    style: {
                        height: size * 2,
                        shape: 'ellipse',
                        width: size * 2,
                    },
                },
            ],
            styleEnabled: true,
        });
    });
}
