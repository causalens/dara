import * as d3 from 'd3';
import type { Simulation, SimulationLinkDatum } from 'd3';
import { DirectedGraph } from 'graphology';
import type { LayoutMapping, XYPosition } from 'graphology-layout/utils';
import debounce from 'lodash/debounce';

import type {
    D3SimulationEdge,
    DirectionType,
    GraphTiers,
    SerializedSimulationGraph,
    SimulationAttributes,
    SimulationEdge,
    SimulationGraph,
    SimulationNode,
    SimulationNodeWithCategory,
} from '../../../types';
import { EdgeType } from '../../../types';
import { getD3Data, nodesToLayout } from '../../parsers';
import { getGroupToNodesMap, getNodeOrder, getTiersArray } from '../../utils';
import type { LayoutComputationResult } from '../common';
import type { SpringLayoutParams } from '../spring-layout';

/**
 * Apply force that orders nodes based on the tier order_nodes_by values
 *
 * @param simulation the D3 simulation
 * @param tiers the tiers passed to the layout
 * @param graph the simulation graph
 * @param orientation the orientation of the layout
 * @param nodesMap a map of node name to node object
 */
function applyOrderNodesForce(
    simulation: d3.Simulation<SimulationNode, D3SimulationEdge>,
    tiers: GraphTiers,
    graph: SimulationGraph,
    orientation: DirectionType,
    nodesMap: Map<string, SimulationNodeWithCategory>
): void {
    if (!Array.isArray(tiers)) {
        const { order_nodes_by } = tiers;
        if (order_nodes_by) {
            const simNodes = graph.nodes();
            const nodesOrder = getNodeOrder(simNodes, order_nodes_by, graph);
            const sortedNodesOrderArray = Object.entries(nodesOrder)
                .sort((a, b) => Number(a[1]) - Number(b[1]))
                .map((entry) => entry[0]);
            const nodeSeparation = 200;

            function forceOrder(): d3.Force<SimulationNodeWithCategory, undefined> {
                function force(alpha: number): void {
                    sortedNodesOrderArray.forEach((nodeName, index) => {
                        const targetPosition = index * nodeSeparation;
                        const targetedNode = nodesMap.get(nodeName);

                        if (targetedNode) {
                            if (orientation === 'horizontal') {
                                // Apply a nudge towards the target y position
                                targetedNode.vy += (targetPosition - targetedNode.y) * alpha;
                            } else {
                                // Apply a nudge towards the target x position
                                targetedNode.vx += (targetPosition - targetedNode.x) * alpha;
                            }
                        }
                    });
                }
                return force;
            }

            // apply layer force
            simulation.force('order', forceOrder());
        }
    }
}

/**
 * Apply forces which are needed as part of a tiered layout.
 * There is one force which snaps the nodes to the relevant layers and another force ordering the nodes within the layers.
 *
 * @param simulation the D3 simulation
 * @param graph the simulation graph
 * @param nodes array of the nodes
 * @param tiers the tiers passed to the layout
 * @param tiersSeparation the separation between the tiers
 * @param orientation the orientation of the layout
 */
export function applyTierForces(
    simulation: d3.Simulation<SimulationNode, D3SimulationEdge>,
    graph: SimulationGraph,
    nodes: SimulationNodeWithCategory[],
    tiers: GraphTiers,
    tiersSeparation: number,
    orientation: DirectionType
): void {
    const tiersArray = getTiersArray(tiers, graph);

    const nodesMapping = new Map<string, SimulationNodeWithCategory>();
    nodes.forEach((node) => nodesMapping.set(node.id, node));

    applyOrderNodesForce(simulation, tiers, graph, orientation, nodesMapping);

    function forceLayer(): d3.Force<SimulationNodeWithCategory, undefined> {
        function force(alpha: number): void {
            tiersArray.forEach((tier, index) => {
                const targetPosition = index * tiersSeparation;
                tier.forEach((nodeName) => {
                    const targetedNode = nodesMapping.get(nodeName);
                    if (targetedNode) {
                        if (orientation === 'horizontal') {
                            // Directly set the x position
                            targetedNode.x = targetPosition + (targetedNode.x - targetPosition) * alpha;
                        } else {
                            // Directly set the y position
                            targetedNode.y = targetPosition + (targetedNode.y - targetPosition) * alpha;
                        }
                    }
                });
            });
        }
        return force;
    }
    // apply layer force
    simulation.force('layer', forceLayer());
}

/**
 * Create edges between nodes in the same group
 *
 * @param nodeList list of node names
 */
function createGroupEdges(nodeList: SimulationNodeWithCategory[]): D3SimulationEdge[] {
    const edges: D3SimulationEdge[] = [];
    if (nodeList.length > 1) {
        for (let i = 0; i < nodeList.length; i++) {
            for (let j = i + 1; j < nodeList.length; j++) {
                edges.push({
                    source: nodeList[i],
                    target: nodeList[j],
                    originalMeta: {},
                    edge_type: EdgeType.UNDIRECTED_EDGE,
                });
            }
        }
    }
    return edges;
}

function createEdgesWithinAllGroups(
    group: string,
    graph: SimulationGraph,
    nodes: SimulationNodeWithCategory[]
): D3SimulationEdge[] {
    const groupsToNodes = getGroupToNodesMap(graph.nodes(), group, graph);
    const edges: D3SimulationEdge[] = [];

    Object.keys(groupsToNodes).forEach((groupName) => {
        const nodeStringsList = groupsToNodes[groupName];
        const nodeList = nodeStringsList.map((nodeString) => nodes.find((node) => node.id === nodeString));
        const groupEdges = createGroupEdges(nodeList);
        edges.push(...groupEdges);
    });

    return edges;
}

/**
 * Latest computed simulation for the current graph.
 */
let simulation: Simulation<SimulationNode, D3SimulationEdge>;

export default function compute(
    layoutParams: SpringLayoutParams,
    graph: SimulationGraph,
    forceUpdate: (layout: LayoutMapping<XYPosition>) => void
): LayoutComputationResult {
    // We're modifying edges/nodes
    let [edges, nodes] = getD3Data(graph);

    const { group, groupRepelStrength } = layoutParams;

    // it there was a previous simulation, stop it
    if (simulation) {
        simulation.stop();
    }

    if (group) {
        const groupsToNodes = getGroupToNodesMap(graph.nodes(), group, graph);
        const groupKeys = Object.keys(groupsToNodes);
        const firstNodes: Record<string, SimulationNode> = {};
        // Pre-compute the first node of each group, we get the first node just as an approximation for the position of that group
        groupKeys.forEach((groupKey) => {
            const nodeId = groupsToNodes[groupKey][0];
            firstNodes[groupKey] = nodes.find((node) => node.id === nodeId)!;
        });

        function clusterRepelForce(alpha: number): void {
            for (let i = 0; i < groupKeys.length; i++) {
                const groupA = groupKeys[i];
                const nodeA = firstNodes[groupA];
                const groupASize = groupsToNodes[groupA].length;

                for (let j = i + 1; j < groupKeys.length; j++) {
                    const groupB = groupKeys[j];
                    const nodeB = firstNodes[groupB];
                    const groupBSize = groupsToNodes[groupB].length;

                    // Distance calculation
                    const dx = nodeA.x - nodeB.x;
                    const dy = nodeA.y - nodeB.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance > 3000) {
                        continue; // Skip force calculation for distant groups
                    }

                    // Strength calculation
                    const cappedDistance = Math.max(distance, 1);
                    const strengthFactor = groupASize * groupBSize;
                    const strength = (groupRepelStrength * strengthFactor * alpha) / (cappedDistance * cappedDistance);

                    if (strength < 0.01) {
                        continue; // Skip weak forces
                    }

                    nodeA.vx += nodeA.x * strength;
                    nodeA.vy += nodeA.y * strength;
                    nodeB.vx -= nodeB.x * strength;
                    nodeB.vy -= nodeB.y * strength;
                }
            }
        }

        // We create fake edges between nodes in the same group so that they stay together
        const groupEdges = createEdgesWithinAllGroups(layoutParams.group, graph, nodes);

        simulation = d3
            .forceSimulation(nodes)
            // Apply the force that repels groups from each other
            .force('clusterRepel', clusterRepelForce)
            // Apply the force that keeps nodes within a group together
            .force(
                'groupLinks',
                d3
                    .forceLink<SimulationNode, D3SimulationEdge>(groupEdges)
                    .id((d) => d.id)
                    .distance(() => layoutParams.nodeSize * layoutParams.linkForce)
            )
            // The collide force makes sure that the nodes never overlap with each other
            .force('collide', d3.forceCollide(layoutParams.nodeSize * layoutParams.collisionForce))
            // The center force keeps nodes in the middle of the viewport
            .force('center', d3.forceCenter())
            .stop(); // don't start just yet
    } else {
        simulation = d3
            .forceSimulation(nodes)
            // The link force pulls linked nodes together so they try to be a given distance apart
            .force(
                'links',
                d3
                    .forceLink<SimulationNode, SimulationLinkDatum<SimulationNode>>(edges)
                    .id((d) => d.id)
                    .distance(() => layoutParams.nodeSize * layoutParams.linkForce)
            )
            // The charge force acts to push the nodes away from each other so they have space
            .force('charge', d3.forceManyBody().strength(layoutParams.gravity))
            // The collide force makes sure that the nodes never overlap with each other
            .force('collide', d3.forceCollide(layoutParams.nodeSize * layoutParams.collisionForce))
            // The center force keeps nodes in the middle of the viewport
            .force('center', d3.forceCenter())
            .stop(); // don't start just yet
    }

    if (layoutParams.tiers) {
        applyTierForces(
            simulation,
            graph,
            nodes,
            layoutParams.tiers,
            layoutParams.tierSeparation,
            layoutParams.orientation
        );
    }

    // Warm-up the simulation so the jump to the center isn't visible
    simulation.tick(layoutParams.warmupTicks);

    simulation
        .on('tick', () => {
            // On each tick, update simulation nodes
            const newNodes = nodesToLayout(simulation.nodes());

            // Force an update
            forceUpdate(newNodes);
        })
        .restart();

    const onAddNode = debounce((graphData: SerializedSimulationGraph) => {
        // reparse the updated graph
        const newGraph = new DirectedGraph<SimulationNode, SimulationEdge, SimulationAttributes>();
        newGraph.import(graphData);
        [edges, nodes] = getD3Data(newGraph);

        // replace nodes, re-add link force
        simulation
            .nodes(nodes)
            .force(
                'links',
                d3
                    .forceLink<SimulationNode, SimulationLinkDatum<SimulationNode>>(edges)
                    .id((d) => d.id)
                    .distance(() => layoutParams.nodeSize * layoutParams.linkForce)
            )
            .alpha(0.8)
            .alphaTarget(0)
            .restart();
    }, 100);

    return {
        layout: nodesToLayout(simulation.nodes()),
        onAddNode,
        onCleanup: () => {
            simulation.stop();
        },
        onEndDrag: () => {
            // let simulation run for a little bit after dragging finished
            simulation.alpha(0.1).alphaTarget(0);
        },
        onMove: (nodeId: string, x: number, y: number) => {
            const nodeIdx = nodes.findIndex((n) => n.id === nodeId);
            nodes[nodeIdx].x = x;
            nodes[nodeIdx].y = y;
        },
        onStartDrag: () => {
            // target is higher than alpha so that the simulation will continue to run
            // as long as we're dragging
            simulation.alpha(0.3).alphaTarget(0.4).restart();
        },
    };
}
