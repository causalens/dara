import isEmpty from 'lodash/isEmpty';
import isEqual from 'lodash/isEqual';
import isNil from 'lodash/isNil';
import isObject from 'lodash/isObject';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';

import {
    type SingleVariable,
    type Variable,
    injectCss,
    useAction,
    useComponentStyles,
    useVariable,
} from '@darajs/core';
import {
    ComboBox,
    type Item,
    type ListItem,
    type ListSection,
    MultiSelect,
    SectionedList,
    Select as UiSelect,
} from '@darajs/ui-components';

import { useFormContext } from '../context';
import { type FormComponentProps } from '../types';

// Type guard for primitive values to avoid "[object Object]" string conversion
const isPrimitive = (val: unknown): val is string | number | boolean => !isNil(val) && !isObject(val);

export function getMultiselectItems(values: Array<unknown>, items: Array<Item>): Array<Item> {
    if (!values) {
        return [];
    }

    return items.reduce((acc: Array<Item>, item: Item) => {
        // Filter out non-primitives before stringification
        const stringOfValues = values.filter(isPrimitive).map(String);

        // Only compare if item.value is a primitive
        if (isPrimitive(item.value) && stringOfValues.includes(String(item.value))) {
            return [...acc, item];
        }

        return acc;
    }, []);
}

const StyledSelect = injectCss(UiSelect);
const StyledMultiSelect = injectCss(MultiSelect);
const StyledComboBox = injectCss(ComboBox);
const StyledSectionedList = injectCss(SectionedList);

function hasListSection(items: Item[] | ListSection[]): items is ListSection[] {
    return items.length > 0 && 'items' in items[0]!;
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/** Type guard to check if an object is an Item */
function isItem(obj: unknown): obj is Item {
    return (obj && Object.prototype.hasOwnProperty.call(obj, 'value')) as boolean;
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
    value?: SingleVariable<any>;
    /** Optional font size for the select component, in REM units */
    size?: number;
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

    // Some combination of recoil state changes and downshift can cause an infinite loop when selecting a new value
    // This prevents infinite rerenders by always using the latest value
    const valueRef = useRef(value);
    useLayoutEffect(() => {
        valueRef.current = value;
    }, [value]);

    // In the case of a Variable or DerivedVariable we could end up with an array of strings instead of items, so we need to convert them if that happens
    const formattedItems = useMemo(() => {
        if (isStringArray(items)) {
            return items.map(
                (item) =>
                    ({
                        badge: undefined,
                        image: undefined,
                        label: item,
                        value: item,
                    }) as Item
            );
        }
        return items;
    }, [items]);

    /**
     * Converts a value to an Item, or finds a matching Item in formattedItems based on value.
     * @param val - The value to be converted or matched.
     */
    const toItem = useCallback(
        (val: unknown): Item | undefined | null => {
            // Tries to get matching item based on value from formattedItems
            const matchingItem = formattedItems.find((item) => {
                if (isItem(item)) {
                    // For primitives, compare string values
                    if (isPrimitive(item.value) && isPrimitive(val)) {
                        return String(item.value) === String(val);
                    }
                    // For objects, check equality directly
                    return isEqual(item.value, val);
                }
                return false;
            });
            // If a matching Item is found return it
            if (matchingItem) {
                return matchingItem as Item;
            }
            // Otherwise return the item as an Item type with the value as the label, so that select can still show a value even if not present in the list
            return isPrimitive(val) ? { label: String(val), value: val } : (val as Item);
        },
        [formattedItems]
    );

    const onChangeAction = useAction(props.onchange);

    //  if someone were to update the component rule of Hooks could be broken if items switched from having sections to not, so we use a ref for this to be only run once
    const itemHasListSection = useRef<boolean | null>(null);

    if (itemHasListSection.current === null) {
        itemHasListSection.current = hasListSection(formattedItems);
    }

    // For multiselect we want to keep the initial value type consistent with later selections
    useEffect(() => {
        if (props.multiselect && value !== undefined && !Array.isArray(value)) {
            throw new Error('Value for multiselect should be a Variable instance of an array');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (itemHasListSection.current) {
        const onSelect = useCallback(
            (item: ListItem) => {
                if (item && item.value !== valueRef.current) {
                    setValue(item.value);
                }
            },
            [setValue]
        );

        const selectedItem = useMemo(() => toItem(value), [value, toItem]);
        return (
            <StyledSectionedList
                id={props.id_}
                $rawCss={css}
                items={formattedItems}
                placeholder={props.placeholder}
                onSelect={onSelect}
                selectedItem={selectedItem as any}
                size={props.size}
                style={style}
            />
        );
    }

    // We need to redefine items as the type is not known at this point
    const itemArray = formattedItems as Array<Item>;

    if (props.multiselect) {
        const onSelect = useCallback(
            (_items: Array<Item>) => {
                const currentSelection = _items.map((item: Item) => item.value);
                if (
                    !isEqual(currentSelection, Array.isArray(valueRef.current) ? valueRef.current : [valueRef.current])
                ) {
                    setValue(currentSelection);
                    onChangeAction(currentSelection);
                    formCtx.updateForm(currentSelection);
                }
            },
            [formCtx, onChangeAction, setValue]
        );

        const selectedItems = useMemo(() => {
            const found = getMultiselectItems(value, itemArray);
            const explicitValues = Array.isArray(value) ? value.map(toItem) : value;
            return isEmpty(found) ? explicitValues ?? null : found;
        }, [itemArray, toItem, value]);

        return (
            <StyledMultiSelect
                id={props.id_}
                $rawCss={css}
                className={props.className}
                items={itemArray}
                maxRows={props.max_rows}
                onSelect={onSelect}
                placeholder={props.placeholder}
                selectedItems={selectedItems}
                size={props.size}
                style={style}
            />
        );
    }

    const selectedItem = useMemo(
        () => itemArray.find((item) => String(item.value) === String(value)) ?? toItem(value) ?? null,
        [itemArray, toItem, value]
    );

    const onSelect = useCallback(
        (item: Item) => {
            if (item && item.value !== valueRef.current) {
                setValue(item.value);
                onChangeAction(item.value);
                formCtx.updateForm(item.value);
            }
        },
        [setValue, onChangeAction, formCtx]
    );

    if (props.searchable) {
        return (
            <StyledComboBox
                id={props.id_}
                $rawCss={css}
                className={props.className}
                items={itemArray}
                onSelect={onSelect}
                placeholder={props.placeholder}
                selectedItem={selectedItem as any}
                size={props.size}
                style={style}
            />
        );
    }

    return (
        <StyledSelect
            id={props.id_}
            $rawCss={css}
            className={props.className}
            items={itemArray}
            onSelect={onSelect}
            placeholder={props.placeholder}
            selectedItem={selectedItem as any}
            size={props.size}
            style={style}
        />
    );
}

export default Select;
