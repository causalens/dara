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
import * as d3 from 'd3';
import { Simulation, SimulationLinkDatum } from 'd3';
import { LayoutMapping, XYPosition } from 'graphology-layout/utils';
import debounce from 'lodash/debounce';

import {
    D3SimulationEdge,
    DirectionType,
    EdgeType,
    GraphTiers,
    GroupingLayoutBuilder,
    SimulationGraph,
    SimulationNode,
    SimulationNodeWithCategory,
    TieredGraphLayoutBuilder,
} from '../../types';
import { getD3Data, nodesToLayout } from '../parsers';
import { getGroupToNodesMap, getNodeOrder, getTiersArray } from '../utils';
import { BaseLayoutParams, GraphLayout, GraphLayoutBuilder } from './common';

class SpringLayoutBuilder
    extends GraphLayoutBuilder<SpringLayout>
    implements TieredGraphLayoutBuilder, GroupingLayoutBuilder
{
    _collisionForce = 2;

    _gravity = -50;

    _linkForce = 5;

    _warmupTicks = 100;

    _tierSeparation = 300;

    _groupRepelStrength = 2000;

    orientation: DirectionType = 'horizontal';

    tiers: GraphTiers;

    group: string;

    /**
     * Set the multiplier for collision force
     *
     * @param force force to set
     */
    collisionForce(force: number): this {
        this._collisionForce = force;
        return this;
    }

    /**
     * Set the multiplier for link force
     *
     * @param force force to set
     */
    linkForce(force: number): this {
        this._linkForce = force;
        return this;
    }

    /**
     * Set the gravity force
     *
     * @param force force to set
     */
    gravity(force: number): this {
        this._gravity = force;
        return this;
    }

    /**
     * Sets the number of ticks to run the simulation for before displaying the layout
     *
     * @param ticks number of ticks to run before display
     */
    warmupTicks(ticks: number): this {
        this._warmupTicks = ticks;
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

    /**
     * Set the repulsive force strength between groups
     *
     * @param force force
     */
    groupRepelStrength(force: number): this {
        this._groupRepelStrength = force;
        return this;
    }

    build(): SpringLayout {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        return new SpringLayout(this);
    }
}

export interface SpringLayoutParams extends BaseLayoutParams {
    collisionForce: number;

    gravity: number;

    linkForce: number;

    warmupTicks: number;

    tierSeparation: number;

    groupRepelStrength: number;

    orientation: DirectionType;

    tiers: GraphTiers;

    group: string;
}

/**
 * The Spring layout uses a force simulation to position nodes.
 * The layout keeps the simulation running as nodes are being dragged which produces the spring behaviour of edges.
 */
export default class SpringLayout extends GraphLayout<SpringLayoutParams> {
    public collisionForce: number;

    public gravity: number;

    public linkForce: number;

    public warmupTicks: number;

    public tierSeparation: number;

    public groupRepelStrength: number;

    public orientation: DirectionType;

    public tiers: GraphTiers;

    public group: string;

    constructor(builder: SpringLayoutBuilder) {
        super(builder);
        this.collisionForce = builder._collisionForce;
        this.linkForce = builder._linkForce;
        this.gravity = builder._gravity;
        this.warmupTicks = builder._warmupTicks;
        this.tierSeparation = builder._tierSeparation;
        this.groupRepelStrength = builder._groupRepelStrength;
        this.orientation = builder.orientation;
        this.tiers = builder.tiers;
        this.group = builder.group;
    }

    static get Builder(): SpringLayoutBuilder {
        return new SpringLayoutBuilder();
    }

    async applyLayout(graph: SimulationGraph, forceUpdate?: (layout: LayoutMapping<XYPosition>, edgePoints?: LayoutMapping<XYPosition[]>) => void): Promise<{ edgePoints?: LayoutMapping<XYPosition[]>; layout: LayoutMapping<XYPosition>; onAddEdge?: () => void | Promise<void>; onAddNode?: () => void | Promise<void>; onCleanup?: () => void | Promise<void>; onEndDrag?: () => void | Promise<void>; onMove?: (nodeId: string, x: number, y: number) => void | Promise<void>; onStartDrag?: () => void | Promise<void>; }> {
        const result = await super.applyLayout(graph, forceUpdate);

        return {
            layout: result.layout,
            edgePoints: result.edgePoints,
            // callbacks are not serializable so we go to the worker again explicitly
            onCleanup: () => this.runWorkerCallback('onCleanup'),
            onEndDrag: () => this.runWorkerCallback('onEndDrag'),
            onStartDrag: () => this.runWorkerCallback('onStartDrag'),
            onMove: (nodeId: string, x: number, y: number) => this.runWorkerCallback('onMove', nodeId, x, y),
        };
    }

    toLayoutParams(): SpringLayoutParams {
        return {
            ...super.toLayoutParams(),
            collisionForce: this.collisionForce,
            gravity: this.gravity,
            linkForce: this.linkForce,
            warmupTicks: this.warmupTicks,
            tierSeparation: this.tierSeparation,
            groupRepelStrength: this.groupRepelStrength,
            orientation: this.orientation,
            tiers: this.tiers,
            group: this.group,
        };
    }
}
