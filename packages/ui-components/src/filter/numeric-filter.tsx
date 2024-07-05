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

import Input from '../input/input';
import Select from '../select/select';
import { Item } from '../types';
import { ApplyButton, FilterWrapper } from './categorical-filter';

const StyledSelect = styled(Select)`
    margin: 1px solid ${(props) => props.theme.colors.background};

    button {
        background-color: ${(props) => props.theme.colors.background};

        :hover:enabled {
            background-color: ${(props) => props.theme.colors.background};
        }
    }
`;

const InputsWrapper = styled.div`
    display: flex;
    gap: 5px;
    align-items: center;
`;

export const FilterHeader = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0 0.5rem;
`;

interface StyledInputProps {
    showError?: boolean;
    showTwoInputs?: boolean;
}

const StyledInput = styled(Input)<StyledInputProps>`
    width: ${(props) => (props.showTwoInputs ? '106px' : '100%')};

    input {
        width: ${(props) => (props.showTwoInputs ? '106px' : '100%')};
        background-color: ${(props) => props.theme.colors.background};
        border: 1px solid ${(props) => (props.showError ? props.theme.colors.error : props.theme.colors.background)};

        :hover:not(:disabled) {
            background-color: ${(props) => props.theme.colors.background};
            border: 1px solid ${(props) => (props.showError ? props.theme.colors.error : props.theme.colors.grey3)};
        }

        :active:not(:disabled),
        :focus:not(:disabled) {
            border: 1px solid ${(props) => (props.showError ? props.theme.colors.error : props.theme.colors.grey3)};
        }
    }
`;

const ErrorMessage = styled.span`
    user-select: none;
    font-size: 0.7rem;
    color: ${(props) => props.theme.colors.error};
`;

const NumericFilterItems: Item[] = [
    {
        label: 'None',
        value: 'None',
    },
    {
        label: 'Greater than',
        value: 'Greater than',
    },
    {
        label: 'Less than',
        value: 'Less tha',
    },
    {
        label: 'Equal to',
        value: 'Equal to',
    },
    {
        label: 'Not equal to',
        value: 'Not equal to',
    },
    {
        label: 'Between',
        value: 'Between',
    },
];

export interface FilterResults {
    selected: string;
    value: number | [number, number];
}

export interface NumericFilterProps extends FilterProps<any> {
    /** Standard react className property */
    className?: string;
    /** Whether the filter is disabled. */
    disabled?: boolean;
    /** An optional onChange handler, will be called whenever the filter is applied */
    onChange?: (value: FilterResults, e: React.MouseEvent<HTMLButtonElement>) => void | Promise<void>;
    /** An optional ref to be passed through to all selects dropdowns present in the filter */
    portalsRef?: React.MutableRefObject<HTMLElement[]>;
}

/**
 * A NumericFilter component
 *
 * @param {NumericFilterProps} props - the component props
 */
function NumericFilter(props: NumericFilterProps): JSX.Element {
    const [selected, setSelected] = useState<Item>(null);
    const [firstInput, setFirstInput] = useState<number>(null);
    const [secondInput, setSecondInput] = useState<number>(null);

    const filteredValues = useMemo((): FilterResults => {
        if (selected?.label === 'None') {
            return { selected: selected?.label, value: null };
        }
        if (selected?.label === 'Between') {
            return { selected: selected?.label, value: [firstInput, secondInput] };
        }
        return { selected: selected?.label, value: firstInput };
    }, [firstInput, secondInput, selected]);

    const [previousFilter, setPreviousFilter] = useState<FilterResults>(filteredValues);

    const showError = useMemo((): boolean => {
        if (secondInput && firstInput && secondInput < firstInput && selected?.label === 'Between') {
            return true;
        }
        return false;
    }, [firstInput, secondInput, selected]);

    const disableApply = useMemo((): boolean => {
        // disable apply if component is disabled, if the filter hasn't changed, if there is an input error, or input hasn't been filled
        if (props.disabled || previousFilter === filteredValues || showError) {
            return true;
        }
        if (firstInput === null && selected?.label !== 'None') {
            return true;
        }
        if (secondInput === null && selected?.label === 'Between') {
            return true;
        }
        return false;
    }, [props.disabled, firstInput, secondInput, previousFilter, filteredValues, showError, selected]);

    return (
        <FilterWrapper className={props.className}>
            <FilterHeader>
                <StyledSelect
                    dropdownRef={(element) => {
                        if (props.portalsRef) {
                            props.portalsRef.current[0] = element;
                        }
                    }}
                    initialValue={{
                        label: 'None',
                        value: 'None',
                    }}
                    items={NumericFilterItems}
                    maxItems={6}
                    onSelect={setSelected}
                />
                {selected && selected?.label !== 'None' && (
                    <InputsWrapper>
                        <StyledInput
                            onChange={(v) => setFirstInput(Number(v))}
                            showError={showError}
                            showTwoInputs={selected?.label === 'Between'}
                            type="number"
                        />
                        {selected?.label === 'Between' && (
                            <InputsWrapper>
                                and
                                <StyledInput
                                    onChange={(v) => setSecondInput(Number(v))}
                                    showError={showError}
                                    type="number"
                                    value={String(secondInput)}
                                />
                            </InputsWrapper>
                        )}
                    </InputsWrapper>
                )}
            </FilterHeader>
            {showError && <ErrorMessage>Input range not valid</ErrorMessage>}
            <ApplyButton
                disabled={disableApply}
                onClick={(e) => {
                    props.onChange?.(filteredValues, e);
                    props?.column?.setFilter(filteredValues || undefined);
                    setPreviousFilter(filteredValues);
                }}
            >
                Apply
            </ApplyButton>
        </FilterWrapper>
    );
}

export default NumericFilter;
