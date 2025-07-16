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

import { type Item } from '../types';
import { default as CheckboxComponent, type CheckboxProps } from './checkbox';
import { default as CheckboxGroupComponent, type CheckboxGroupProps } from './checkbox-group';
import {
    default as TriStateCheckboxComponent,
    type CheckboxProps as TriStateCheckboxProps,
} from './tri-state-checkbox';

const meta: Meta<CheckboxProps> = {
    title: 'UI Components/Checkbox',
    component: CheckboxComponent,
};

export default meta;
type Story = StoryObj<CheckboxProps>;
type TriStateStory = StoryObj<TriStateCheckboxProps>;
type GroupStory = StoryObj<CheckboxGroupProps>;

export const Checkbox: Story = {
    args: {
        initialValue: true,
        label: 'Test',
    },
};

export const ListCheckbox: Story = {
    args: {
        isListStyle: true,
        label: 'Test',
        selected: false,
    },
};

const simpleItems: Item[] = [
    {
        label: 'One',
        value: 1,
    },
    {
        label: 'Two',
        value: 2,
    },
    {
        label: 'Three',
        value: 3,
    },
    {
        label: 'Four',
        value: 4,
    },
    {
        label: 'Five',
        value: 5,
    },
];

const val: Item[] = [
    {
        label: 'Two',
        value: 2,
    },
];

export const TriStateCheckbox: TriStateStory = {
    render: (args) => <TriStateCheckboxComponent {...args} />,
    args: {
        allSelected: false,
        noneSelected: false,
    },
};

export const CheckboxGroup: GroupStory = {
    render: (args) => <CheckboxGroupComponent {...args} />,
    args: {
        items: simpleItems,
        selectMax: 4,
        selectMin: 2,
        values: val,
    },
};

export const ListCheckboxGroup: GroupStory = {
    render: (args) => <CheckboxGroupComponent {...args} />,
    args: {
        isListStyle: true,
        items: simpleItems,
        values: val,
    },
};
