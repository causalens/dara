import {
    GraphNode,
    Layering,
    MutGraph,
    SugiLinkDatum,
    SugiNode,
    SugiNodeDatum,
    coordQuad,
    decrossTwoLayer,
    graphStratify,
    layeringLongestPath,
    layeringSimplex,
    sugiyama,
} from 'd3-dag';
import type { LayoutMapping, XYPosition } from 'graphology-layout/utils';

import { type GraphTiers, LayeringAlgorithm, type SimulationGraph, type SimulationNode } from '../../../types';
import { getNodeOrder, getTiersArray } from '../../utils';
import { PlanarLayoutParams } from '../planar-layout';
import { LayoutComputationResult } from '../common';

interface NodeOrder {
    group: string;
    order: string;
    rank: number;
}

type DagNodeData = SimulationNode &
    Partial<NodeOrder> & {
        parentIds: string[];
    };

/**
 * This parses the graph structure into a Dag structure that the d3-dag library can understand
 *
 * @param graph The SimulationGraph
 * @param tiers Any tiers passed to the layout
 */
function dagGraphParser(graph: SimulationGraph, tiers?: GraphTiers): MutGraph<DagNodeData, any> {
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
 * Gets the order value for a given node or link data
 *
 * @param data the data of a pure node or link
 */
function getOrdValue(data: SugiNodeDatum<{ ord?: number }> | SugiLinkDatum<{ ord?: number }>): number {
    if (data.role === 'node') {
        return Number(data.node.data.ord) || 0;
    }
    // Here we define which order the edges connecting nodes from previous layer should appear in
    // As a crude approach we define that their order should follow the mean of the source and target nodes.
    const sourceOrd = Number.isNaN(Number(data.link.source.data.ord)) ? 0 : Number(data.link.source.data.ord);
    const targetOrd = Number.isNaN(Number(data.link.target.data.ord)) ? 0 : Number(data.link.target.data.ord);

    return (sourceOrd + targetOrd) / 2;
}

/**
 * customDecross function that takes ordering of nodes into account
 *
 * @param layers the layers defined by the layering step
 */
function customDecross(layers: SugiNode<{ ord?: number }, unknown>[][]): void {
    const vals = new Map<SugiNode, number>();

    layers.forEach((layer) => {
        layer.forEach((node) => {
            const val = getOrdValue(node.data);
            vals.set(node, val);
        });

        layer.sort((a, b) => vals.get(a) - vals.get(b));
    });
}

/**
 * Gets the layering algorithm for a given LayeringAlgorithm enum value
 *
 * @param algorithm the layering algorithm to use
 */
function getLayeringAlgorithm(algorithm: LayeringAlgorithm): Layering<DagNodeData, any> {
    if (algorithm === LayeringAlgorithm.LONGEST_PATH) {
        return layeringLongestPath();
    }
    return layeringSimplex();
}

export default function compute(
    layoutParams: PlanarLayoutParams,
    currentGraph: SimulationGraph
): LayoutComputationResult {
    const dag = dagGraphParser(currentGraph, layoutParams.tiers);

    /**
     * The nodeSize is scaled for consistent spacing in the horizontal layout
     */
    let newDagLayout;

    try {
        function groupAccessor(node: GraphNode<DagNodeData, any>): string {
            return node.data.group;
        }

        function rankAccessor(node: GraphNode<DagNodeData, any>): number {
            return node.data.rank;
        }

        newDagLayout = sugiyama()
            .nodeSize(() => [layoutParams.nodeSize * 3, layoutParams.nodeSize * 6])
            .coord(coordQuad())
            .layering(
                layoutParams.tiers ?
                    layeringSimplex().group(groupAccessor).rank(rankAccessor)
                :   getLayeringAlgorithm(layoutParams.layeringAlgorithm)
            )
            .decross(layoutParams.tiers ? customDecross : decrossTwoLayer());

        newDagLayout(dag);
    } catch (e) {
        throw new Error('d3-dag failed to resolve the layering of graph nodes for PlanarLayout.');
    }

    const edgePoints: LayoutMapping<XYPosition[]> = Array.from(dag.links()).reduce(
        (acc, link) => {
            acc[`${link.source.data.id}||${link.target.data.id}`] = link.points.map((point: number[]) => ({
                x: layoutParams.orientation === 'vertical' ? point[0] : point[1],
                y: layoutParams.orientation === 'vertical' ? point[1] : point[0],
            }));
            return acc;
        },
        {} as LayoutMapping<XYPosition[]>
    );

    const newLayout: LayoutMapping<XYPosition> = Array.from(dag.nodes()).reduce((layout, node) => {
        layout[node.data.id] = {
            x: layoutParams.orientation === 'vertical' ? node.x : node.y,
            y: layoutParams.orientation === 'vertical' ? node.y : node.x,
        };
        return layout;
    }, {} as LayoutMapping<XYPosition>);

    return { edgePoints, layout: newLayout };
}
