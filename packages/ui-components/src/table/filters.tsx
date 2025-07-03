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
import {
    FloatingPortal,
    autoUpdate,
    flip,
    offset,
    shift,
    useClick,
    useDismiss,
    useFloating,
    useInteractions,
    useRole,
} from '@floating-ui/react';

import styled from '@darajs/styled-components';

import { FilterWrapper, StyledSearchBar } from '../filter/categorical-filter';
import { FilterResults as DatetimeFilterResults } from '../filter/datetime-filter';
import { FilterResults as NumericFilterResults } from '../filter/numeric-filter';
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
        case DateOperator.BT:
            if (Array.isArray(filterValue)) {
                return isWithinInterval(parsedValue, { start: filterValue[0], end: filterValue[1] });
            }
            return false;
        default:
            return false;
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
    const [isOpen, setIsOpen] = useState(false);
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

    // Ref to track portal elements for click outside detection
    const portalsRef = useRef<Array<HTMLElement>>([]);

    const { refs, floatingStyles, context } = useFloating({
        open: isOpen,
        onOpenChange: setIsOpen,
        placement: 'bottom-start',
        middleware: [
            offset(8),
            flip(),
            shift({ padding: 8 }),
        ],
        whileElementsMounted: autoUpdate,
    });

    const click = useClick(context);
    const dismiss = useDismiss(context, {
        outsidePress: (event) => {
            const target = event.target as HTMLElement;
            
            // Check if click is within any portal elements
            for (const portal of portalsRef.current) {
                if (portal?.contains(target)) {
                    return false; // Don't dismiss if clicking inside portal
                }
            }
            return true; // Dismiss if clicking outside
        },
    });
    const role = useRole(context);

    const { getReferenceProps, getFloatingProps } = useInteractions([
        click,
        dismiss,
        role,
    ]);

    const hide = (): void => setIsOpen(false);

    return (
        <>
            <span
                ref={refs.setReference}
                {...getReferenceProps()}
            >
                <HeaderIconWrapper hasFilter={hasFilter}>
                    <FilterIcon $hasFilter={hasFilter} icon={faFilter} />
                </HeaderIconWrapper>
            </span>
            
            {isOpen && (
                <FloatingPortal>
                    <div
                        ref={refs.setFloating}
                        style={{
                            ...floatingStyles,
                            zIndex: 9999,
                            pointerEvents: 'auto',
                        }}
                        {...getFloatingProps()}
                    >
                        {props.col.render('Filter', { items, onChange: hide, portalsRef })}
                    </div>
                </FloatingPortal>
            )}
        </>
    );
}
