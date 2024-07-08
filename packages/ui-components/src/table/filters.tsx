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
import { faFilter } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { isAfter, isBefore, isEqual, isWithinInterval, parseISO } from 'date-fns';
import { transparentize } from 'polished';
import { useMemo, useRef, useState } from 'react';
import { FilterProps, HeaderGroup, Row } from 'react-table';

import styled from '@darajs/styled-components';

import { FilterWrapper, StyledSearchBar } from '../filter/categorical-filter';
import { FilterResults as DatetimeFilterResults } from '../filter/datetime-filter';
import { FilterResults as NumericFilterResults } from '../filter/numeric-filter';
import Tooltip from '../tooltip/tooltip';
import { Item } from '../types';

const FilterIcon = styled(FontAwesomeIcon)<{ $hasFilter: boolean }>`
    cursor: pointer;
    color: ${(props) => (props.$hasFilter ? props.theme.colors.primary : props.theme.colors.grey3)};
`;

interface HeaderIconWrapperProp {
    hasFilter?: boolean;
}

export const HeaderIconWrapper = styled.div<HeaderIconWrapperProp>`
    display: flex;
    align-items: center;
    justify-content: center;

    width: 1.5rem;
    height: 1.5rem;

    border-radius: 0.25rem;

    :hover {
        background-color: ${(props) => transparentize(0.9, props.theme.colors.primaryHover)};

        svg {
            color: ${(props) => (props.hasFilter ? props.theme.colors.primary : props.theme.colors.grey3)};
        }
    }

    :active {
        background-color: ${(props) => transparentize(0.8, props.theme.colors.primaryDown)};
    }
`;

enum NumericOperator {
    BT = 'Between',
    EQ = 'Equal to',
    GT = 'Greater than',
    LT = 'Less than',
    NE = 'Not equal to',
}

enum DateOperator {
    BT = 'Between',
    EQ = 'On date',
    GT = 'After',
    LT = 'Before',
}

/**
 * Check whether a given operator is supported
 * @param op potential operator
 */
function isValidOperator(op: any): op is NumericOperator {
    return Object.keys(NumericOperator)
        .map((key) => NumericOperator[key as keyof typeof NumericOperator])
        .includes(op);
}

/**
 * Check whether a given operator is supported for datetime
 * @param op potential operator
 */
function isValidDatetimeOperator(op: any): op is DateOperator {
    return Object.keys(DateOperator)
        .map((key) => DateOperator[key as keyof typeof DateOperator])
        .includes(op);
}

/**
 * Apply an operator to a given numeric value.
 *
 * @param operator operator to apply
 * @param value value to compare
 * @param filterValue filter value to compare to
 */
function applyNumericOperator(
    operator: NumericOperator,
    value: number,
    filterValue: number | [number, number]
): boolean {
    switch (operator) {
        case NumericOperator.EQ:
            return value === filterValue;
        case NumericOperator.GT:
            if (Array.isArray(filterValue)) {
                throw new Error('Cannot use array for GT operator');
            }

            return value > filterValue;
        case NumericOperator.LT:
            if (Array.isArray(filterValue)) {
                throw new Error('Cannot use array for LT operator');
            }

            return value < filterValue;
        case NumericOperator.NE:
            return value !== filterValue;
        case NumericOperator.BT:
            if (Array.isArray(filterValue)) {
                return value <= filterValue[1] && value >= filterValue[0];
            }
            break;
        default:
            return true;
    }
}

/**
 * Apply an operator to a given datetime value.
 *
 * @param operator operator to apply
 * @param value value to compare
 * @param filterValue filter value to compare to
 */
function applyDatetimeOperator(operator: DateOperator, value: string, filterValue: Date | [Date, Date]): boolean {
    const parsedValue = parseISO(value);

    if (Array.isArray(filterValue)) {
        if (operator === DateOperator.BT) {
            return isWithinInterval(parsedValue, { end: filterValue[1], start: filterValue[0] });
        }
        return true;
    }

    switch (operator) {
        case DateOperator.EQ:
            return isEqual(parsedValue, filterValue);
        case DateOperator.GT:
            return isAfter(parsedValue, filterValue);
        case DateOperator.LT:
            return isBefore(parsedValue, filterValue);
        default:
            return true;
    }
}

/**
 * Custom numeric filter function
 *
 * @param rows rows to filter
 * @param columnIds IDs of columns
 * @param filterValue filter value provided
 */
export function numeric(rows: Array<Row>, columnIds: Array<string>, filterValue: NumericFilterResults): Array<Row> {
    const { selected, value } = filterValue;
    const [colId] = columnIds;

    // If operator not supported or there's no value to compare to, return all rows
    if (!isValidOperator(selected) || (!value && value !== 0)) {
        return rows;
    }

    return rows.filter((row) => applyNumericOperator(selected, row.values[colId], value));
}

/**
 * Custom datetime filter function
 *
 * @param rows rows to filter
 * @param columnIds IDs of columns
 * @param filterValue filter value
 */
export function datetime(rows: Array<Row>, columnIds: Array<string>, filterValue: DatetimeFilterResults): Array<Row> {
    const { selected, value } = filterValue;
    const [colId] = columnIds;

    // If operator not supported or there's no value to compare to, return all rows
    if (!isValidDatetimeOperator(selected) || !value) {
        return rows;
    }

    return rows.filter((row) => applyDatetimeOperator(selected, row.values[colId], value));
}

/**
 * Custom categorical filter function
 *
 * @param rows rows to filter
 * @param columnIds IDs of columns
 * @param filterItems filter value
 */
export function categorical(rows: Array<Row>, columnIds: Array<string>, filterItems: Item[]): Array<Row> {
    const [colId] = columnIds;
    const filteredItems = filterItems.map((item) => item.value);

    // If no categories selected return everything
    if (filteredItems.length === 0) {
        return rows;
    }

    return rows.filter((row) => filteredItems.includes(row.values[colId]));
}

/**
 * Text Filter component
 */
export function TextFilter(props: FilterProps<any>): JSX.Element {
    return (
        <FilterWrapper>
            <StyledSearchBar
                onChange={(val) => props.column.setFilter(val || undefined)}
                placeholder="Rows containing value..."
                value={props.column.filterValue || ''}
            />
        </FilterWrapper>
    );
}

interface ColumnFilterProps extends HeaderGroup {
    /** Optional prop passed to column defining uniqueItems that categorical filter should search for */
    uniqueItems?: Array<string>;
}

export interface FilterContainerProps {
    col: ColumnFilterProps;
}

export function FilterContainer(props: FilterContainerProps): JSX.Element {
    const [visible, setVisible] = useState(false);
    const show = (): void => setVisible(true);
    const hide = (): void => setVisible(false);
    const hasFilter = !(
        props.col.filterValue === undefined ||
        props.col.filterValue?.selected === 'None' ||
        (Array.isArray(props.col.filterValue) && props.col.filterValue.length === 0)
    );

    const items = useMemo(() => {
        if (props.col?.uniqueItems) {
            return props.col.uniqueItems.map((item): Item => ({ label: item, value: item }));
        }
    }, [props.col]);

    // because the select dropdown lives outside of the component we need to pass a ref so that we can check whether the user is clicking within it or outside
    const portalsRef = useRef<Array<HTMLElement>>([]);

    function onClickOutside(instance: any, event: Event): void {
        const target = event.target as HTMLInputElement;

        // loop through refs if they contain the target then user is clicking within a dropdown
        for (const portal of portalsRef.current) {
            if (portal?.contains(target)) {
                return;
            }
        }
        // user clicked outside so hide
        hide();
    }

    return (
        <Tooltip
            content={props.col.render('Filter', { items, onChange: hide, portalsRef })}
            hidden
            interactive
            onClickOutside={onClickOutside}
            visible={visible}
        >
            <span>
                <HeaderIconWrapper hasFilter={hasFilter}>
                    <FilterIcon $hasFilter={hasFilter} icon={faFilter} onClick={show} />
                </HeaderIconWrapper>
            </span>
        </Tooltip>
    );
}
