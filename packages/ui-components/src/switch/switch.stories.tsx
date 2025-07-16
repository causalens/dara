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

import { Cow, Hippo } from '@darajs/ui-icons';

import { default as SwitchComponent, type SwitchProps } from './switch';

const meta: Meta<SwitchProps> = {
    component: SwitchComponent,
    title: 'UI Components/Switch',
};

export default meta;
type Story = StoryObj<SwitchProps>;

export const TextLabelsScenario: Story = {
    // test containing text
    args: { initialValue: true, labels: { off: 'OFF', on: 'ON' } },
};

export const IconLabelsScenario: Story = {
    // test containing icons
    args: { initialValue: true, labels: { off: <Hippo />, on: <Cow size="lg" /> } },
};

export const LightDarkScenario: Story = {
    // test containing icons
    args: { initialValue: true, lightDark: true },
};
