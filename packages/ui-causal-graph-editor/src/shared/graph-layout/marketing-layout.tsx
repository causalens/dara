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
import { SimulationLinkDatum } from 'd3';
import { LayoutMapping, XYPosition } from 'graphology-layout/utils';

import {
    DirectionType,
    GraphTiers,
    SimulationGraph,
    SimulationNodeWithCategory,
    TieredGraphLayoutBuilder,
} from '../../types';
import { getD3Data, nodesToLayout } from '../parsers';
import { GraphLayout, GraphLayoutBuilder } from './common';
import { applyTierForces } from './spring-layout';

export type TargetLocation = 'center' | 'bottom';

class MarketingLayoutBuilder extends GraphLayoutBuilder<MarketingLayout> implements TieredGraphLayoutBuilder {
    _targetLocation: TargetLocation = 'bottom';

    _tierSeparation = 300;

    orientation: DirectionType = 'horizontal';

    tiers: GraphTiers;

    /**
     * Sets the target location and returns the builder
     *
     * @param location location of the target node
     */
    targetLocation(location: TargetLocation): this {
        this._targetLocation = location;
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

    build(): MarketingLayout {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        return new MarketingLayout(this);
    }
}

/**
 * The Marketing layout uses a force simulation with strong forces to lay out nodes in a way
 * that works well with a low number of nodes.
 * The layout does not keep the force simulation running, instead it manually runs a number of ticks
 * whenever the layout is updated.
 */
export default class MarketingLayout extends GraphLayout {
    public targetLocation: TargetLocation = 'bottom';

    public tierSeparation: number;

    public orientation: DirectionType;

    public tiers: GraphTiers;

    constructor(builder: MarketingLayoutBuilder) {
        super(builder);
        this.targetLocation = builder._targetLocation;
        this.tierSeparation = builder._tierSeparation;
        this.orientation = builder.orientation;
        this.tiers = builder.tiers;
    }

    applyLayout(graph: SimulationGraph): Promise<{
        layout: LayoutMapping<XYPosition>;
    }> {
        const [edges, nodes] = getD3Data(graph);

        // Add some code in here to move the root of the graph up when there are no secondary nodes.
        const simulation = d3
            .forceSimulation(nodes)
            .alphaMin(0.001)
            // The link force pulls linked nodes together so they try to be a given distance apart
            .force(
                'link',
                d3
                    .forceLink<SimulationNodeWithCategory, SimulationLinkDatum<SimulationNodeWithCategory>>(edges)
                    .id((d) => d.id)
                    .distance(() => this.nodeSize * 3)
                    .strength(this.targetLocation === 'center' ? 0.7 : 0.1)
            )
            // The charge force acts to push the nodes away from each other so they have space
            .force('charge', d3.forceManyBody().strength(this.targetLocation === 'center' ? -1000 : -2000))
            // The y force acts to split the different groups up vertically on the graph
            .force(
                'y',
                d3
                    .forceY<SimulationNodeWithCategory>()
                    .y((node) => {
                        if (node.category === 'target') {
                            return this.nodeSize * 10;
                        }
                        if (node.category === 'latent') {
                            return this.nodeSize * 2;
                        }

                        return this.nodeSize * 6;
                    })
                    .strength(this.targetLocation === 'center' ? 0 : 0.3)
            )
            // The collide force makes sure that the nodes never overlap with each other
            .force('collide', d3.forceCollide(this.nodeSize + 10))
            // The radial force aligns all the groups to increasing circle sizes out from a central point.
            .force(
                'radial',
                d3
                    .forceRadial<SimulationNodeWithCategory>(
                        (node) => {
                            if (node.category === 'target') {
                                return 0;
                            }
                            if (node.category === 'latent') {
                                return this.nodeSize * 8;
                            }

                            return this.nodeSize * 4;
                        },
                        600,
                        400
                    )
                    .strength((node) => {
                        if (this.targetLocation === 'center') {
                            return 1;
                        }
                        return node.category === 'other' ? 0.7 : 1;
                    })
            )
            .stop();

        if (this.tiers) {
            applyTierForces(simulation, graph, nodes, this.tiers, this.tierSeparation, this.orientation);
        }

        simulation.tick(1000);

        return Promise.resolve({ layout: nodesToLayout(simulation.nodes()) });
    }

    static get Builder(): MarketingLayoutBuilder {
        return new MarketingLayoutBuilder();
    }
}
