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
import { useRef } from 'react';

import { Props, default as TableComponent, TableHandle } from './table';

export default {
    component: TableComponent,
    title: 'UI Components/Table',
} as Meta;

// Sample data taken from react-table example
const sampleData = [
    {
        age: 4,
        dob: '1990-02-11T11:30:30',
        firstName:
            'hands lorem ipsum content that is far too long to ever fit on a row and it is definitely going to overflow so I want to see what happens',
        lastName: 'box',
        progress: 40,
        status: 'single',
        visits: 36,
    },
    {
        age: 21,
        dob: '1991-02-11T11:30:30',
        firstName: 'men',
        lastName: 'bun',
        progress: 79,
        status: 'relationship',
        visits: 14,
    },
    {
        age: 26,
        dob: '1992-02-11T11:30:30',
        firstName: 'whip',
        lastName: 'leaf',
        progress: 11,
        status: 'single',
        visits: 53,
    },
    {
        age: 20,
        dob: '1993-02-11T11:30:30',
        firstName: 'pain',
        lastName: 'coffee',
        progress: 15,
        status: 'single',
        visits: 7,
    },
    {
        age: 20,
        dob: '1994-02-11T11:30:30',
        firstName: 'ice',
        lastName: 'message',
        progress: 46,
        status: 'relationship',
        visits: 46,
    },
    {
        age: 12,
        dob: '1995-02-11T11:30:30',
        firstName: 'dinner',
        lastName: 'north',
        progress: 28,
        status: 'single',
        visits: 49,
    },
    {
        age: 9,
        dob: '1989-02-11T11:30:30',
        firstName: 'question',
        lastName: 'body',
        progress: 53,
        status: 'single',
        visits: 38,
    },
    {
        age: 19,
        dob: '1990-02-11T11:30:32',
        firstName: 'low',
        lastName: 'paper',
        progress: 54,
        status: 'relationship',
        visits: 39,
    },
    {
        age: 3,
        dob: '1990-02-11T11:30:30',
        firstName: 'street',
        lastName: 'pollution',
        progress: 7,
        status: 'complicated',
        visits: 1,
    },
    {
        age: 26,
        dob: '1990-02-10T11:30:30',
        firstName: 'difference',
        lastName: 'dinner',
        progress: 35,
        status: 'relationship',
        visits: 85,
    },
    {
        age: 27,
        dob: '1990-02-09T11:30:30',
        firstName: 'penalty',
        lastName: 'rub',
        progress: 21,
        status: 'single',
        visits: 4,
    },
    {
        age: 3,
        dob: '1990-02-12T11:30:30',
        firstName: 'light',
        lastName: 'temperature',
        progress: 83,
        status: 'single',
        visits: 22,
    },
    {
        age: 5,
        dob: '1990-02-11T12:30:30',
        firstName: 'bonus',
        lastName: 'mask',
        progress: 83,
        status: 'relationship',
        visits: 78,
    },
    {
        age: 14,
        dob: '1990-02-11T13:30:30',
        firstName: 'marble',
        lastName: 'crib',
        progress: 35,
        status: 'relationship',
        visits: 8,
    },
    {
        age: 0,
        dob: '1990-02-11T11:25:30',
        firstName: 'expansion',
        lastName: 'soup',
        progress: 39,
        status: 'relationship',
        visits: 74,
    },
    {
        age: 15,
        dob: '1997-02-11T11:30:30',
        firstName: 'departure',
        lastName: 'mall',
        progress: 21,
        status: 'complicated',
        visits: 70,
    },
    {
        age: 24,
        dob: '1990-03-11T11:30:30',
        firstName: 'assistance',
        lastName: 'family',
        progress: 33,
        status: 'single',
        visits: 54,
    },
    {
        age: 24,
        dob: '1990-04-11T11:30:30',
        firstName: 'insurance',
        lastName: 'icicle',
        progress: 17,
        status: 'complicated',
        visits: 86,
    },
    {
        age: 17,
        dob: '1990-05-11T11:30:30',
        firstName: 'marble',
        lastName: 'effort',
        progress: 98,
        status: 'complicated',
        visits: 12,
    },
    {
        age: 25,
        dob: '1990-02-11T11:30:30',
        firstName: 'definition',
        lastName: 'frame',
        progress: 92,
        status: 'single',
        visits: 56,
    },
];

const columns = [
    {
        Header: (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>a</span>
                <span>b</span>
            </div>
        ),
        accessor: 'firstName',
        // width: '100px',
    },
    {
        Header: 'Last Name',
        accessor: 'lastName',
        filter: 'text',
        tooltip: 'This is a tooltip',
        // width: 50,
    },
    {
        Header: 'Age',
        accessor: 'age',
        disableSortBy: true,
        filter: 'numeric',
        // width: 50,
    },
    {
        Header: 'Visits',
        accessor: 'visits',
        // width: 20,
    },
    {
        Cell: TableComponent.cells.DATETIME(),
        Header: 'Date of Birth',
        accessor: 'dob',
        filter: 'datetime',
        // width: 10,
    },
    {
        ...TableComponent.ActionColumn([TableComponent.Actions.SELECT], 'select_box_col', 'left', false),
    },
];

export const Table = (args: Props<any>): JSX.Element => {
    const tableRef = useRef<TableHandle>();

    return (
        <div style={{ height: '100%' }}>
            {/* eslint-disable jsx-a11y/control-has-associated-label */}
            <button onClick={() => tableRef.current.resetFilters()} type="button">
                Reset filters
            </button>
            <TableComponent ref={tableRef} {...args} />
        </div>
    );
};

Table.args = {
    columns,
    data: sampleData,
    onFilter: null,
    onSort: null,
} as Props<any>;

export const TableSmallFont = (args: Props<any>): JSX.Element => {
    const tableRef = useRef<TableHandle>();

    return (
        <div style={{ fontSize: '12px', height: '100%' }}>
            {/* eslint-disable jsx-a11y/control-has-associated-label */}
            <button onClick={() => tableRef.current.resetFilters()} type="button">
                Reset filters
            </button>
            <TableComponent ref={tableRef} {...args} />
        </div>
    );
};

TableSmallFont.args = {
    columns,
    data: sampleData,
    onFilter: null,
    onSort: null,
} as Props<any>;

export const TableInfinite = (args: Props<any>): JSX.Element => {
    const tableRef = useRef<TableHandle>();

    return (
        <div style={{ height: '100%' }}>
            {/* eslint-disable jsx-a11y/control-has-associated-label */}
            <button onClick={() => tableRef.current.resetFilters()} type="button">
                Reset filters
            </button>
            <TableComponent ref={tableRef} {...args} />
        </div>
    );
};
TableInfinite.args = {
    columns,
    getItem: (idx: number) => sampleData[idx],
    itemCount: sampleData.length,
    onItemsRendered: () => Promise.resolve(),
} as Props<any>;
