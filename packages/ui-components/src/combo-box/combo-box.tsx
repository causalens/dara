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
import { autoUpdate, flip, offset, shift, useFloating, useInteractions, useRole } from '@floating-ui/react';
import { UseComboboxReturnValue, UseComboboxStateChangeTypes, useCombobox } from 'downshift';
import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';

import styled from '@darajs/styled-components';

import ChevronButton from '../shared/chevron-button';
import DropdownList from '../shared/dropdown-list';
import Tooltip from '../tooltip/tooltip';
import { InteractiveComponentProps, Item } from '../types';
import { matchWidthToReference } from '../utils';
import { syncKbdHighlightIdx } from '../utils/syncKbdHighlightIdx';

const { stateChangeTypes } = useCombobox;

interface WrapperProps {
    isDisabled: boolean;
    isErrored: boolean;
    isOpen: boolean;
}

export const Wrapper = styled.div<WrapperProps>`
    display: inline-flex;

    width: 100%;
    min-width: 4rem;
    height: 2.5rem;

    border-radius: ${(props) => (props.isOpen ? '0.25rem 0.25rem 0px 0px' : '0.25rem')};

    ${(props) => {
        if (props.isDisabled) {
            return `
                border: 1px solid ${props.theme.colors.grey2};

                svg {
                    color: ${props.theme.colors.grey2};
                }
            `;
        }

        if (props.isErrored) {
            return `border: 1px solid ${props.theme.colors.error};`;
        }

        return `
            border: 1px solid ${props.isOpen ? props.theme.colors.grey3 : props.theme.colors.grey1};
            :hover {
                border: 1px solid ${props.theme.colors.grey3};

            }
        `;
    }}
`;

interface InputWrapperProps {
    disabled: boolean;
    isOpen: boolean;
}

export const InputWrapper = styled.div<InputWrapperProps>`
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    justify-content: space-between;

    width: calc(100% - 1rem);
    height: 100%;
    padding: 0 0.25rem 0 1rem;

    color: ${(props) => (props.disabled ? props.theme.colors.grey2 : props.theme.colors.text)};

    background-color: ${(props) => props.theme.colors.grey1};
    border: none;
    border-radius: ${(props) => (props.isOpen ? '0.25rem 0.25rem 0px 0px' : '0.25rem')};

    :hover {
        background-color: ${(props) => (props.disabled ? props.theme.colors.grey1 : props.theme.colors.grey2)};
    }

    svg {
        height: 0.8rem;
    }
`;

export const Input = styled.input`
    overflow: hidden;
    flex: 1 1 auto;

    height: 100%;
    margin-right: 0.5rem;
    padding: 0;

    font-size: ${(props) => (props.size ? `${props.size}rem` : props.theme.font.size)};
    font-weight: 300;
    color: ${(props) => props.theme.colors.text};
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;

    background-color: transparent;
    border: none;
    outline: 0;

    :disabled {
        cursor: not-allowed;
        color: ${(props) => props.theme.colors.grey2};
    }
`;

export interface ComboBoxProps extends InteractiveComponentProps<Item> {
    /** Whether to open the select dropdown on load or not, defaults to false */
    initialIsOpen?: boolean;
    /** The items to pick from the list. Each should have a label and a value */
    items: Array<Item>;
    /** An optional onSelect handler for listening to changes in the selected item */
    onSelect?: (item: Item) => void | Promise<void>;
    /** An optional placeholder for the input field to display when nothing is selected, defaults to '' */
    placeholder?: string;
    /** Set the selected value to a specific value, will put the component in controlled mode. Set to `null` to reset the value. */
    selectedItem?: Item;
    /** Font size in rem to show in the Select */
    size?: number;
    /** Pass through of style property to the root element */
    style?: React.CSSProperties;
}

/**
 * A single select combobox component, accepts a list of items to select from and an onSelect handler to listen for
 * changes. Allows to search for item by typing in combo box.
 *
 * @param {ComboBoxProps} props - the component props
 */
function ComboBox(props: ComboBoxProps): JSX.Element {
    const [inputValue, setInputValue] = useState(props.initialValue?.label ?? props.selectedItem?.label ?? '');
    const [pendingHighlight, setPendingHighlight] = useState(null);

    const filteredItems = useMemo(
        () =>
            props.items.filter((item) =>
                inputValue ? item.label?.toLowerCase().includes(inputValue?.toLowerCase()) : true
            ),
        [inputValue, props.items]
    );
    const [kbdHighlightIdx, setKbdHighlightIdx] = React.useState<number | undefined>();

    const {
        selectedItem,
        isOpen,
        getMenuProps,
        getInputProps,
        getToggleButtonProps,
        getItemProps,
        setHighlightedIndex,
    }: UseComboboxReturnValue<Item> = useCombobox<Item>({
        initialIsOpen: props.initialIsOpen,
        initialSelectedItem: props.initialValue ?? props.selectedItem,
        itemToString: (item) => (item ? item.label : ''),
        items: filteredItems,
        onInputValueChange: (change) => {
            setInputValue(change.inputValue);
        },
        onSelectedItemChange: (changes) => {
            if (props.onSelect) {
                if (
                    (props.selectedItem && changes.selectedItem?.value !== props.selectedItem?.value) ||
                    !props.selectedItem
                ) {
                    props.onSelect(changes.selectedItem);
                }
            }
        },
        ...syncKbdHighlightIdx(setKbdHighlightIdx),
        stateReducer: (state, { changes, type }) => {
            // This resets the input when the dropdown is opened
            if (
                type === stateChangeTypes.InputFocus ||
                (type === stateChangeTypes.ToggleButtonClick && changes.isOpen) ||
                (type === stateChangeTypes.ControlledPropUpdatedSelectedItem && changes.isOpen)
            ) {
                // This is a hack to change the highlight in the next render cycle so filteredItems had time to update
                setPendingHighlight(
                    changes.selectedItem ? props.items.findIndex((i) => i.value === changes.selectedItem.value) : 0
                );
                return {
                    ...changes,
                    inputValue: '',
                };
            }
            // This restores the input value when the dropdown is closed or an item is picked
            if (
                (
                    [
                        stateChangeTypes.InputKeyDownEnter,
                        stateChangeTypes.ItemClick,
                        stateChangeTypes.InputBlur,
                        stateChangeTypes.InputKeyDownEscape,
                        stateChangeTypes.ToggleButtonClick,
                    ] as UseComboboxStateChangeTypes[]
                ).includes(type)
            ) {
                return {
                    ...changes,
                    inputValue: changes.selectedItem?.label || '',
                };
            }

            return changes;
        },
        // Only set the selectedItem key if it has been explicitly set in props
        ...('selectedItem' in props && { selectedItem: props.selectedItem }),
    });

    useEffect(() => {
        if (isOpen && pendingHighlight !== null) {
            setHighlightedIndex(pendingHighlight);
            setPendingHighlight(null);
        }
    }, [isOpen, pendingHighlight, setHighlightedIndex]);

    useEffect(() => {
        if (props.selectedItem === null) {
            setInputValue('');
        }
    }, [props.selectedItem]);

    const { refs, floatingStyles, context } = useFloating<HTMLElement>({
        open: isOpen,
        middleware: [flip(), shift(), offset({ crossAxis: 1 }), matchWidthToReference(+2)],
        whileElementsMounted: isOpen ? autoUpdate : undefined,
    });

    const dropdownStyle = useMemo(
        () => ({
            ...floatingStyles,
            marginLeft: -1,
        }),
        [floatingStyles]
    );

    const role = useRole(context, { role: 'combobox' });
    const { getReferenceProps, getFloatingProps } = useInteractions([role]);

    return (
        <Tooltip content={props.errorMsg} disabled={!props.errorMsg} styling="error">
            <Wrapper
                className={props.className}
                isDisabled={props.disabled}
                isErrored={!!props.errorMsg}
                isOpen={isOpen}
                style={props.style}
            >
                <InputWrapper disabled={props.disabled} isOpen={isOpen} ref={refs.setReference}>
                    <Input
                        {...getInputProps({
                            disabled: props.disabled,
                        })}
                        {...getReferenceProps()}
                        placeholder={
                            (selectedItem === null ? props.placeholder : selectedItem?.label) ?? props.placeholder
                        }
                        size={props.size}
                    />
                    <ChevronButton
                        disabled={props.disabled}
                        isOpen={isOpen}
                        getToggleButtonProps={getToggleButtonProps}
                    />
                </InputWrapper>
                {ReactDOM.createPortal(
                    <DropdownList
                        items={filteredItems}
                        getItemProps={getItemProps}
                        getFloatingProps={getFloatingProps}
                        style={dropdownStyle}
                        isOpen={isOpen}
                        getMenuProps={getMenuProps}
                        size={props.size}
                        ref={refs.setFloating}
                        selectedItem={selectedItem}
                        kbdHighlightIdx={kbdHighlightIdx}
                    />,
                    document.body
                )}
            </Wrapper>
        </Tooltip>
    );
}

export default ComboBox;
