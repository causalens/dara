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
import type { LayoutMapping, XYPosition } from 'graphology-layout/utils';

import type { DirectionType, GraphTiers, SimulationGraph } from '../../types';
import { DEFAULT_NODE_SIZE } from '../utils';
import type { LayoutWorker } from './worker/client';

export abstract class GraphLayoutBuilder<T> {
    _nodeSize = DEFAULT_NODE_SIZE;

    _nodeFontSize = 16;

    /**
     * Sets node size and returns the builder
     *
     * @param size node size
     */
    nodeSize(size: number): this {
        this._nodeSize = size;
        return this;
    }

    /**
     * Sets node font size and returns the builder
     *
     * @param size node font size
     */
    nodeFontSize(size: number): this {
        this._nodeFontSize = size;
        return this;
    }

    abstract build(): T;
}

export interface BaseLayoutParams {
    layoutName: string;
    nodeSize: number;
    nodeFontSize: number;
}

export interface SerializableLayoutComputationResult {
    layout: LayoutMapping<XYPosition>;
    edgePoints?: LayoutMapping<XYPosition[]>;
}

export interface LayoutComputationCallbacks {
    onAddEdge?: () => void | Promise<void>;
    onAddNode?: () => void | Promise<void>;
    onCleanup?: () => void | Promise<void>;
    onEndDrag?: () => void | Promise<void>;
    onMove?: (nodeId: string, x: number, y: number) => void | Promise<void>;
    onStartDrag?: () => void | Promise<void>;
}

export type LayoutComputationResult = SerializableLayoutComputationResult & LayoutComputationCallbacks;

/**
 * Defines necessary properties that need to be implemented by graph layouts
 */
export abstract class GraphLayout<TLayoutParams extends BaseLayoutParams = BaseLayoutParams> {
    nodeSize: number;

    nodeFontSize: number;

    /**
     * Worker function that can be be called to compute a layout
     */
    worker: LayoutWorker;

    constructor(builder: GraphLayoutBuilder<unknown>) {
        this.nodeSize = builder._nodeSize;
        this.nodeFontSize = builder._nodeFontSize;
    }

    /**
     * Get the name of the layout.
     * This must be defined for each rather than using something like this.constructor.name
     * because the class name is mangled by minifiers.
     */
    // eslint-disable-next-line class-methods-use-this
    get name(): string {
        return 'GraphLayout';
    }

    // eslint-disable-next-line class-methods-use-this
    get supportsDrag(): boolean {
        return true;
    }

    // eslint-disable-next-line class-methods-use-this
    get requiresPosition(): boolean {
        return true;
    }

    /**
     * Apply a layout to a given graph data.
     *
     * Returns a computed layout.
     *
     * @param graphData graph data to apply the layout to
     * @param forceUpdate callback to call to update the layout
     */
    applyLayout(
        graph: SimulationGraph,
        forceUpdate?: (layout: LayoutMapping<XYPosition>, edgePoints?: LayoutMapping<XYPosition[]>) => void
    ): Promise<{
        edgePoints?: LayoutMapping<XYPosition[]>;
        layout: LayoutMapping<XYPosition>;
        onAddEdge?: () => void | Promise<void>;
        onAddNode?: () => void | Promise<void>;
        onCleanup?: () => void | Promise<void>;
        onEndDrag?: () => void | Promise<void>;
        onMove?: (nodeId: string, x: number, y: number) => void | Promise<void>;
        onStartDrag?: () => void | Promise<void>;
    }> {
        return this.worker.applyLayout(this, graph, forceUpdate);
    }

    /**
    * Convert the layout object to a serializable params object.
    * This representation is used to send the layout to the worker.
    */
    toLayoutParams(): TLayoutParams {
        return {
            nodeSize: this.nodeSize,
            nodeFontSize: this.nodeFontSize,
            layoutName: this.name,
        } as TLayoutParams;
    }
}

export interface GraphLayoutWithTiers extends GraphLayout {
    orientation: DirectionType;
    tiers: GraphTiers;
}

export interface GraphLayoutWithGrouping extends GraphLayout {
    group: string;
}
