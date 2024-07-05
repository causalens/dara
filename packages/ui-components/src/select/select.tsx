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
import { Placement, autoUpdate, flip, shift, useFloating, useInteractions, useRole } from '@floating-ui/react';
import { useSelect } from 'downshift';
import * as React from 'react';
import ReactDOM from 'react-dom';

import styled from '@darajs/styled-components';

import DropdownList from '../shared/dropdown-list';
import Tooltip from '../tooltip/tooltip';
import { InteractiveComponentProps, Item } from '../types';
import { Chevron, matchWidthToReference } from '../utils';
import { syncKbdHighlightIdx } from '../utils/syncKbdHighlightIdx';

interface SelectedItemProps {
    size?: number;
}

const SelectedItem = styled.div<SelectedItemProps>`
    overflow: hidden;

    /* The space available is that of the wrapper minus of the chevron */
    width: calc(100% - 1rem);
    margin-right: 0.5rem;

    font-size: ${(props) => (props.size ? `${props.size}rem` : '1rem')};
    font-weight: 300;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

interface WrapperProps {
    isDisabled: boolean;
    isErrored: boolean;
    isOpen: boolean;
}

const Wrapper = styled.div<WrapperProps>`
    display: inline-flex;

    width: 100%;
    min-width: 4rem;
    height: 2.5rem;

    border-radius: ${(props) => (props.isOpen ? '0.25rem 0.25rem 0rem 0rem' : '0.25rem')};

    ${(props) => {
        if (props.isDisabled) {
            return `
                border: 1px solid ${props.theme.colors.grey1};
                cursor: not-allowed;
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

interface SelectButtonProps {
    isOpen: boolean;
}

const SelectButton = styled.button<SelectButtonProps>`
    display: inline-flex;
    flex: 1 1 auto;
    align-items: center;
    justify-content: space-between;

    width: 100%;
    height: 100%;
    padding: 0 0.5rem 0 1rem;

    font-size: 1rem;
    color: ${(props) => props.theme.colors.text};

    background-color: ${(props) => props.theme.colors.grey1};
    border: none;
    border-radius: ${(props) => (props.isOpen ? '0.25rem 0.25rem 0rem 0rem' : '0.25rem')};
    outline: 0;

    :not(:enabled) {
        cursor: not-allowed;
    }

    :hover:enabled {
        background-color: ${(props) => props.theme.colors.grey2};
    }

    svg {
        width: 1rem !important;
        height: 0.8rem;
    }

    :disabled {
        color: ${(props) => props.theme.colors.grey2};
        background-color: ${(props) => props.theme.colors.grey1};

        svg {
            color: ${(props) => props.theme.colors.grey2};
        }
    }
`;

export interface SelectProps extends InteractiveComponentProps<Item> {
    /** Whether to force the list to the same width as the parent, defaults to true */
    applySameWidthModifier?: boolean;
    /** A function taking an element for the ref of the dropdown  */
    dropdownRef?: (element: any) => void;
    /** Whether to open the select dropdown on load or not, defaults to false */
    initialIsOpen?: boolean;
    /** className property to put on the select's items and the item wrapper */
    itemClass?: string;
    /** The items to pick from the list. Each should have a label and a value */
    items: Array<Item>;
    /** The maximum number of items to display, defaults to 5 */
    maxItems?: number;
    /** onClick event. */
    onClick?: (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => void | Promise<void>;
    /** An optional onSelect handler for listening to changes in the selected item */
    onSelect?: (item: Item) => void | Promise<void>;
    /** An optional placeholder for the input field to display when nothing is selected, defaults to '' */
    placeholder?: string;
    /** Specify a specific placement for the list */
    placement?: Placement;
    /** Set the selected value to a specific value, will put the component in controlled mode. Set to `null` to reset the value */
    selectedItem?: Item;
    /** Font size in rem to show in the Select */
    size?: number;
}

/**
 * A single select dropdown component that has no search capability, accepts a list of items to select from and an
 * onSelect handler to listen for changes in the selection
 *
 * @param {SelectProps} props - the props of the component
 */
function Select(props: SelectProps): JSX.Element {
    const { applySameWidthModifier = true } = props;
    const [kbdHighlightIdx, setKbdHighlightIdx] = React.useState<number | undefined>();
    const { isOpen, selectedItem, getToggleButtonProps, getMenuProps, getItemProps } = useSelect<Item>({
        initialIsOpen: props.initialIsOpen,
        initialSelectedItem: props.initialValue,
        itemToString: (item) => item.label,
        items: props.items,
        onSelectedItemChange: (changes) => {
            const selected = changes.selectedItem;
            props.onSelect?.(selected);
        },
        ...syncKbdHighlightIdx(setKbdHighlightIdx),
        // Only set the selectedItem key if it has been explicitly set in props
        ...('selectedItem' in props && { selectedItem: props.selectedItem }),
    });

    const { refs, floatingStyles, context } = useFloating<HTMLElement>({
        open: isOpen,
        placement: props.placement || 'bottom-start',
        middleware: [flip(), shift(), ...(applySameWidthModifier ? [matchWidthToReference(+2)] : [])],
        whileElementsMounted: isOpen ? autoUpdate : undefined,
    });

    const role = useRole(context, { role: 'listbox' });
    const { getReferenceProps, getFloatingProps } = useInteractions([role]);

    const setFloatingRef = refs.setFloating;
    const { dropdownRef } = props;

    const mergedDropdownRef = React.useCallback(
        (node: HTMLElement | null) => {
            setFloatingRef(node);
            dropdownRef?.(node);
        },
        [setFloatingRef, dropdownRef]
    );
    const menuProps = React.useMemo(() => getMenuProps({ ref: mergedDropdownRef }), [mergedDropdownRef, getMenuProps]);

    const toggleButtonProps = React.useMemo(
        () => getToggleButtonProps({ disabled: props.disabled, ref: refs.setReference }),
        [props.disabled, refs.setReference, getToggleButtonProps]
    );

    const dropdownStyle = React.useMemo(
        () => ({
            ...floatingStyles,
            marginLeft: -1,
        }),
        [floatingStyles]
    );

    return (
        <Tooltip content={props.errorMsg} disabled={!props.errorMsg} styling="error">
            <Wrapper
                className={props.className}
                isDisabled={props.disabled}
                isErrored={!!props.errorMsg}
                isOpen={isOpen}
                onClick={props.onClick}
                style={props.style}
            >
                <SelectButton
                    disabled={props.disabled}
                    isOpen={isOpen}
                    {...toggleButtonProps}
                    {...getReferenceProps()}
                    type="button"
                >
                    <SelectedItem size={props.size}>
                        {(selectedItem === null ? props.placeholder : selectedItem?.label) ??
                            props.placeholder ??
                            'Select'}
                    </SelectedItem>
                    <Chevron disabled={props.disabled} isOpen={isOpen} />
                </SelectButton>
                {ReactDOM.createPortal(
                    <DropdownList
                        items={props.items}
                        getItemProps={getItemProps}
                        getFloatingProps={getFloatingProps}
                        style={dropdownStyle}
                        isOpen={isOpen}
                        getMenuProps={getMenuProps}
                        size={props.size}
                        ref={refs.setFloating}
                        className={`${menuProps?.className ?? ''} ${props.itemClass}`}
                        itemClass={props.itemClass}
                        maxItems={props.maxItems}
                        selectedItem={selectedItem}
                        kbdHighlightIdx={kbdHighlightIdx}
                    />,
                    document.body
                )}
            </Wrapper>
        </Tooltip>
    );
}

export default Select;
