import { GetPropsCommonOptions, UseComboboxGetItemPropsOptions, UseComboboxGetMenuPropsOptions } from 'downshift';
import { isEmpty } from 'lodash';
import React from 'react';

import styled from '@darajs/styled-components';

import { Item } from '../types';
import { List, NoItemsLabel } from '../utils/list-styles';
import ListItem from './list-item';

const StyledDropdownList = styled(List)`
    border-radius: 0 0 0.25rem 0.25rem;
    outline: 0;
    box-shadow: ${(props) => props.theme.shadow.light};
`;

type Props = {
    /** Array of items to display in the dropdown */
    items: Item[];
    /** Function to get props for an item */
    getItemProps: (options: UseComboboxGetItemPropsOptions<Item>) => any;
    /** Function to get props for the floating element */
    getFloatingProps: (userProps?: React.HTMLProps<HTMLElement>) => Record<string, unknown>;
    /** Style object to customize the dropdown list */
    style: React.CSSProperties;
    /** Boolean to indicate if the dropdown is open */
    isOpen: boolean;
    /** Optional size for the list items */
    size?: number;
    /** Function to get props for the menu. */
    getMenuProps?: (options?: UseComboboxGetMenuPropsOptions, otherOptions?: GetPropsCommonOptions) => any;
    /** Maximum number of items to display in the dropdown */
    maxItems?: number;
    /** CSS classname for individual items */
    itemClass?: string;
    /** CSS classname for the dropdown list */
    className?: string;
    /** Optional function to render custom children. By default, it renders the ListItem with the item label */
    children?: (item: Item, index: number) => React.ReactNode;
    /** The item to scroll into view when the menu is opened */
    selectedItem?: Item;
    /** The item to highlight when keyboard is used. Otherwise CSS :hover is used. */
    kbdHighlightIdx?: number;
};

/**
 * DropdownList component to display a list of items in a dropdown.
 *
 * @param {Props} props - The props for the component
 */
const DropdownList = React.forwardRef<any, Props>(
    (
        {
            items,
            getItemProps,
            getFloatingProps,
            isOpen,
            getMenuProps,
            size,
            style,
            maxItems,
            itemClass,
            className,
            children,
            selectedItem,
            kbdHighlightIdx,
        },
        ref
    ): JSX.Element => (
        <StyledDropdownList
            {...(getMenuProps ? getMenuProps({ ref }) : { ref })} // Merge the refs conditionally
            {...getFloatingProps()}
            isOpen={isOpen}
            maxItems={maxItems}
            style={{
                ...style,
                zIndex: 9999,
            }}
            className={className}
        >
            {!isEmpty(items) ?
                items.map((item, index) => {
                    const isSelected = selectedItem?.label === item.label;
                    return children ?
                            children(item, index)
                        :   <ListItem
                                getItemProps={getItemProps}
                                // Hack to force a scroll-in-to-view when the menu is opened
                                // Only the selected item is rerendered
                                // Downshift.js does not scroll if the item is memoized
                                key={`item-${index}-${isOpen && isSelected}`}
                                size={size}
                                title={item.label}
                                item={item}
                                index={index}
                                itemClass={itemClass}
                                isHighlighted={isOpen && kbdHighlightIdx !== undefined && kbdHighlightIdx === index}
                                isSelected={isSelected}
                            >
                                {item.label}
                            </ListItem>;
                })
            :   <NoItemsLabel>No Items</NoItemsLabel>}
        </StyledDropdownList>
    )
);
DropdownList.displayName = 'DropdownList';

export default React.memo(DropdownList);
