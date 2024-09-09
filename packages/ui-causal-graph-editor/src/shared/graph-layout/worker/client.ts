import * as Comlink from 'comlink';
import { LayoutMapping, XYPosition } from 'graphology-layout/utils';
import * as PIXI from 'pixi.js';

import { SimulationGraph } from '@types';

import type { GraphLayout, LayoutComputationCallbacks, SerializableLayoutComputationResult } from '../common';
// Vite-specific import for worker - inline JS for prod, URL for dev; the incorrect one will be treeshaken when bundling
// eslint-disable-next-line import/no-duplicates
import LayoutWorkerImpl from './worker?worker&inline';
// eslint-disable-next-line import/no-duplicates
import LayoutWorkerUrl from './worker?worker&url';

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
        // Storybook
        if (import.meta.env?.MODE === undefined) {
            this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
        }
        // in VITE dev mode, workaround for cross-origin issue
        else if (import.meta.env.DEV) {
            // this inlines worker code which in turn imports the code from the Vite origin
            const js = `import ${JSON.stringify(new URL(LayoutWorkerUrl, import.meta.url))}`;
            const blob = new Blob([js], { type: 'application/javascript' });
            const objURL = URL.createObjectURL(blob);
            this.worker = new Worker(objURL, { type: 'module' });

            this.worker.addEventListener('error', () => {
                URL.revokeObjectURL(objURL);
            });
        } else {
            // Vite production
            this.worker = new LayoutWorkerImpl();
        }
        // for storybook
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
