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
import { Meta } from '@storybook/react';

import { MarketingLayout } from '../../shared/graph-layout';
import { default as CausalGraphViewerComponent } from '../causal-graph-editor';
import { Template, causalGraph, nodeTiersCausalGraph, nodeTiersList } from './stories-utils';

export default {
    component: CausalGraphViewerComponent,
    title: 'CausalGraphEditor/GraphEditor/Marketing',
} as Meta;

export const MarketingBottom = Template.bind({});
MarketingBottom.args = {
    additionalLegends: [
        {
            label: 'test arrow',
            type: 'edge',
        },
        {
            type: 'spacer',
        },
        {
            label: 'test node',
            type: 'node',
        },
        {
            label: 'another node',
            symbol: {
                color: 'red',
                highlight_color: 'green',
            },
            type: 'node',
        },
    ],
    editable: true,
    graphData: causalGraph,
    graphLayout: MarketingLayout.Builder.build(),
    zoomThresholds: {
        edge: 0.5,
        label: 0.5,
        shadow: 0.5,
        symbol: 0.5,
    },
};

export const MarketingCenter = Template.bind({});
MarketingCenter.args = {
    editable: true,
    graphData: causalGraph,
    graphLayout: MarketingLayout.Builder.targetLocation('center').build(),
};

export const MarketingTiers = Template.bind({});
const marketingLayout = MarketingLayout.Builder.build();
marketingLayout.tiers = nodeTiersList;

MarketingTiers.args = {
    editable: true,
    graphData: nodeTiersCausalGraph,
    graphLayout: marketingLayout,
};
