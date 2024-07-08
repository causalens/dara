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
import { default as CheckboxComponent, CheckboxProps } from './checkbox';
import { default as CheckboxGroupComponent, CheckboxGroupProps } from './checkbox-group';
import { default as TriStateCheckboxComponent, CheckboxProps as TriStateCheckboxProps } from './tri-state-checkbox';

export default {
    component: CheckboxComponent,
    title: 'UI Components/Checkbox',
} as Meta;

export const Checkbox = (props: CheckboxProps): JSX.Element => <CheckboxComponent {...props} />;
Checkbox.args = {
    intialValue: true,
    label: 'Test',
};

export const ListCheckbox = (props: CheckboxProps): JSX.Element => <CheckboxComponent {...props} />;
ListCheckbox.args = {
    isListStyle: true,
    label: 'Test',
    selected: false,
};

export const TriStateCheckbox = (props: TriStateCheckboxProps): JSX.Element => <TriStateCheckboxComponent {...props} />;
TriStateCheckbox.args = {
    allSelected: false,
    noneSelected: false,
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

export const CheckboxGroup = (props: CheckboxGroupProps): JSX.Element => <CheckboxGroupComponent {...props} />;
CheckboxGroup.args = {
    items: simpleItems,
    selectMax: 4,
    selectMin: 2,
    values: val,
};

export const ListCheckboxGroup = (props: CheckboxGroupProps): JSX.Element => <CheckboxGroupComponent {...props} />;
ListCheckboxGroup.args = {
    isListStyle: true,
    items: simpleItems,
    values: val,
};
