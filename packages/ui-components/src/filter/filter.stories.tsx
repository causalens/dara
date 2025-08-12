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
import type { Meta } from '@storybook/react-vite';
import React from 'react';

import type { Item } from '../types';
import { default as CategoricalFilterComponent, type CategoricalFilterProps } from './categorical-filter';
import { default as DatetimeFilterComponent, type DatetimeFilterProps } from './datetime-filter';
import { default as NumericFilterComponent, type NumericFilterProps } from './numeric-filter';

const meta: Meta<CategoricalFilterProps> = {
    title: 'UI Components/Filters',
    component: CategoricalFilterComponent,
};

export default meta;

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

export const CategoricalFilter = (props: CategoricalFilterProps): JSX.Element => (
    <CategoricalFilterComponent {...props} />
);
CategoricalFilter.args = {
    items: simpleItems,
};

export const NumericFilter = (props: NumericFilterProps): JSX.Element => <NumericFilterComponent {...props} />;

export const DatetimeFilter = (props: DatetimeFilterProps): JSX.Element => <DatetimeFilterComponent {...props} />;
DatetimeFilter.args = {
    showTimeInput: true,
};
