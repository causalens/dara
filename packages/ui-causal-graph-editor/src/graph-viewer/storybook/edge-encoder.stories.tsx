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

import { SpringLayout } from '../../shared/graph-layout';
import { EdgeConstraintType, EditorMode } from '../../types';
import { default as CausalGraphViewerComponent } from '../causal-graph-editor';
import { Template } from './stories-utils';

export default {
    component: CausalGraphViewerComponent,
    title: 'CausalGraphEditor/GraphEditor/VisualEdgeEncoder',
} as Meta;

export const VisualEdgeEncoder = Template.bind({});

VisualEdgeEncoder.args = {
    editable: true,
    editorMode: EditorMode.EDGE_ENCODER,
    graphData: {
        edges: {
            'first node': {
                'second node': {},
            },
        },
        nodes: {
            'first node': {},
            'second node': {},
            'third node': {},
        },
    },
    graphLayout: SpringLayout.Builder.build(),
    initialConstraints: [
        {
            source: 'first node',
            target: 'second node',
            type: EdgeConstraintType.HARD_DIRECTED,
        },
    ],
};
