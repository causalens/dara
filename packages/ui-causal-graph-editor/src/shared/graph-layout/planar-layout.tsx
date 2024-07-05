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
import {
    GraphNode,
    Layering,
    SugiLinkDatum,
    SugiNode,
    SugiNodeDatum,
    coordQuad,
    decrossTwoLayer,
    layeringLongestPath,
    layeringSimplex,
    sugiyama,
} from 'd3-dag';
import { LayoutMapping, XYPosition } from 'graphology-layout/utils';

import { DirectionType, GraphTiers, SimulationGraph, TieredGraphLayoutBuilder } from '../../types';
import { DagNodeData, dagGraphParser } from '../parsers';
import { GraphLayout, GraphLayoutBuilder } from './common';

// Defines the Layering algorithms supported by PlanarLayout
export enum LayeringAlgorithm {
    /** is optimized to minimize the total height of the graph, height being the direction in which the layers are placed */
    LONGEST_PATH = 'longest_path',
    /** is optimized to minimize the overall length of edges */
    SIMPLEX = 'simplex',
}
class PlanarLayoutBuilder extends GraphLayoutBuilder<PlanarLayout> {
    _orientation: DirectionType = 'horizontal';

    _tiers: GraphTiers;

    _layeringAlgorithm: LayeringAlgorithm = LayeringAlgorithm.SIMPLEX;

    /**
     * Sets the nodes orientation
     *
     * @param direction vertical or horizontal
     */
    orientation(direction: DirectionType): this {
        this._orientation = direction;
        return this;
    }

    /**
     * Sets the tiers for the graph
     *
     * @param tiers the tiers to use
     */
    tiers(tiers: GraphTiers): this {
        this._tiers = tiers;
        return this;
    }

    /**
     * Sets the layering algorithm to use
     *
     * @param algorithm the layering algorithm to use
     */
    layeringAlgorithm(algorithm: LayeringAlgorithm): this {
        this._layeringAlgorithm = algorithm;
        return this;
    }

    build(): PlanarLayout {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        return new PlanarLayout(this);
    }
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

/**
 * The Planar layout utilises the sugiyama algorithm to lay out nodes in a way that minimises
 * edge crossings.
 */
export default class PlanarLayout extends GraphLayout implements TieredGraphLayoutBuilder {
    public orientation: DirectionType = 'horizontal';

    public tiers: GraphTiers;

    public layeringAlgorithm: LayeringAlgorithm = LayeringAlgorithm.SIMPLEX;

    constructor(builder: PlanarLayoutBuilder) {
        super(builder);
        this.orientation = builder._orientation;
        this.tiers = builder._tiers;
        this.layeringAlgorithm = builder._layeringAlgorithm;
    }

    // eslint-disable-next-line class-methods-use-this
    get supportsDrag(): boolean {
        return false;
    }

    applyLayout(
        graph: SimulationGraph,
        forceUpdate?: (layout: LayoutMapping<XYPosition>, edgePoints: LayoutMapping<XYPosition[]>) => void
    ): Promise<{
        edgePoints?: LayoutMapping<XYPosition[]>;
        layout: LayoutMapping<XYPosition>;
        onAddEdge?: () => void | Promise<void>;
        onAddNode?: () => void | Promise<void>;
    }> {
        // define an inner method so it can be called repeatedly when nodes or edges are added
        const computeLayout = (
            currentGraph: SimulationGraph
        ): {
            edgePoints: LayoutMapping<XYPosition[]>;
            newLayout: LayoutMapping<XYPosition>;
            onAddNode?: () => void | Promise<void>;
        } => {
            const dag = dagGraphParser(currentGraph, this.tiers);

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
                    .nodeSize(() => [this.nodeSize * 3, this.nodeSize * 6])
                    .coord(coordQuad())
                    .layering(
                        this.tiers ?
                            layeringSimplex().group(groupAccessor).rank(rankAccessor)
                        :   getLayeringAlgorithm(this.layeringAlgorithm)
                    )
                    .decross(this.tiers ? customDecross : decrossTwoLayer());

                newDagLayout(dag);
            } catch (e) {
                throw new Error('d3-dag failed to resolve the layering of graph nodes for PlanarLayout.');
            }

            const edgePoints: LayoutMapping<XYPosition[]> = Array.from(dag.links()).reduce(
                (acc, link) => {
                    acc[`${link.source.data.id}||${link.target.data.id}`] = link.points.map((point: number[]) => ({
                        x: this.orientation === 'vertical' ? point[0] : point[1],
                        y: this.orientation === 'vertical' ? point[1] : point[0],
                    }));
                    return acc;
                },
                {} as LayoutMapping<XYPosition[]>
            );

            const newLayout: LayoutMapping<XYPosition> = Array.from(dag.nodes()).reduce((layout, node) => {
                layout[node.data.id] = {
                    x: this.orientation === 'vertical' ? node.x : node.y,
                    y: this.orientation === 'vertical' ? node.y : node.x,
                };
                return layout;
            }, {} as LayoutMapping<XYPosition>);

            return { edgePoints, newLayout };
        };

        const { newLayout, edgePoints } = computeLayout(graph);

        const recomputeLayout = (): void => {
            const { newLayout: recomputedLayout, edgePoints: recomputedPoints } = computeLayout(graph);

            forceUpdate(recomputedLayout, recomputedPoints);
        };

        return Promise.resolve({
            edgePoints,
            layout: newLayout,
            onAddEdge: recomputeLayout,
            onAddNode: recomputeLayout,
        });
    }

    static get Builder(): PlanarLayoutBuilder {
        return new PlanarLayoutBuilder();
    }
}
