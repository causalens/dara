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

import type { DirectionType, GraphTiers, SimulationGraph, TieredGraphLayoutBuilder } from '../../types';
import { PlanarLayeringAlgorithm } from '../../types';
import type { BaseLayoutParams } from './common';
import { GraphLayout, GraphLayoutBuilder } from './common';

class PlanarLayoutBuilder extends GraphLayoutBuilder<PlanarLayout> {
    _orientation: DirectionType = 'horizontal';

    _tiers: GraphTiers;

    _layeringAlgorithm: PlanarLayeringAlgorithm = PlanarLayeringAlgorithm.SIMPLEX;

    /**
     * Sets the nodes orientation
     *
     * @param direction vertical or horizontal
     */
    orientation(direction: DirectionType): this {
        this._orientation = direction;
        return this;
    }

    /**
     * Sets the tiers for the graph
     *
     * @param tiers the tiers to use
     */
    tiers(tiers: GraphTiers): this {
        this._tiers = tiers;
        return this;
    }

    /**
     * Sets the layering algorithm to use
     *
     * @param algorithm the layering algorithm to use
     */
    layeringAlgorithm(algorithm: PlanarLayeringAlgorithm): this {
        this._layeringAlgorithm = algorithm;
        return this;
    }

    build(): PlanarLayout {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        return new PlanarLayout(this);
    }
}

export interface PlanarLayoutParams extends BaseLayoutParams {
    orientation: DirectionType;
    tiers: GraphTiers;
    layeringAlgorithm: PlanarLayeringAlgorithm;
}

/**
 * The Planar layout utilises the sugiyama algorithm to lay out nodes in a way that minimises
 * edge crossings.
 */
export default class PlanarLayout extends GraphLayout<PlanarLayoutParams> implements TieredGraphLayoutBuilder {
    public orientation: DirectionType = 'horizontal';

    public tiers: GraphTiers;

    public layeringAlgorithm: PlanarLayeringAlgorithm = PlanarLayeringAlgorithm.SIMPLEX;

    constructor(builder: PlanarLayoutBuilder) {
        super(builder);
        this.orientation = builder._orientation;
        this.tiers = builder._tiers;
        this.layeringAlgorithm = builder._layeringAlgorithm;
    }

    // eslint-disable-next-line class-methods-use-this
    get supportsDrag(): boolean {
        return false;
    }

    async applyLayout(
        graph: SimulationGraph,
        forceUpdate?: (layout: LayoutMapping<XYPosition>, edgePoints: LayoutMapping<XYPosition[]>) => void
    ): Promise<{
        edgePoints?: LayoutMapping<XYPosition[]>;
        layout: LayoutMapping<XYPosition>;
        onAddEdge?: () => void | Promise<void>;
        onAddNode?: () => void | Promise<void>;
    }> {
        const { layout, edgePoints } = await this.worker.applyLayout(this, graph, forceUpdate);

        const recomputeLayout = async (): Promise<void> => {
            const { layout: recomputedLayout, edgePoints: recomputedPoints } = await this.worker.applyLayout(
                this,
                graph,
                forceUpdate
            );
            forceUpdate(recomputedLayout, recomputedPoints);
        };

        return {
            edgePoints,
            layout,
            onAddEdge: recomputeLayout,
            onAddNode: recomputeLayout,
        };
    }

    // eslint-disable-next-line class-methods-use-this
    get name(): string {
        return 'PlanarLayout';
    }

    static get Builder(): PlanarLayoutBuilder {
        return new PlanarLayoutBuilder();
    }

    toLayoutParams(): PlanarLayoutParams {
        return {
            ...super.toLayoutParams(),
            orientation: this.orientation,
            tiers: this.tiers,
            layeringAlgorithm: this.layeringAlgorithm,
        };
    }
}
