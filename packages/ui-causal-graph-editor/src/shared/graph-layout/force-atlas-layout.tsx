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
import { random } from 'graphology-layout';
import forceAtlas from 'graphology-layout-forceatlas2';
import noverlap from 'graphology-layout-noverlap';
import { LayoutMapping, XYPosition } from 'graphology-layout/utils';

import { SimulationGraph } from '../../types';
import { GraphLayout, GraphLayoutBuilder } from './common';

class ForceAtlasLayoutBuilder extends GraphLayoutBuilder<ForceAtlasLayout> {
    _barnesHutOptimize = false;

    _edgeWeightInfluence = 1;

    _gravity = 0.2;

    _iterations = 10_000;

    _linLogMode = true;

    _outboundAttractionDistribution = true;

    _scalingRatio = 8;

    _strongGravityMode = false;

    /**
     * Toggle Barnes-Hut optimization
     *
     * @param optimize whether to enable the optimization
     */
    barnesHutOptimize(optimize: boolean): this {
        this._barnesHutOptimize = optimize;
        return this;
    }

    /**
     * Set the influence of the edge’s weights on the layout
     *
     * @param influence influence parameter
     */
    edgeWeightInfluence(influence: number): this {
        this._edgeWeightInfluence = influence;
        return this;
    }

    /**
     * Set the gravity parameter
     *
     * @param grav gravity param
     */
    gravity(grav: number): this {
        this._gravity = grav;
        return this;
    }

    /**
     * Set the number of iterations to run at once
     *
     * @param iters number of iters to run
     */
    iterations(iters: number): this {
        this._iterations = iters;
        return this;
    }

    /**
     * Toggle linLog mode
     *
     * @param linLog whether to enable linLog mode
     */
    linLogMode(linLog: boolean): this {
        this._linLogMode = linLog;
        return this;
    }

    /**
     * Toggle outboundAttractionDistribution mode
     *
     * @param attractionDistribution whether to enable attraction distribution mode
     */
    outboundAttractionDistribution(attractionDistribution: boolean): this {
        this._outboundAttractionDistribution = attractionDistribution;
        return this;
    }

    /**
     * Set the scaling ratio
     *
     * @param ratio new scaling ratio
     */
    scalingRatio(ratio: number): this {
        this._scalingRatio = ratio;
        return this;
    }

    /**
     * Toggle strong gravity mode
     *
     * @param enableStrongGravity whether to enable the strong gravity mode
     */
    strongGravityMode(enableStrongGravity: boolean): this {
        this._strongGravityMode = enableStrongGravity;
        return this;
    }

    build(): ForceAtlasLayout {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        return new ForceAtlasLayout(this);
    }
}

export default class ForceAtlasLayout extends GraphLayout {
    public barnesHutOptimize: boolean;

    public edgeWeightInfluence: number;

    public gravity: number;

    public iterations: number;

    public linLogMode: boolean;

    public outboundAttractionDistribution: boolean;

    public scalingRatio: number;

    public strongGravityMode: boolean;

    constructor(builder: ForceAtlasLayoutBuilder) {
        super(builder);
        this.barnesHutOptimize = builder._barnesHutOptimize;
        this.edgeWeightInfluence = builder._edgeWeightInfluence;
        this.gravity = builder._gravity;
        this.iterations = builder._iterations;
        this.linLogMode = builder._linLogMode;
        this.outboundAttractionDistribution = builder._outboundAttractionDistribution;
        this.scalingRatio = builder._scalingRatio;
        this.strongGravityMode = builder._strongGravityMode;
    }

    applyLayout(graph: SimulationGraph): Promise<{
        layout: LayoutMapping<XYPosition>;
    }> {
        if (graph.nodes().length === 0) {
            return Promise.resolve({ layout: {} });
        }

        const firstNodeAttrs = graph.getNodeAttributes(graph.nodes()[0]);
        const graphClone = graph.copy();
        const size = graphClone.getAttribute('size');

        // If x is not set yet on nodes
        if (!firstNodeAttrs.x) {
            // Create a random layout
            const randomMapping = random(graph, { center: 1000, scale: 2000 });
            graphClone.updateEachNodeAttributes((n, attrs) => ({
                ...attrs,
                ...randomMapping[n],
            }));

            // Fix overlaps with noverlap so the force simulation has to do less iterations
            const noverlapMapping = noverlap(graphClone, {
                maxIterations: 100,
                settings: {
                    margin: size,
                },
            });
            graphClone.updateEachNodeAttributes((n, attrs) => ({
                ...attrs,
                ...noverlapMapping[n],
            }));
        }

        // add size attribute
        graphClone.updateEachNodeAttributes((n, attrs) => ({
            ...attrs,
            size,
        }));

        const newLayout = forceAtlas(graphClone, {
            getEdgeWeight: 1,
            iterations: this.iterations,
            settings: {
                adjustSizes: true,
                barnesHutOptimize: this.barnesHutOptimize,
                edgeWeightInfluence: this.edgeWeightInfluence,
                gravity: this.gravity,
                linLogMode: this.linLogMode,
                outboundAttractionDistribution: this.outboundAttractionDistribution,
                scalingRatio: this.scalingRatio,
                slowDown: 5,
                strongGravityMode: this.strongGravityMode,
            },
        });

        return Promise.resolve({ layout: newLayout });
    }

    static get Builder(): ForceAtlasLayoutBuilder {
        return new ForceAtlasLayoutBuilder();
    }
}
