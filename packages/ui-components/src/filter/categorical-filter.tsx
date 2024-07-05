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
import isEqual from 'lodash/isEqual';
import { useState } from 'react';
import { FilterProps } from 'react-table';

import styled from '@darajs/styled-components';

import CheckboxGroup from '../checkbox/checkbox-group';
import SearchBar from '../search-bar/search-bar';
import { Item } from '../types';

export const FilterWrapper = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.5rem;

    width: 17.5rem;
    padding: 1.25rem 0.5rem;

    background-color: ${(props) => props.theme.colors.grey1};
    border-radius: 0.25rem;
    box-shadow: ${(props) => props.theme.shadow.light};
`;

export const StyledSearchBar = styled(SearchBar)`
    width: 15.5rem;
    background-color: ${(props) => props.theme.colors.blue1};
    border: 1px solid ${(props) => props.theme.colors.blue1};
    border-radius: 0.25rem;

    input {
        width: 15.5rem;
        background-color: ${(props) => props.theme.colors.blue1};
        border: none;

        :active:not(:disabled),
        :focus:not(:disabled) {
            border: none;
        }
    }

    :hover:not(:disabled) {
        background-color: ${(props) => props.theme.colors.blue1};
        border: 1px solid ${(props) => props.theme.colors.grey2};

        input {
            background-color: ${(props) => props.theme.colors.blue1};
            border: none;
        }
    }
`;

const FilterButtons = styled.button`
    font-size: 0.75rem;
    font-weight: 400;
    color: ${(props) => props.theme.colors.primary};

    background-color: inherit;
    border: none;

    :hover {
        cursor: pointer;
        color: ${(props) => props.theme.colors.primaryHover};
    }

    :active {
        color: ${(props) => props.theme.colors.primaryDown};
    }

    :disabled {
        cursor: not-allowed;
        color: ${(props) => props.theme.colors.grey2};
    }
`;

const OptionsWrapper = styled.div`
    overflow-y: auto;
    height: 10rem;
`;

const StyledCheckboxGroup = styled(CheckboxGroup)`
    div {
        height: 2rem;
        padding: 0 0.75rem;
    }

    label {
        font-size: 0.75rem;

        :hover {
            background: ${(props) => props.theme.colors.grey2} !important;
        }

        :active {
            background: ${(props) => props.theme.colors.grey3} !important;
        }
    }
`;

export const ApplyButton = styled(FilterButtons)`
    align-self: center;

    width: fit-content;
    height: 2rem;
    padding: 0.5rem;

    font-size: 0.875rem;
`;

export interface CategoricalFilterProps extends FilterProps<any> {
    /** Standard react className property */
    className?: string;
    /** Whether the filter is disabled. */
    disabled?: boolean;
    /** The options to appear in the filter. Each should have a label and a value */
    items: Array<Item>;
    /** An optional onChange handler, will be called whenever the filter is applied */
    onChange?: (value: Array<Item> | Item, e: React.MouseEvent<HTMLButtonElement>) => void | Promise<void>;
    /** An optional list of Items of the selected options */
    values?: Array<Item>;
}

/**
 * A CategoricalFilter component
 *
 * @param {CategoricalFilterProps} props - the component props
 */
function CategoricalFilter(props: CategoricalFilterProps): JSX.Element {
    const [inputValue, setInputValue] = useState('');
    const [filterValue, setFilterValue] = useState(props.values ?? []);
    const [previousFilter, setPreviousFilter] = useState(props.values);

    const filteredItems = props.items.filter((item) =>
        inputValue ? item.label?.toLowerCase().includes(inputValue?.toLowerCase()) : true
    );

    return (
        <FilterWrapper className={props.className}>
            <StyledSearchBar onChange={(change) => setInputValue(change)} />
            <div style={{ display: 'flex', height: '2rem', margin: '0rem 0.75rem -0.5rem 0.75rem' }}>
                <FilterButtons onClick={() => setFilterValue(filteredItems)}>Select all</FilterButtons>
                <FilterButtons onClick={() => setFilterValue([])}>Clear</FilterButtons>
            </div>
            <OptionsWrapper>
                <StyledCheckboxGroup
                    isListStyle
                    items={filteredItems}
                    onChange={(v) => {
                        // contains the array of the currently visible checked items
                        const selectedFilteredItems = Array.isArray(v) ? v : [v];

                        //  we get the items that were checked but now are unchecked.
                        const unchecked =
                            filterValue?.filter(
                                (value) =>
                                    // for each checked item before, we check if it is not in the currently checked items
                                    selectedFilteredItems.every((item) => !isEqual(value, item)) &&
                                    // and if it is currently visible
                                    filteredItems.some((item) => isEqual(value, item))
                            ) ?? [];

                        // the items that were not checked before but now are checked.
                        const newlyChecked = selectedFilteredItems.filter((value) =>
                            filterValue?.every((item) => !isEqual(value, item))
                        );

                        //  the items that were checked before and are still checked.
                        const stillChecked =
                            filterValue?.filter(
                                (value) =>
                                    // for each checked item before, we check if it is not in unchecked
                                    !unchecked.some((item) => isEqual(value, item))
                            ) ?? [];

                        // The new checked items are the items that were checked before and are still checked plus the newly checked items
                        setFilterValue([...stillChecked, ...newlyChecked]);
                    }}
                    values={filterValue}
                />
            </OptionsWrapper>
            <ApplyButton
                disabled={props.disabled || previousFilter === filterValue}
                onClick={(e) => {
                    props.onChange?.(filterValue, e);
                    // need to set filter for Table component
                    props?.column?.setFilter(filterValue || undefined);
                    setPreviousFilter(filterValue);
                }}
            >
                Apply
            </ApplyButton>
        </FilterWrapper>
    );
}

export default CategoricalFilter;
