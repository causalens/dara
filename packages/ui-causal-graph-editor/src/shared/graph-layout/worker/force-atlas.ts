import { random } from 'graphology-layout';
import forceAtlas from 'graphology-layout-forceatlas2';
import noverlap from 'graphology-layout-noverlap';

import { type SimulationGraph } from '../../../types';
import type { LayoutComputationResult } from '../common';
import type { ForceAtlasLayoutParams } from '../force-atlas-layout';

export default function compute(layoutParams: ForceAtlasLayoutParams, graph: SimulationGraph): LayoutComputationResult {
    if (graph.nodes().length === 0) {
        return { layout: {} };
    }

    const firstNodeAttrs = graph.getNodeAttributes(graph.nodes()[0]);
    const graphClone = graph.copy();
    const size = graphClone.getAttribute('size');

    // If x is not set yet on nodes
    if (!firstNodeAttrs.x) {
        // Create a random layout
        const randomMapping = random(graph, { center: 1000, scale: 2000 });
        graphClone.updateEachNodeAttributes((n, attrs) => ({
            ...attrs,
            ...randomMapping[n],
        }));

        // Fix overlaps with noverlap so the force simulation has to do less iterations
        const noverlapMapping = noverlap(graphClone, {
            maxIterations: 100,
            settings: {
                margin: size,
            },
        });
        graphClone.updateEachNodeAttributes((n, attrs) => ({
            ...attrs,
            ...noverlapMapping[n],
        }));
    }

    // add size attribute
    graphClone.updateEachNodeAttributes((n, attrs) => ({
        ...attrs,
        size,
    }));

    const newLayout = forceAtlas(graphClone, {
        getEdgeWeight: 1,
        iterations: layoutParams.iterations,
        settings: {
            adjustSizes: true,
            barnesHutOptimize: layoutParams.barnesHutOptimize,
            edgeWeightInfluence: layoutParams.edgeWeightInfluence,
            gravity: layoutParams.gravity,
            linLogMode: layoutParams.linLogMode,
            outboundAttractionDistribution: layoutParams.outboundAttractionDistribution,
            scalingRatio: layoutParams.scalingRatio,
            slowDown: 5,
            strongGravityMode: layoutParams.strongGravityMode,
        },
    });

    return { layout: newLayout };
}
