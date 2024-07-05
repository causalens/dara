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
import { ForceAtlasLayout } from '../../shared/graph-layout';
import { default as CausalGraphViewerComponent } from '../causal-graph-editor';
import { Template } from './stories-utils';

export default {
    component: CausalGraphViewerComponent,
    title: 'CausalGraphEditor/GraphEditor/ForceAtlas',
} as Meta;

export const ForceAtlas = Template.bind({});
ForceAtlas.args = {
    editable: true,
    graphData: FRAUD,
    graphLayout: ForceAtlasLayout.Builder.build(),
};
