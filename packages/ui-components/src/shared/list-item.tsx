import { UseComboboxGetItemPropsOptions } from 'downshift';
import React from 'react';

import styled from '@darajs/styled-components';

import { Item } from '../types';

interface ListItemProps {
    isHighlighted?: boolean;
    isSelected?: boolean;
    size?: number;
}

export const StyledListItem = styled.span<ListItemProps>`
    cursor: pointer;
    user-select: none;

    overflow: hidden;

    width: 100%;
    min-height: 2rem;
    padding: 0.25rem 1rem;

    font-size: ${(props) => (props.size ? `${props.size}rem` : '1rem')};
    font-weight: 300;
    color: ${(props) => props.theme.colors.text};
    text-overflow: ellipsis;
    white-space: nowrap;

    background-color: ${(props) => {
        if (props.isSelected) {
            return props.theme.colors.blue3;
        }
        if (props.isHighlighted) {
            return props.theme.colors.grey2;
        }
        return props.theme.colors.blue1;
    }};
    border-bottom: 1px solid ${(props) => props.theme.colors.grey3};

    :hover {
        background-color: ${(props) => props.theme.colors.grey2};
    }

    :active {
        color: ${(props) => props.theme.colors.blue1};
        background-color: ${(props) => props.theme.colors.blue4};
    }

    &:last-child {
        border-bottom: none;
    }
`;

type Props = {
    /** Optional font size for the list item */
    size?: number;
    /** Title of the list item */
    title: string;
    /** Item data */
    item: Item;
    /** Index of the item in the list */
    index: number;
    /** Whether the item is highlighted. For example when using keyboard navigation */
    isHighlighted?: boolean;
    /** Whether the item is selected */
    isSelected?: boolean;
    /** Function to get props for the item */
    getItemProps: (options: UseComboboxGetItemPropsOptions<Item>) => any;
    /** Optional CSS classname for the list item */
    itemClass?: string;
    /** Children nodes to be rendered inside the list item */
    children?: React.ReactNode;
};

/**
 * ListItem component for rendering a single item in a dropdown list.
 *
 * @param {Props} props - The props for the component
 * */
const ListItem = ({
    size,
    title,
    item,
    index,
    getItemProps,
    itemClass,
    children,
    isHighlighted,
    isSelected,
}: Props): JSX.Element => {
    const { itemClassName, ...itemProps } = getItemProps({ index, item });

    return (
        <StyledListItem
            {...itemProps}
            className={itemClass ? `${itemClassName as string} ${itemClass}` : (itemClassName as string)}
            title={title}
            size={size}
            item={item}
            isHighlighted={isHighlighted}
            isSelected={isSelected}
        >
            {children}
        </StyledListItem>
    );
};
ListItem.displayName = 'ListItem';

export default React.memo(ListItem);
