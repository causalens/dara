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

/* eslint-disable class-methods-use-this */
import { LayoutMapping, XYPosition } from 'graphology-layout/utils';

import { SimulationGraph } from '../../types';
import { GraphLayout, GraphLayoutBuilder } from './common';

class CustomLayoutBuilder extends GraphLayoutBuilder<CustomLayout> {
    build(): CustomLayout {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        return new CustomLayout(this);
    }
}

/**
 * Custom layout.
 *
 * Currently does nothing, and passes back the current positions of nodes.
 */
export default class CustomLayout extends GraphLayout {
    applyLayout(graph: SimulationGraph): Promise<{
        layout: LayoutMapping<XYPosition>;
    }> {
        // TODO: in the future this could call a callback passed into the layout to compute a custom layout
        const layout = graph.reduceNodes((acc, node, attrs) => {
            acc[node] = {
                x: attrs['meta.rendering_properties.x'],
                y: attrs['meta.rendering_properties.y'],
            };

            return acc;
        }, {} as LayoutMapping<XYPosition>);

        return Promise.resolve({ layout });
    }

    static get Builder(): CustomLayoutBuilder {
        return new CustomLayoutBuilder();
    }
}
