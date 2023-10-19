/* eslint-disable react-hooks/exhaustive-deps */

import { isArray } from 'lodash';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
    SingleVariable,
    UrlVariable,
    Variable,
    injectCss,
    useAction,
    useComponentStyles,
    useVariable,
} from '@darajs/core';
import {
    ComboBox,
    Item,
    ListItem,
    ListSection,
    MultiSelect,
    SectionedList,
    Select as UiSelect,
} from '@darajs/ui-components';

import { useFormContext } from '../context';
import { FormComponentProps } from '../types';

export function getMultiselectItems(values: Array<any>, items: Array<Item>): Array<Item> {
    if (!values) {
        return;
    }
    return items.reduce((acc: Array<Item>, item: Item) => {
        const stringOfValues = values.map((value) => String(value));
        if (stringOfValues.includes(String(item.value))) {
            return [...acc, item];
        }
        return acc;
    }, []);
}

const toItem = (value: any): Item | undefined | null =>
    typeof value === 'string' || typeof value === 'number' ? { label: String(value), value } : value;

const StyledSelect = injectCss(UiSelect);
const StyledMultiSelect = injectCss(MultiSelect);
const StyledComboBox = injectCss(ComboBox);
const StyledSectionedList = injectCss(SectionedList);

function hasListSection(items: Item[] | ListSection[]): items is ListSection[] {
    return items.length > 0 && 'items' in items[0];
}

function isStringArray(value: any): value is string[] {
    return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
interface SelectProps extends FormComponentProps {
    /** Pass through the className property */
    className: string;
    /** The list of items to choose from */
    items: Array<Item> | Variable<Item[]> | Array<ListSection> | Variable<Array<ListSection>>;
    /** Optional number of rows to display in multiselect mode */
    max_rows?: number;
    /** Select multiple list items if True */
    multiselect: boolean;
    /** Placeholder to show when select is empty */
    placeholder?: string;
    /** Searchable list if True */
    searchable: boolean;
    /** The selectedItem variable to read and update */
    // eslint-disable-next-line react/no-unused-prop-types
    value?: SingleVariable<any> | UrlVariable<any>;
}

// Disabling rules-of-hook as the assumption is that props changing the type of the select won't change
/* eslint-disable react-hooks/rules-of-hooks */
/**
 * The select component accepts a value Variable from the backend and allows the user to view and edit that variable
 * from a selection of items provided in another prop. The value shared with the rest of the system is the value field
 * from the currently selected item. Also takes a multiselect and searchable options that, respectively, enable multiple
 * items to be selected and the list to be searchable if true.
 *
 * @param props the component props
 */
function Select(props: SelectProps): JSX.Element {
    const formCtx = useFormContext(props);
    const [items] = useVariable(props.items);
    const [style, css] = useComponentStyles(props);
    const [value, setValue] = useVariable(formCtx.resolveInitialValue());

    // In the case of a Variable or DerivedVariable we could end up with an array of strings instead of items, so we need to convert them if that happens
    const formattedItems = useMemo(() => {
        if (isStringArray(items)) {
            return items.map((item) => ({ badge: null, image: null, label: item, value: item }));
        }
        return items;
    }, [items]);

    const [onChangeAction] = useAction(props.onchange);

    //  if someone were to update the component rule of Hooks could be broken if items switched from having sections to not, so we use a ref for this to be only run once
    const itemHasListSection = useRef(null);

    if (itemHasListSection.current === null) {
        itemHasListSection.current = hasListSection(formattedItems);
    }

    // For multiselect we want to keep the initial value type consistent with later selections
    useEffect(() => {
        if (props.multiselect && value !== undefined && !Array.isArray(value)) {
            throw new Error('Value for multiselect should be a Variable instance of an array');
        }
    }, []);

    if (itemHasListSection.current) {
        const [selectedItem, setSelectedItem] = useState<ListItem>({ label: value, value });

        const onSelect = useCallback(
            (item: ListItem) => {
                setSelectedItem(item);
                setValue(item.value);
            },
            [setValue]
        );

        // Handle this way to prevent an infinite loop in the ui component due to referential comparison of selectedItem
        useEffect(() => {
            if (value !== selectedItem.value) {
                setSelectedItem({ label: value, value });
            }
        }, [value]);
        return (
            <StyledSectionedList
                $rawCss={css}
                items={formattedItems}
                onSelect={onSelect}
                selectedItem={selectedItem}
                style={style}
            />
        );
    }

    // We need to redefine items as the type is not known at this point
    const itemArray = formattedItems as Array<Item>;
    if (props.multiselect) {
        const explicitValues = isArray(value) ? value.map(toItem) : value;
        const [selectedItems, setSelectedItems] = useState(explicitValues ?? getMultiselectItems(value, itemArray));
        const onSelect = useCallback(
            (_items: Array<Item>) => {
                const currentSelection = _items.map((item: Item) => item.value);
                setSelectedItems(getMultiselectItems(currentSelection, itemArray));
                setValue(currentSelection);
                onChangeAction(currentSelection);
                formCtx.updateForm(currentSelection);
            },
            [setValue]
        );
        // The loop up to the value in recoil state is too slow for downshift and leads to a race condition that makes
        // it fail to update the value sometimes. By keeping a local copy of the value and updating it like this we fix
        // the race condition and respect the main value if it is updated elsewhere.
        useEffect(() => {
            setSelectedItems(getMultiselectItems(value, itemArray));
        }, [formattedItems, value]);
        return (
            <StyledMultiSelect
                $rawCss={css}
                className={props.className}
                items={itemArray}
                maxRows={props.max_rows}
                onSelect={onSelect}
                placeholder={props.placeholder}
                selectedItems={selectedItems}
                style={style}
            />
        );
    }
    const explicitValue = toItem(value);
    const [selectedItem, setSelectedItem] = useState(
        explicitValue ?? itemArray.find((item) => String(item.value) === String(value))
    );
    const onSelect = useCallback(
        (item: Item) => {
            if (item) {
                setSelectedItem(item);
                setValue(item.value);
                onChangeAction(item.value);
                formCtx.updateForm(item.value);
            }
        },
        [setValue, onChangeAction]
    );
    // See explanation above
    useEffect(() => {
        const selected = explicitValue ?? itemArray.find((item) => item.value === value);
        setSelectedItem(selected !== undefined ? selected : null);
    }, [formattedItems, value]);
    if (props.searchable) {
        return (
            <StyledComboBox
                $rawCss={css}
                className={props.className}
                items={itemArray}
                onSelect={onSelect}
                placeholder={props.placeholder}
                selectedItem={selectedItem}
                style={style}
            />
        );
    }

    return (
        <StyledSelect
            $rawCss={css}
            className={props.className}
            items={itemArray}
            onSelect={onSelect}
            placeholder={props.placeholder}
            selectedItem={selectedItem}
            style={style}
        />
    );
}

export default Select;
