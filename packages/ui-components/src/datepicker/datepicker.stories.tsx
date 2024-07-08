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
import { useState } from 'react';

import { Item } from '../types';
import { DatePickerProps, default as DatepickerComponent } from './datepicker';
import { default as DatepickerSelectComponent, SelectProps } from './datepicker-select';

export default {
    component: DatepickerComponent,
    title: 'UI Components/Datepicker',
} as Meta;

export const PlainDatepicker = (args: DatePickerProps): JSX.Element => <DatepickerComponent {...args} />;
PlainDatepicker.args = {
    initialValue: new Date(),
    shouldCloseOnSelect: false,
};

export const DateConstraintDatepicker = (args: DatePickerProps): JSX.Element => <DatepickerComponent {...args} />;
DateConstraintDatepicker.args = {
    maxDate: new Date('1995-12-19T00:00:00'),
    minDate: new Date('1995-12-17T00:00:00'),
    shouldCloseOnSelect: false,
};

export const DatepickerWithTime = (args: DatePickerProps): JSX.Element => <DatepickerComponent {...args} />;
DatepickerWithTime.args = { shouldCloseOnSelect: false, showTimeInput: true };

export const DatepickerWithRange = (args: DatePickerProps): JSX.Element => <DatepickerComponent {...args} />;
DatepickerWithRange.args = {
    initialValue: [new Date('2024-01-17T03:24:00'), new Date()],
    selectsRange: true,
    shouldCloseOnSelect: false,
};

export const DatepickerWithTimeAndRange = (args: DatePickerProps): JSX.Element => <DatepickerComponent {...args} />;
DatepickerWithTimeAndRange.args = {
    selectsRange: true,
    shouldCloseOnSelect: false,
    showTimeInput: true,
};

const yearItems: Item[] = [
    {
        label: '2016',
        value: 2016,
    },
    {
        label: '2017',
        value: 2017,
    },
    {
        label: '2018',
        value: 2018,
    },
    {
        label: '2019',
        value: 2019,
    },
    {
        label: '2020',
        value: 2020,
    },
    {
        label: '2021',
        value: 2021,
    },
    {
        label: '2022',
        value: 2022,
    },
    {
        label: '2023',

        value: 2023,
    },
    {
        label: '2024',
        value: 2024,
    },
    {
        label: '2025',
        value: 2025,
    },
];
export const DatepickerSelect = (args: SelectProps): JSX.Element => {
    const [selectedItem, setSelectedItem] = useState<Item>(args.selectedItem);

    return <DatepickerSelectComponent {...args} onSelect={(e) => setSelectedItem(e)} selectedItem={selectedItem} />;
};
DatepickerSelect.args = {
    items: yearItems,
    selectedItem: yearItems[7],
};

export const ControlledRangeDatetime = (args: DatePickerProps): JSX.Element => {
    const [value, setValue] = useState<[Date, Date]>([new Date(), new Date()]);
    return (
        <div>
            <h3>Raw controlled value</h3>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span>Start: {value[0]?.toISOString()}</span>
                <span>End: {value[1]?.toISOString()}</span>
            </div>
            <h3>Component</h3>
            <DatepickerComponent
                {...args}
                onChange={(e) => {
                    setValue(e);
                }}
                value={value}
            />
            <div>
                <button onClick={() => setValue([new Date(), new Date()])} type="button">
                    Reset
                </button>
            </div>
        </div>
    );
};
ControlledRangeDatetime.args = {
    selectsRange: true,
    shouldCloseOnSelect: false,
    showTimeInput: true,
};
