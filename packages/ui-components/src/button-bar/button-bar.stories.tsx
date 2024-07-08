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

import { Item } from '../types';
import { default as ButtonBarComponent, ButtonProps } from './button-bar';

export default {
    component: ButtonBarComponent,
    title: 'UI Components/Button Bar',
} as Meta;

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
];

export const ButtonBar = (args: ButtonProps): JSX.Element => <ButtonBarComponent {...args} />;
ButtonBar.args = {
    disabled: false,
    initialValue: {
        label: 'One',
        value: 1,
    },
    items: simpleItems,
};
