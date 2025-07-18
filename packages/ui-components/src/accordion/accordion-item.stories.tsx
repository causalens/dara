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

import { default as AccordionItem, type AccordionItemProps } from './accordion-item';

const meta: Meta<AccordionItemProps> = {
    title: 'UI Components/AccordionItem',
    component: AccordionItem,
    parameters: {
        layout: 'fullscreen',
    },
};

export default meta;
type Story = StoryObj<AccordionItemProps>;

export const Default: Story = {
    args: {
        item: {
            content:
                'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer metus turpis, auctor sed posuere id, dignissim ac augue. Nam tincidunt a odio quis consectetur. Etiam molestie nulla lectus, at volutpat nisi malesuada eget. Nullam eu velit vitae augue pellentesque scelerisque at a massa. Quisque sollicitudin tellus vel fermentum pulvinar. ',
            label: 'Item Header',
        },
        open: true,
    },
};
