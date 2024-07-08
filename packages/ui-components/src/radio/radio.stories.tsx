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
import { default as RadioComponent, RadioGroupProps } from './radio-group';

export default {
    component: RadioComponent,
    title: 'UI Components/Radio Group',
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

export const RadioGroup = (props: RadioGroupProps): JSX.Element => <RadioComponent {...props} />;
RadioGroup.args = {
    initialValue: 1,
    items: simpleItems,
};

export const RadioGroupList = (props: RadioGroupProps): JSX.Element => <RadioComponent {...props} />;
RadioGroupList.args = {
    initialValue: 2,
    isListStyle: true,
    items: simpleItems,
};
