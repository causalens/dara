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
import type { Meta, StoryObj } from '@storybook/react-vite';
import * as React from 'react';

import { type Item } from '../types';
import { default as ComboBoxComponent, type ComboBoxProps } from './combo-box';

const meta: Meta<ComboBoxProps> = {
    title: 'UI Components/Combo Box',
    component: ComboBoxComponent,
    decorators: [
        (Story) => (
            <div style={{ width: '12.5em' }}>
                <Story />
            </div>
        ),
    ],
};

export default meta;
type Story = StoryObj<ComboBoxProps>;

const simpleItems: Item[] = [
    {
        label: 'First',
        value: 1,
    },
    {
        label: 'Long Label',
        value: 2,
    },
    {
        label: 'Third Chip',
        value: 3,
    },
    {
        label: 'What if the label is too longs',
        value: 4,
    },
    {
        label: 'Fifth',
        value: 5,
    },
    {
        label: 'Sixth',
        value: 6,
    },
    {
        label: 'Seventh',
        value: 7,
    },
];

export const ComboBox: Story = {
    args: {
        items: simpleItems,
        placeholder: 'Select an item',
        size: 1,
    },
};

export const ControlledComboBox: Story = {
    render: (props) => {
        const [selectedItem, setSelectedItem] = React.useState<Item | undefined>(props.selectedItem);

        return <ComboBoxComponent {...props} onSelect={(item) => setSelectedItem(item)} selectedItem={selectedItem} />;
    },
    args: {
        items: simpleItems,
        placeholder: 'Select an item',
        selectedItem: simpleItems[6],
    },
};
