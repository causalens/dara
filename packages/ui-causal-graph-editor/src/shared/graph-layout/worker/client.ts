import * as Comlink from 'comlink';
import { LayoutMapping, XYPosition } from 'graphology-layout/utils';
import * as PIXI from 'pixi.js';

import { SimulationGraph } from '@types';

import type { GraphLayout } from '../common';

type RemoteWorker = typeof import('./worker').workerApi;

type ApplyLayout = (
    layoutInstance: GraphLayout,
    graph: SimulationGraph
) => Promise<{
    layout: LayoutMapping<XYPosition>;
    edgePoints?: LayoutMapping<XYPosition[]>;
}>;

interface LayoutEvents {
    computationStart: () => void;
    computationEnd: () => void;
}

/**
 * Worker class that handles the layout computation.
 * Creates a web worker and uses it to compute the layout.
 */
export class LayoutWorker extends PIXI.EventEmitter<LayoutEvents> {
    private worker: Worker;

    private remoteApi: Comlink.Remote<RemoteWorker>;

    constructor() {
        super();
        this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
        this.remoteApi = Comlink.wrap(this.worker);
    }

    async applyLayout(
        layoutInstance: GraphLayout,
        graph: SimulationGraph,
        forceUpdate?: (layout: LayoutMapping<XYPosition>, edgePoints?: LayoutMapping<XYPosition[]>) => void
    ): ReturnType<ApplyLayout> {
        const params = layoutInstance.toLayoutParams();
        const serializedGraph = graph.export();

        this.emit('computationStart');
        const result = await this.remoteApi.applyLayout(
            params,
            serializedGraph,
            forceUpdate ? Comlink.proxy(forceUpdate) : undefined
        );
        // FAKE computation time
        //await new Promise((resolve) => setTimeout(resolve, 2000));
        this.emit('computationEnd');
        return result;
    }

    async invokeCallback(cbName: string, ...args: unknown[]): Promise<void> {
        return this.remoteApi.invokeCallback(cbName, ...args);
    }

    public destroy(): void {
        this.worker.terminate();
    }
}
