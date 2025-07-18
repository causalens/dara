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

import { default as TextAreaComponent, type TextAreaProps } from './textarea';

const meta: Meta<TextAreaProps> = {
    component: TextAreaComponent,
    title: 'UI Components/Textarea',
};

export default meta;
type Story = StoryObj<TextAreaProps>;

export const Textarea: Story = {
    args: {
        resize: 'horizontal',
        style: { height: '50%', width: '300px' },
    },
};
