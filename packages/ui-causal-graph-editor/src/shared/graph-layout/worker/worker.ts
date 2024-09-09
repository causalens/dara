import * as Comlink from 'comlink';
import { DirectedGraph } from 'graphology';
import { LayoutMapping, XYPosition } from 'graphology-layout/utils';
import { SerializedGraph } from 'graphology-types';

import { SimulationAttributes, SimulationEdge, SimulationNode } from '@types';

import type {
    BaseLayoutParams,
    LayoutComputationCallbacks,
    LayoutComputationResult,
    SerializableLayoutComputationResult,
} from '../common';
import computeCircularLayout from './circular';
import computeFcoseLayout from './fcose';
import computeForceAtlasLayout from './force-atlas';
import computeMarketingLayout from './marketing';
import computePlanarLayout from './planar';
import computeSpringLayout from './spring';

interface LayoutImpl {
    (
        layoutParams: BaseLayoutParams,
        graph: DirectedGraph<SimulationNode, SimulationEdge, SimulationAttributes>,
        forceUpdate?: (layout: LayoutMapping<XYPosition>, edgePoints?: LayoutMapping<XYPosition[]>) => void
    ): Promise<LayoutComputationResult> | LayoutComputationResult;
}

const IMPL_MAP: Record<string, LayoutImpl> = {
    PlanarLayout: computePlanarLayout,
    FcoseLayout: computeFcoseLayout,
    ForceAtlasLayout: computeForceAtlasLayout,
    CircularLayout: computeCircularLayout,
    MarketingLayout: computeMarketingLayout,
    SpringLayout: computeSpringLayout,
};

/**
 * Callbacks returned by the layout computation to be invoked by requests
 */
const LAYOUT_CALLBACKS: LayoutComputationCallbacks = {} as const;

/**
 * Compute the layout for the given graph using the provided layout parameters.
 *
 * @param layoutParams layout parameters
 * @param graph the graph to apply the layout to
 * @param forceUpdate callback to update the layout, is a proxy to the main thread
 */
export async function applyLayout<TParams extends BaseLayoutParams>(
    layoutParams: TParams,
    serializedGraph: SerializedGraph<SimulationNode, SimulationEdge, SimulationAttributes>,
    forceUpdate?: (layout: LayoutMapping<XYPosition>, edgePoints?: LayoutMapping<XYPosition[]>) => void
): Promise<SerializableLayoutComputationResult> {
    console.log('Applying layout', layoutParams);
    // reconstruct the graph from the serialized form
    const graph = new DirectedGraph<SimulationNode, SimulationEdge, SimulationAttributes>();
    graph.import(serializedGraph);

    const impl = IMPL_MAP[layoutParams.layoutName];

    if (!impl) {
        throw new Error(`Unknown layout: ${layoutParams.layoutName}`);
    }

    let result = impl(layoutParams, graph, forceUpdate);

    if (result instanceof Promise) {
        result = await result;
    }

    // Register callbacks returned by the layout computation to be invoked by requests
    // since they can't be serialized back to the browser
    for (const [key, value] of Object.entries(result)) {
        if (typeof value === 'function') {
            LAYOUT_CALLBACKS[key as keyof LayoutComputationCallbacks] = value;
        }
    }

    return {
        layout: result.layout,
        edgePoints: result.edgePoints,
    };
}

/**
 * Invoke a callback registered by the layout computation.
 *
 * @param cbName name of the callback to invoke
 * @param args arguments to pass to the callback
 */
export async function invokeCallback<CbName extends keyof LayoutComputationCallbacks>(
    cbName: CbName,
    ...args: Parameters<LayoutComputationCallbacks[CbName]>
): Promise<void> {
    const cb = LAYOUT_CALLBACKS[cbName];

    if (cb === undefined) {
        // eslint-disable-next-line no-console
        console.error(`Callback not found: ${cbName}`);
        return;
    }

    // @ts-expect-error The type might not be quite correct
    return cb(...args);
}

export const workerApi = {
    applyLayout,
    invokeCallback,
} as const;

Comlink.expose(workerApi);
