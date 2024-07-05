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
import { useState } from 'react';

import { default as NodeHierarchyBuilderComponent, NodeHierarchyBuilderProps } from './node-hierarchy-builder';

export default {
    component: NodeHierarchyBuilderComponent,
    title: 'CausalGraphEditor/Node Hierarchy Builder',
} as Meta;

const Template = (args: NodeHierarchyBuilderProps<any>): JSX.Element => <NodeHierarchyBuilderComponent {...args} />;

export const BaseScenario = Template.bind({});
BaseScenario.args = {
    nodes: [
        ['first long node', 'second'],
        ['third', 'fourth', 'fifth'],
        ['sixth', 'seventh', 'eighth', 'ninth'],
    ],
};

export const MetaScenario = Template.bind({});
MetaScenario.args = {
    nodeFontSize: 10,
    nodeSize: 80,
    nodes: [
        [
            { meta: { wrap_text: false }, name: 'node with no wrap' },
            { meta: { label: 'alternate label' }, name: 'second' },
        ],
        [
            { name: 'superlongwordwithnospaces' },
            { meta: { label_size: 8 }, name: 'small font' },
            { meta: { label_size: 16 }, name: 'large' },
            {
                meta: { label: 'alternate label', tooltip: 'here is a tooltip string' },
                name: 'tooltip string',
            },
            {
                meta: {
                    label: 'alternate label',
                    tooltip: {
                        key1: 'val1',
                        key2: 'val2',
                    },
                },
                name: 'tooltip object',
            },
        ],
        [{ name: 'sixth' }, { name: 'seventh' }, { name: 'eighth' }, { name: 'ninth' }],
    ],
    wrapNodeText: true,
};

function generateLayers(layers = 40): Array<string[]> {
    const nodes = [];
    let counter = 0;

    for (let i = 1; i <= layers; i++) {
        const layer = [];

        for (let j = 0; j < i; j++) {
            layer.push(counter);
            counter++;
        }

        nodes.push(layer);
    }

    return nodes;
}

export const LargeNodeNumber = Template.bind({});
LargeNodeNumber.args = {
    nodes: generateLayers(),
};

export const Scrollable = Template.bind({});
Scrollable.args = {
    nodes: Array.from({ length: 30 }, (_, i) => [`node ${i}`]),
};

export const Controlled = (args: NodeHierarchyBuilderProps<any>): JSX.Element => {
    const [nodes, setNodes] = useState(args.nodes);

    return <NodeHierarchyBuilderComponent {...args} nodes={nodes} onUpdate={setNodes} />;
};

Controlled.args = {
    nodes: Array.from({ length: 30 }, (_, i) => [`node ${i}`]),
};
