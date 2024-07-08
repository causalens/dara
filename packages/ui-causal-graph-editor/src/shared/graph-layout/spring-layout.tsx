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
import * as d3 from 'd3';
import { Simulation, SimulationLinkDatum } from 'd3';
import { LayoutMapping, XYPosition } from 'graphology-layout/utils';
import debounce from 'lodash/debounce';

import {
    D3SimulationEdge,
    DirectionType,
    EdgeType,
    GraphTiers,
    GroupingLayoutBuilder,
    SimulationGraph,
    SimulationNode,
    SimulationNodeWithCategory,
    TieredGraphLayoutBuilder,
} from '../../types';
import { getD3Data, nodesToLayout } from '../parsers';
import { getGroupToNodesMap, getNodeOrder, getTiersArray } from '../utils';
import { GraphLayout, GraphLayoutBuilder } from './common';

class SpringLayoutBuilder
    extends GraphLayoutBuilder<SpringLayout>
    implements TieredGraphLayoutBuilder, GroupingLayoutBuilder
{
    _collisionForce = 2;

    _gravity = -50;

    _linkForce = 5;

    _warmupTicks = 100;

    _tierSeparation = 300;

    _groupRepelStrength = 2000;

    orientation: DirectionType = 'horizontal';

    tiers: GraphTiers;

    group: string;

    /**
     * Set the multiplier for collision force
     *
     * @param force force to set
     */
    collisionForce(force: number): this {
        this._collisionForce = force;
        return this;
    }

    /**
     * Set the multiplier for link force
     *
     * @param force force to set
     */
    linkForce(force: number): this {
        this._linkForce = force;
        return this;
    }

    /**
     * Set the gravity force
     *
     * @param force force to set
     */
    gravity(force: number): this {
        this._gravity = force;
        return this;
    }

    /**
     * Sets the number of ticks to run the simulation for before displaying the layout
     *
     * @param ticks number of ticks to run before display
     */
    warmupTicks(ticks: number): this {
        this._warmupTicks = ticks;
        return this;
    }

    /**
     * Set tier separation
     *
     * @param separation separation
     */
    tierSeparation(separation: number): this {
        this._tierSeparation = separation;
        return this;
    }

    /**
     * Set the repulsive force strength between groups
     *
     * @param force force
     */
    groupRepelStrength(force: number): this {
        this._groupRepelStrength = force;
        return this;
    }

    build(): SpringLayout {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        return new SpringLayout(this);
    }
}

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
 * The Spring layout uses a force simulation to position nodes.
 * The layout keeps the simulation running as nodes are being dragged which produces the spring behaviour of edges.
 */
export default class SpringLayout extends GraphLayout {
    public collisionForce: number;

    public gravity: number;

    public linkForce: number;

    public warmupTicks: number;

    public tierSeparation: number;

    public groupRepelStrength: number;

    public orientation: DirectionType;

    public tiers: GraphTiers;

    public group: string;

    constructor(builder: SpringLayoutBuilder) {
        super(builder);
        this.collisionForce = builder._collisionForce;
        this.linkForce = builder._linkForce;
        this.gravity = builder._gravity;
        this.warmupTicks = builder._warmupTicks;
        this.tierSeparation = builder._tierSeparation;
        this.groupRepelStrength = builder._groupRepelStrength;
        this.orientation = builder.orientation;
        this.tiers = builder.tiers;
        this.group = builder.group;
    }

    applyLayout(
        graph: SimulationGraph,
        forceUpdate: (layout: LayoutMapping<XYPosition>) => void
    ): Promise<{
        layout: LayoutMapping<XYPosition>;
        onAddNode?: () => void | Promise<void>;
        onCleanup?: () => void | Promise<void>;
        onEndDrag?: () => void | Promise<void>;
        onMove?: (nodeId: string, x: number, y: number) => void;
        onStartDrag?: () => void | Promise<void>;
    }> {
        // We're modifying edges/nodes
        const [edges, nodes] = getD3Data(graph);

        const { group, groupRepelStrength } = this;

        let simulation: Simulation<SimulationNode, D3SimulationEdge>;

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
                        const strength =
                            (groupRepelStrength * strengthFactor * alpha) / (cappedDistance * cappedDistance);

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
            const groupEdges = createEdgesWithinAllGroups(this.group, graph, nodes);

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
                        .distance(() => this.nodeSize * this.linkForce)
                )
                // The collide force makes sure that the nodes never overlap with each other
                .force('collide', d3.forceCollide(this.nodeSize * this.collisionForce))
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
                        .distance(() => this.nodeSize * this.linkForce)
                )
                // The charge force acts to push the nodes away from each other so they have space
                .force('charge', d3.forceManyBody().strength(this.gravity))
                // The collide force makes sure that the nodes never overlap with each other
                .force('collide', d3.forceCollide(this.nodeSize * this.collisionForce))
                // The center force keeps nodes in the middle of the viewport
                .force('center', d3.forceCenter())
                .stop(); // don't start just yet
        }

        if (this.tiers) {
            applyTierForces(simulation, graph, nodes, this.tiers, this.tierSeparation, this.orientation);
        }

        // Warm-up the simulation so the jump to the center isn't visible
        simulation.tick(this.warmupTicks);

        simulation
            .on('tick', () => {
                // On each tick, update simulation nodes
                const newNodes = nodesToLayout(simulation.nodes());

                // Force an update
                forceUpdate(newNodes);
            })
            .restart();

        const onAddNode = debounce(() => {
            // replace nodes, re-add link force
            simulation
                .nodes(nodes)
                .force(
                    'links',
                    d3
                        .forceLink<SimulationNode, SimulationLinkDatum<SimulationNode>>(edges)
                        .id((d) => d.id)
                        .distance(() => this.nodeSize * this.linkForce)
                )
                .alpha(0.8)
                .alphaTarget(0)
                .restart();
        }, 100);

        return Promise.resolve({
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
        });
    }

    static get Builder(): SpringLayoutBuilder {
        return new SpringLayoutBuilder();
    }
}
