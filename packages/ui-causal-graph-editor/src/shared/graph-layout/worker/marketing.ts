import * as d3 from 'd3';
import type { SimulationLinkDatum } from 'd3';

import type { SimulationGraph, SimulationNodeWithCategory } from '../../../types';
import { getD3Data, nodesToLayout } from '../../parsers';
import type { LayoutComputationResult } from '../common';
import type { MarketingLayoutParams } from '../marketing-layout';
import { applyTierForces } from './spring';

export default function compute(layoutParams: MarketingLayoutParams, graph: SimulationGraph): LayoutComputationResult {
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
                .distance(() => layoutParams.nodeSize * 3)
                .strength(layoutParams.targetLocation === 'center' ? 0.7 : 0.1)
        )
        // The charge force acts to push the nodes away from each other so they have space
        .force('charge', d3.forceManyBody().strength(layoutParams.targetLocation === 'center' ? -1000 : -2000))
        // The y force acts to split the different groups up vertically on the graph
        .force(
            'y',
            d3
                .forceY<SimulationNodeWithCategory>()
                .y((node) => {
                    if (node.category === 'target') {
                        return layoutParams.nodeSize * 10;
                    }
                    if (node.category === 'latent') {
                        return layoutParams.nodeSize * 2;
                    }

                    return layoutParams.nodeSize * 6;
                })
                .strength(layoutParams.targetLocation === 'center' ? 0 : 0.3)
        )
        // The collide force makes sure that the nodes never overlap with each other
        .force('collide', d3.forceCollide(layoutParams.nodeSize + 10))
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
                            return layoutParams.nodeSize * 8;
                        }

                        return layoutParams.nodeSize * 4;
                    },
                    600,
                    400
                )
                .strength((node) => {
                    if (layoutParams.targetLocation === 'center') {
                        return 1;
                    }
                    return node.category === 'other' ? 0.7 : 1;
                })
        )
        .stop();

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

    simulation.tick(1000);

    return { layout: nodesToLayout(simulation.nodes()) };
}
