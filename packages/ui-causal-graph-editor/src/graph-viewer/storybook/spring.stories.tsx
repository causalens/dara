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

import { FRAUD } from '../../../tests/mocks/graphs';
import { SpringLayout } from '../../shared/graph-layout';
import { default as CausalGraphViewerComponent } from '../causal-graph-editor';
import { Template, causalGraph, nodeTiersCausalGraph, nodeTiersList } from './stories-utils';

export default {
    component: CausalGraphViewerComponent,
    title: 'CausalGraphEditor/GraphEditor/Spring',
} as Meta;

export const Spring = Template.bind({});
Spring.args = {
    editable: true,
    graphData: causalGraph,
    graphLayout: SpringLayout.Builder.build(),
};

export const SpringTiersArray = Template.bind({});
const springArrayLayout = SpringLayout.Builder.build();
springArrayLayout.tiers = nodeTiersList;

SpringTiersArray.args = {
    editable: true,
    graphData: nodeTiersCausalGraph,
    graphLayout: springArrayLayout,
};

export const SpringTiers = Template.bind({});
const springLayout = SpringLayout.Builder.build();
springLayout.tiers = { group: 'meta.group', order_nodes_by: 'meta.order', rank: ['a', 'b', 'c', 'd', 'e'] };
springLayout.tierSeparation = 300;

SpringTiers.args = {
    editable: true,
    graphData: FRAUD,
    graphLayout: springLayout,
};

export const SpringGroupingLarge = Template.bind({});

const groupingLayoutLarge = SpringLayout.Builder.build();
groupingLayoutLarge.group = 'meta.group';

SpringGroupingLarge.args = {
    graphData: FRAUD,
    graphLayout: groupingLayoutLarge,
    editable: true,
};

export const SpringGroupingSmall = Template.bind({});

const groupingLayout = SpringLayout.Builder.build();
groupingLayout.group = 'meta.test';

SpringGroupingSmall.args = {
    graphData: nodeTiersCausalGraph,
    graphLayout: groupingLayout,
    editable: true,
};
