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

import { default as ComponentSelectListComponent, type ComponentSelectListProps } from './component-select-list';

const meta: Meta<ComponentSelectListProps> = {
    title: 'UI Components/ComponentSelectList',
    component: ComponentSelectListComponent,
};

export default meta;
type Story = StoryObj<ComponentSelectListProps>;

const exampleItems = [
    { component: <div>Test A</div>, subtitle: 'Subtitle', title: 'Title for A' },
    { component: <div>Test B</div>, subtitle: 'Subtitle', title: 'Title for B' },
    { component: <div>Test C</div>, subtitle: 'Subtitle', title: 'Title for C' },
];

export const ComponentSelectList: Story = {
    args: {
        items: exampleItems,
    },
};
