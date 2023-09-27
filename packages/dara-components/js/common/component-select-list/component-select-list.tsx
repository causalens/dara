import castArray from 'lodash/castArray';
import { useCallback } from 'react';

import {
    Action,
    DynamicComponent,
    StyledComponentProps,
    Variable,
    injectCss,
    useAction,
    useComponentStyles,
    useVariable,
} from '@darajs/core';
import { ComponentSelectList as UIComponentSelectList } from '@darajs/ui-components';

import { ComponentItem } from '../types';

interface ComponentSelectListProps extends StyledComponentProps {
    /** The items to display, each should have a title, subtitle and component */
    items: Array<ComponentItem>;
    /** An optional prop to specify the number of items per row, 3 by default */
    items_per_row?: number;
    /** An optional flag for allowing selecting multiple cards, false by default */
    multi_select?: boolean;
    /** An optional Action for listening to changes in the selected items */
    on_select?: Action;
    /** The optional selected items, can be an array of titles if multiSelect is true otherwise a title */
    selected_items?: Variable<Array<string> | string>;
}

const StyledComponentSelectList = injectCss(UIComponentSelectList);

/**
 * The ComponentSelectList component creates a list of card of selectable cards containing either images or plots.
 * The plot should be passed as a component instance.
 *
 * @param {ComponentSelectListProps} props - the component props
 */
function ComponentSelectList(props: ComponentSelectListProps): JSX.Element {
    const [style, css] = useComponentStyles(props);
    const [selectedItems, setSelectedItems] = useVariable(props.selected_items);
    const [onSelect] = useAction(props.on_select);

    const updateSelectedItems = useCallback(
        (items: Array<string>): void => {
            const newSelectedItems = props.multi_select ? items : items[0] || null;
            setSelectedItems?.(newSelectedItems);
            onSelect?.(newSelectedItems);
        },
        [onSelect, props.multi_select, setSelectedItems]
    );

    // Replacing the plots with Dynamic Component with the plot as its component
    const remappedItems = props.items.map((item) => {
        return { ...item, component: <DynamicComponent component={item.component} /> };
    });

    return (
        <StyledComponentSelectList
            $rawCss={css}
            items={remappedItems}
            itemsPerRow={props.items_per_row}
            multiSelect={props.multi_select}
            onSelect={updateSelectedItems}
            selectedItems={selectedItems && castArray(selectedItems)}
            style={style}
        />
    );
}

export default ComponentSelectList;
