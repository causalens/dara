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

import { default as MultiSelectComponent, MultiSelectProps } from './multiselect';

export default {
    component: MultiSelectComponent,
    title: 'UI Components/Multi Select',
} as Meta;

const sampleItems = [
    {
        label: 'this is an extremely long label that may overflow',
        value: 'value 1',
    },
    {
        label: 'label 2',
        value: 'value 2',
    },
    {
        label: 'label 3',
        value: 'value 3',
    },
    {
        label: 'label 4',
        value: 'value 4',
    },
    {
        label: 'label 5',
        value: 'value 5',
    },
    {
        label: 'label 6',
        value: 'value 6',
    },
    {
        label: 'label 7',
        value: 'value 7',
    },
    {
        label: 'label 8',
        value: 'value 8',
    },
    {
        label: 'label 9',
        value: 'value 9',
    },
    {
        label: 'label 10',
        value: 'value 10',
    },
];

export const MultiSelect = (args: MultiSelectProps): JSX.Element => <MultiSelectComponent {...args} />;

MultiSelect.args = {
    items: sampleItems,
    maxRows: 3,
    maxWidth: '20rem',
    onTermChange: undefined,
    size: 1,
} as MultiSelectProps;
