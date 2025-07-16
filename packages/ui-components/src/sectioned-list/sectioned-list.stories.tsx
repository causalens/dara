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
import React from 'react';

import { type ListItem, default as SectionedListComponent, type SectionedListProps } from './sectioned-list';

const meta: Meta<SectionedListProps> = {
    title: 'UI Components/Sectioned List',
    component: SectionedListComponent,
    decorators: [
        (Story) => (
            <div style={{ width: '50%' }}>
                <Story />
            </div>
        ),
    ],
};

export default meta;
type Story = StoryObj<SectionedListProps>;

export const SectionedList: Story = {
    args: {},
};

const sampleListItems = (header: string): Array<ListItem> => [
    {
        heading: false,
        label: `${header} item 1`,
        value: `${header} value 1`,
    },
    {
        heading: false,
        label: `${header} item 2`,
        value: `${header} value 2`,
    },
    {
        heading: false,
        label: `${header} item 3`,
        value: `${header} value 3`,
    },
];

const sampleListSections = [
    { items: sampleListItems('1'), label: 'Section 1' },
    { items: sampleListItems('2'), label: 'Section 2' },
    { items: sampleListItems('3'), label: 'Section 3' },
];

SectionedList.args = {
    items: sampleListSections,
};
