import { circular } from 'graphology-layout';
import type { LayoutMapping, XYPosition } from 'graphology-layout/utils';

import type { SimulationGraph } from '@types';

import type { CircularLayoutParams } from '../circular-layout';
import type { LayoutComputationResult } from '../common';

export default function compute(layoutParams: CircularLayoutParams, graph: SimulationGraph): LayoutComputationResult {
    const layout = circular(graph, { scale: graph.order * layoutParams.nodeSize }) as LayoutMapping<XYPosition>;

    return { layout };
}
