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
import type { DirectionType, GraphTiers, TieredGraphLayoutBuilder } from '../../types';
import type { BaseLayoutParams} from './common';
import { GraphLayout, GraphLayoutBuilder } from './common';

export type TargetLocation = 'center' | 'bottom';

class MarketingLayoutBuilder extends GraphLayoutBuilder<MarketingLayout> implements TieredGraphLayoutBuilder {
    _targetLocation: TargetLocation = 'bottom';

    _tierSeparation = 300;

    orientation: DirectionType = 'horizontal';

    tiers: GraphTiers;

    /**
     * Sets the target location and returns the builder
     *
     * @param location location of the target node
     */
    targetLocation(location: TargetLocation): this {
        this._targetLocation = location;
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

    build(): MarketingLayout {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        return new MarketingLayout(this);
    }
}

export interface MarketingLayoutParams extends BaseLayoutParams {
    targetLocation: TargetLocation;
    tierSeparation: number;
    orientation: DirectionType;
    tiers: GraphTiers;
}

/**
 * The Marketing layout uses a force simulation with strong forces to lay out nodes in a way
 * that works well with a low number of nodes.
 * The layout does not keep the force simulation running, instead it manually runs a number of ticks
 * whenever the layout is updated.
 */
export default class MarketingLayout extends GraphLayout<MarketingLayoutParams> {
    public targetLocation: TargetLocation = 'bottom';

    public tierSeparation: number;

    public orientation: DirectionType;

    public tiers: GraphTiers;

    constructor(builder: MarketingLayoutBuilder) {
        super(builder);
        this.targetLocation = builder._targetLocation;
        this.tierSeparation = builder._tierSeparation;
        this.orientation = builder.orientation;
        this.tiers = builder.tiers;
    }

    // eslint-disable-next-line class-methods-use-this
    get name(): string {
        return 'MarketingLayout';
    }

    static get Builder(): MarketingLayoutBuilder {
        return new MarketingLayoutBuilder();
    }

    toLayoutParams(): MarketingLayoutParams {
        return {
            ...super.toLayoutParams(),
            targetLocation: this.targetLocation,
            tierSeparation: this.tierSeparation,
            orientation: this.orientation,
            tiers: this.tiers,
        };
    }
}
