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
import deepCopy from 'lodash/cloneDeep';
import set from 'lodash/set';

import { SHIPPED_UNITS } from '../../../tests/mocks/graphs';
import { CustomLayout } from '../../shared/graph-layout';
import { default as CausalGraphViewerComponent } from '../causal-graph-editor';
import { Template } from './stories-utils';

export default {
    component: CausalGraphViewerComponent,
    title: 'CausalGraphEditor/GraphEditor/CustomLayout',
} as Meta;

const PredefinedGraph = deepCopy(SHIPPED_UNITS);
// layout stored inline, as layouts are async and we can't run async on top-level in storybook yet
const predefinedLayout = {
    layout: {
        'amg click throughs': {
            x: 1664,
            y: 0,
        },
        'amg cost calc combined': {
            x: 1615.6471841969505,
            y: 398.22126537449606,
        },
        'amg impr combined': {
            x: 1473.3988266869412,
            y: 773.2993582808308,
        },
        'ams ams clicks': {
            x: 1245.5218849567123,
            y: 1103.4361033126831,
        },
        'ams ams spend': {
            x: 945.2597385606434,
            y: 1369.4451528470443,
        },
        'ams sumimpressions': {
            x: 590.0625320387792,
            y: 1555.8670278285304,
        },
        'ara rev shipped units acfu,7': {
            x: 200.57303594485748,
            y: 1651.8675664991617,
        },
        'ara traffic glance views': {
            x: -200.57303594485728,
            y: 1651.8675664991617,
        },
        'ara traffic in stock %': {
            x: -590.062532038779,
            y: 1555.8670278285304,
        },
        'ara traffic out of stock views': {
            x: -945.2597385606431,
            y: 1369.4451528470443,
        },
        'ara traffic prime shipping views': {
            x: -1245.5218849567125,
            y: 1103.4361033126831,
        },
        'fb combined click': {
            x: -1473.3988266869408,
            y: 773.2993582808317,
        },
        'fb combined impressions': {
            x: -1615.6471841969505,
            y: 398.221265374496,
        },
        'fb combined spend': {
            x: -1664,
            y: -5.351832178123847e-13,
        },
        'neo org branded clicks': {
            x: -1615.6471841969508,
            y: -398.22126537449554,
        },
        'neo org branded impressions': {
            x: -1473.3988266869417,
            y: -773.29935828083,
        },
        'neo org unbranded clicks': {
            x: -1245.5218849567125,
            y: -1103.436103312683,
        },
        'neo org unbranded impressions': {
            x: -945.2597385606434,
            y: -1369.4451528470443,
        },
        'neo paid clicks search': {
            x: -590.0625320387798,
            y: -1555.8670278285301,
        },
        'neo paid impressions search': {
            x: -200.57303594485842,
            y: -1651.8675664991617,
        },
        'neo paid neo ps cost': {
            x: 200.5730359448578,
            y: -1651.8675664991617,
        },
        'rnr avg star rating': {
            x: 590.0625320387792,
            y: -1555.8670278285304,
        },
        'rnr total number of reviews': {
            x: 945.2597385606416,
            y: -1369.4451528470454,
        },
        'sos org org wtd impressions': {
            x: 1245.5218849567116,
            y: -1103.4361033126838,
        },
        'sos org sos org avg rank': {
            x: 1473.3988266869414,
            y: -773.2993582808306,
        },
        'sos paid pd wtd impressions': {
            x: 1615.6471841969505,
            y: -398.22126537449617,
        },
    },
};
Object.entries(predefinedLayout.layout).forEach(([nodeKey, position]) => {
    set(PredefinedGraph.nodes[nodeKey], 'meta.rendering_properties.x', position.x);
    set(PredefinedGraph.nodes[nodeKey], 'meta.rendering_properties.y', position.y);
});

export const CustomPositions = Template.bind({});
CustomPositions.args = {
    editable: true,
    graphData: PredefinedGraph,
    graphLayout: CustomLayout.Builder.build(),
};

// User provided custom layout but no initial positions -> falls back to default
export const CustomLayoutNoPositions = Template.bind({});
CustomLayoutNoPositions.args = {
    editable: true,
    graphData: SHIPPED_UNITS,
    graphLayout: CustomLayout.Builder.build(),
};
