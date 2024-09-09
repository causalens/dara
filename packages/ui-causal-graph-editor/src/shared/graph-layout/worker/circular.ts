import { circular } from 'graphology-layout';
import { LayoutMapping, XYPosition } from 'graphology-layout/utils';

import { SimulationGraph } from '@types';

import { CircularLayoutParams } from '../circular-layout';
import { LayoutComputationResult } from '../common';

export default function compute(layoutParams: CircularLayoutParams, graph: SimulationGraph): LayoutComputationResult {
    const layout = circular(graph, { scale: graph.order * layoutParams.nodeSize }) as LayoutMapping<XYPosition>;

    return { layout };
}
