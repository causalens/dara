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
import { DirectionType, GraphTiers, GroupingLayoutBuilder, TieredGraphLayoutBuilder } from '../../types';
import { BaseLayoutParams, GraphLayout, GraphLayoutBuilder } from './common';

export interface FcoseLayoutParams extends BaseLayoutParams {
    edgeElasticity: number;
    edgeLength: number;
    energy: number;
    gravity: number;
    gravityRange: number;
    highQuality: boolean;
    iterations: number;
    nodeRepulsion: number;
    nodeSeparation: number;
    tierSeparation: number;
    orientation?: DirectionType;
    tiers?: GraphTiers;
    group?: string;
}

class FcoseLayoutBuilder
    extends GraphLayoutBuilder<FcoseLayout>
    implements TieredGraphLayoutBuilder, GroupingLayoutBuilder
{
    _edgeElasticity = 0.45;

    _edgeLength = 3;

    _energy = 0.1;

    _gravity = 35;

    _gravityRange = 80;

    _highQuality = true;

    _iterations = 2500;

    _nodeRepulsion = 6500;

    _nodeSeparation = 75;

    _tierSeparation = 200;

    orientation?: DirectionType = 'horizontal';

    tiers: GraphTiers;

    group: string;

    /**
     * Set edge elasticity
     *
     * @param elasticity elasticity parameter
     */
    edgeElasticity(elasticity: number): this {
        this._edgeElasticity = elasticity;
        return this;
    }

    /**
     * Set ideal edge length multiplier
     *
     * @param lengthMultiplier length multiplier
     */
    edgeLength(lengthMultiplier: number): this {
        this._edgeLength = lengthMultiplier;
        return this;
    }

    /**
     * Set initial energy on incremental recomputation
     *
     * @param energy energy
     */
    energy(energy: number): this {
        this._energy = energy;
        return this;
    }

    /**
     * Set gravity strength
     *
     * @param gravity gravity
     */
    gravity(gravity: number): this {
        this._gravity = gravity;
        return this;
    }

    /**
     * Set gravity range
     *
     * @param gravityRange
     */
    gravityRange(gravityRange: number): this {
        this._gravityRange = gravityRange;
        return this;
    }

    /**
     * Toggle high quality mode ('proof' vs 'default')
     *
     * @param highQuality whether to use high quality
     */
    highQuality(highQuality: boolean): this {
        this._highQuality = highQuality;
        return this;
    }

    /**
     * Set number of iterations to run for
     *
     * @param iters number of iterations to run for
     */
    iterations(iters: number): this {
        this._iterations = iters;
        return this;
    }

    /**
     * Set node repulsion strength
     *
     * @param repulsion repulsion to set
     */
    nodeRepulsion(repulsion: number): this {
        this._nodeRepulsion = repulsion;
        return this;
    }

    /**
     * Set node separation multiplier
     *
     * @param separation separation
     */
    nodeSeparation(separation: number): this {
        this._nodeSeparation = separation;
        return this;
    }

    /**
     * Set tier separation
     *
     * @param separation separation
     */
    tierSeparation(separation: number): this {
        this._tierSeparation = separation;
        return this;
    }

    build(): FcoseLayout {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        return new FcoseLayout(this);
    }
}

export default class FcoseLayout extends GraphLayout<FcoseLayoutParams> {
    public edgeElasticity: number;

    public edgeLength: number;

    public energy: number;

    public gravity: number;

    public gravityRange: number;

    public highQuality: boolean;

    public iterations: number;

    public nodeRepulsion: number;

    public nodeSeparation: number;

    public tierSeparation: number;

    public orientation: DirectionType;

    public tiers: GraphTiers;

    public group: string;

    constructor(builder: FcoseLayoutBuilder) {
        super(builder);
        this.edgeElasticity = builder._edgeElasticity;
        this.edgeLength = builder._edgeLength;
        this.energy = builder._energy;
        this.gravity = builder._gravity;
        this.gravityRange = builder._gravityRange;
        this.highQuality = builder._highQuality;
        this.iterations = builder._iterations;
        this.nodeRepulsion = builder._nodeRepulsion;
        this.nodeSeparation = builder._nodeSeparation;
        this.tierSeparation = builder._tierSeparation;
        this.orientation = builder.orientation;
        this.tiers = builder.tiers;
        this.group = builder.group;
    }

    // eslint-disable-next-line class-methods-use-this
    get requiresPosition(): boolean {
        return false;
    }

    // eslint-disable-next-line class-methods-use-this
    get name(): string {
        return 'FcoseLayout';
    }

    static get Builder(): FcoseLayoutBuilder {
        return new FcoseLayoutBuilder();
    }

    toLayoutParams(): FcoseLayoutParams {
        return {
            ...super.toLayoutParams(),
            edgeElasticity: this.edgeElasticity,
            edgeLength: this.edgeLength,
            energy: this.energy,
            gravity: this.gravity,
            gravityRange: this.gravityRange,
            highQuality: this.highQuality,
            iterations: this.iterations,
            nodeRepulsion: this.nodeRepulsion,
            nodeSeparation: this.nodeSeparation,
            tierSeparation: this.tierSeparation,
            orientation: this.orientation,
            tiers: this.tiers,
            group: this.group,
        };
    }
}
