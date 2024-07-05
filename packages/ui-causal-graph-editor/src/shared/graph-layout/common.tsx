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
import { LayoutMapping, XYPosition } from 'graphology-layout/utils';

import { DirectionType, GraphTiers, SimulationGraph } from '../../types';
import { DEFAULT_NODE_SIZE } from '../utils';

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

/**
 * Defines necessary properties that need to be implemented by graph layouts
 */
export abstract class GraphLayout {
    nodeSize: number;

    nodeFontSize: number;

    constructor(builder: GraphLayoutBuilder<unknown>) {
        this.nodeSize = builder._nodeSize;
        this.nodeFontSize = builder._nodeFontSize;
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
    abstract applyLayout(
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
    }>;
}

export interface GraphLayoutWithTiers extends GraphLayout {
    orientation: DirectionType;
    tiers: GraphTiers;
}

export interface GraphLayoutWithGrouping extends GraphLayout {
    group: string;
}
