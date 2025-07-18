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

import { default as SpinnerComponent, type SpinnerProps } from './spinner';

const meta: Meta<SpinnerProps> = {
    component: SpinnerComponent,
    title: 'UI Components/Spinner',
};

export default meta;
type Story = StoryObj<SpinnerProps>;

export const Spinner: Story = {
    args: { size: '1rem' },
    render: (args: SpinnerProps): JSX.Element => (
        <div style={{ height: '100%', width: '100%' }}>
            <SpinnerComponent {...args} />
        </div>
    ),
};

export const SpinnerWithText: Story = {
    args: { showText: true },
    render: (args: SpinnerProps): JSX.Element => (
        <div style={{ height: '100%', width: '100%' }}>
            <SpinnerComponent {...args} />
        </div>
    ),
};
