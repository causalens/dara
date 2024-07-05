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
import { circular } from 'graphology-layout';
import { LayoutMapping, XYPosition } from 'graphology-layout/utils';

import { SimulationGraph } from '../../types';
import { GraphLayout, GraphLayoutBuilder } from './common';

class CircularLayoutBuilder extends GraphLayoutBuilder<CircularLayout> {
    build(): CircularLayout {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        return new CircularLayout(this);
    }
}

/**
 * Circular layout positions nodes on a circle.
 * The circle's radius scales with the size and number of nodes so that they don't collide.
 */
export default class CircularLayout extends GraphLayout {
    applyLayout(graph: SimulationGraph): Promise<{
        layout: LayoutMapping<XYPosition>;
    }> {
        const layout = circular(graph, { scale: graph.order * this.nodeSize }) as LayoutMapping<XYPosition>;

        return Promise.resolve({ layout });
    }

    static get Builder(): CircularLayoutBuilder {
        return new CircularLayoutBuilder();
    }
}
