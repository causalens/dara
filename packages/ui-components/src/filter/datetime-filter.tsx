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
import { useMemo, useState } from 'react';
import { FilterProps } from 'react-table';

import styled from '@darajs/styled-components';

import Datepicker from '../datepicker/datepicker';
import Select from '../select/select';
import { Item } from '../types';
import { ApplyButton, FilterWrapper } from './categorical-filter';
import { FilterHeader } from './numeric-filter';

const DatetimeFilterWrapper = styled(FilterWrapper)`
    gap: 0;
`;
const DatepickerWrapper = styled.div`
    height: auto;

    div:has(input) {
        width: 6.7rem;
    }

    input {
        width: 6.7rem;
        padding: 0;
        background-color: ${(props) => props.theme.colors.background};
        border: 1px solid ${(props) => props.theme.colors.background};

        ::after {
            width: 5rem;
        }

        :hover:not(:disabled) {
            background-color: ${(props) => props.theme.colors.background};
            border: 1px solid ${(props) => props.theme.colors.grey4};
        }
    }

    div:has(> button) {
        border: 1px solid ${(props) => props.theme.colors.grey1};

        :hover {
            border: 1px solid ${(props) => props.theme.colors.grey1};
        }

        :focus-within {
            border: 1px solid ${(props) => props.theme.colors.grey1};
        }
    }

    button {
        background-color: ${(props) => props.theme.colors.grey1};

        :hover:enabled {
            background-color: ${(props) => props.theme.colors.grey2};
        }
    }

    .react-datepicker {
        margin-bottom: -1rem;
        margin-left: -0.5rem;

        background-color: ${(props) => props.theme.colors.grey1};
        border: none;
        box-shadow: none;

        /* stylelint-disable -- external classnames */
        .react-datepicker__month-container {
            .react-datepicker__header {
                background-color: ${(props) => props.theme.colors.grey1};
            }

            .react-datepicker__month {
                background-color: ${(props) => props.theme.colors.grey1};
            }
        }
    }
`;

const StyledSelect = styled(Select)`
    margin-bottom: 0.25rem;
    border: 1px solid ${(props) => props.theme.colors.background};

    button {
        background-color: ${(props) => props.theme.colors.background};

        :hover:enabled {
            background-color: ${(props) => props.theme.colors.background};
        }
    }
`;

const StyledApply = styled(ApplyButton)`
    width: 4rem;
    height: 2rem;
    padding: 0;
`;

export interface FilterResults {
    selected: string;
    value: Date | [Date, Date];
}
export interface DatetimeFilterProps extends FilterProps<any> {
    /** Standard react className property */
    className?: string;
    /** Whether the filter is disabled. */
    disabled?: boolean;
    /** An optional onChange handler, will be called whenever the filter is applied */
    onChange?: (value: FilterResults | Item, e: React.MouseEvent<HTMLButtonElement>) => void | Promise<void>;
    /** An optional ref to be passed through to all selects dropdowns present in the filter */
    portalsRef?: React.MutableRefObject<HTMLElement[]>;
    /** Controls if the time input should be enabled - default is off */
    showTimeInput?: boolean;
    /** An optional list of Items of the selected options */
    values?: Date | [Date, Date];
}

const DatetimeFilterItems: Item[] = [
    {
        label: 'None',
        value: 'None',
    },
    {
        label: 'Before',
        value: 'Before',
    },
    {
        label: 'After',
        value: 'After',
    },
    {
        label: 'On date',
        value: 'On date',
    },
    {
        label: 'Between',
        value: 'Between',
    },
];

/**
 * A DatetimeFilter component
 *
 * @param {DatetimeFilterProps} props - the component props
 */
function DatetimeFilter(props: DatetimeFilterProps): JSX.Element {
    const [selected, setSelected] = useState<Item>(null);
    const [dateValues, setDateValues] = useState<Date | [Date, Date]>(props.values);

    const filteredValues = useMemo((): FilterResults => {
        let filterDate = dateValues;
        // If switched from range to single should just send the first date to the onChange
        if (selected?.value !== 'Between' && Array.isArray(dateValues)) {
            [filterDate] = dateValues;
        }
        return { selected: selected?.label, value: filterDate };
    }, [dateValues, selected]);

    const [previousFilter, setPreviousFilter] = useState<FilterResults>(filteredValues);

    const disableApply = useMemo((): boolean => {
        // if filter disabled or value has not changed
        if (props.disabled || previousFilter === filteredValues) {
            return true;
        }
        // if one of the dates is not defined
        if (
            !dateValues ||
            (selected.label === 'Between' && Array.isArray(dateValues) && (!dateValues[0] || !dateValues[1])) ||
            (selected.label === 'Between' && !Array.isArray(dateValues))
        ) {
            return true;
        }
        return false;
    }, [props.disabled, previousFilter, filteredValues, dateValues, selected]);

    return (
        <DatetimeFilterWrapper className={props.className}>
            <FilterHeader>
                <StyledSelect
                    dropdownRef={(element) => {
                        if (props.portalsRef) {
                            props.portalsRef.current[2] = element;
                        }
                    }}
                    initialValue={{
                        label: 'None',
                        value: 'None',
                    }}
                    items={DatetimeFilterItems}
                    onSelect={setSelected}
                />
                <DatepickerWrapper>
                    {selected && selected.label !== 'None' && (
                        <Datepicker
                            inline
                            onChange={setDateValues}
                            portalsRef={props.portalsRef}
                            selectItemClass="DatetimeFilterSelect"
                            selectsRange={selected?.value === 'Between'}
                            shouldCloseOnSelect={false}
                            showTimeInput={props.showTimeInput}
                        />
                    )}
                </DatepickerWrapper>
            </FilterHeader>
            <StyledApply
                disabled={disableApply}
                onClick={(e) => {
                    props.onChange?.(filteredValues, e);
                    props?.column?.setFilter(filteredValues || undefined);
                    setPreviousFilter(filteredValues);
                }}
            >
                Apply
            </StyledApply>
        </DatetimeFilterWrapper>
    );
}

export default DatetimeFilter;
