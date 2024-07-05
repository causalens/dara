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

import { FcoseLayout } from '../../shared/graph-layout';
import { CausalGraph, EdgeType, EditorMode, VariableType } from '../../types';
import { default as CausalGraphViewerComponent } from '../causal-graph-editor';
import { Template, pagCausalGraph } from './stories-utils';

export default {
    component: CausalGraphViewerComponent,
    title: 'CausalGraphEditor/GraphEditor/EditorMode',
} as Meta;

export const Pag = Template.bind({});
Pag.args = {
    editable: true,
    graphData: pagCausalGraph,
    graphLayout: FcoseLayout.Builder.build(),
};

const resolverGraph: CausalGraph = {
    edges: {
        input1: {
            input4: {
                edge_type: EdgeType.BIDIRECTED_EDGE,
                meta: {
                    rendering_properties: {
                        accepted: false,
                        description:
                            'my super long description text that spans a few lines, is super descriptive and goes in depth into the explanation of why this edge exists in the first place and this is some extra text that will be behind a scrollbar',
                        forced: false,

                        tooltip: {
                            key1: 'some value 1',
                            key2: 'some value 2',
                        },
                    },
                },
            },
            target: {
                edge_type: EdgeType.UNKNOWN_DIRECTED_EDGE,
                meta: {
                    rendering_properties: {
                        accepted: false,
                        forced: false,
                    },
                },
            },
        },
        input2: {
            target: {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: { rendering_properties: { accepted: false, forced: false } },
            },
        },
        input3: {
            target: {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: { rendering_properties: { accepted: false, forced: true } },
            },
        },
        input4: {
            target: {
                edge_type: EdgeType.DIRECTED_EDGE,
                meta: { rendering_properties: { accepted: false, forced: true } },
            },
        },
    },
    nodes: {
        input1: {
            meta: {
                rendering_properties: {
                    label: 'input1 renamed',
                },
            },
            variable_type: VariableType.UNSPECIFIED,
        },
        input2: {
            meta: {},
            variable_type: VariableType.UNSPECIFIED,
        },
        input3: {
            meta: {},
            variable_type: VariableType.UNSPECIFIED,
        },
        input4: {
            meta: {},
            variable_type: VariableType.UNSPECIFIED,
        },
        target: {
            meta: {},
            variable_type: VariableType.UNSPECIFIED,
        },
    },
};

export const Resolver = Template.bind({});
Resolver.args = {
    editable: true,
    editorMode: EditorMode.RESOLVER,
    graphData: resolverGraph,
    graphLayout: FcoseLayout.Builder.build(),
};
