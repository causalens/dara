import * as Comlink from 'comlink';
import type { LayoutMapping, XYPosition } from 'graphology-layout/utils';
import * as PIXI from 'pixi.js';

import { type SimulationGraph } from '@types';

import type { GraphLayout, LayoutComputationCallbacks, SerializableLayoutComputationResult } from '../common';

// Vite-specific import for worker - inline JS; the incorrect one will be treeshaken when bundling
import LayoutWorkerImpl from './worker?worker&inline';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
type RemoteWorker = typeof import('./worker').workerApi;

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
        // Note: Uncomment this for Webpack-based Storybook instead of the block below
        // this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
        this.worker = new LayoutWorkerImpl();

        this.remoteApi = Comlink.wrap(this.worker);
    }

    async applyLayout(
        layoutInstance: GraphLayout,
        graph: SimulationGraph,
        forceUpdate?: (layout: LayoutMapping<XYPosition>, edgePoints?: LayoutMapping<XYPosition[]>) => void
    ): Promise<SerializableLayoutComputationResult> {
        const params = layoutInstance.toLayoutParams();
        const serializedGraph = graph.export();

        this.emit('computationStart');
        console.log('Calling worker...');
        const result = await this.remoteApi.applyLayout(
            params,
            serializedGraph,
            forceUpdate ? Comlink.proxy(forceUpdate) : undefined
        );
        this.emit('computationEnd');
        return result;
    }

    async invokeCallback<CbName extends keyof LayoutComputationCallbacks>(
        cbName: CbName,
        ...args: Parameters<LayoutComputationCallbacks[CbName]>
    ): Promise<void> {
        // @ts-expect-error The type might not be quite correct
        return this.remoteApi.invokeCallback(cbName, ...args);
    }

    public destroy(): void {
        this.worker.terminate();
    }
}
