/* eslint-disable react-hooks/exhaustive-deps */
import { useCallback } from 'react';

import { type Variable, injectCss, useAction, useComponentStyles, useVariable } from '@darajs/core';
import { type Item, CheckboxGroup as UiCheckbox } from '@darajs/ui-components';

import { useFormContext } from '../context';
import { type FormComponentProps } from '../types';

const StyledCheckbox = injectCss(UiCheckbox);

interface CheckboxGroupProps extends FormComponentProps {
    /** Pass through the className property */
    className: string;
    /** The list of items to choose from */
    items: Array<Item> | Variable<Item[]>;
    /** Whether to show checkboxes in list style */
    list_styling: boolean;
    /** The number of items that can be selected at one time */
    select_max: number;
    /** The minimum number of items that should be selected at one time */
    select_min: number;
}

// Disabling rules-of-hook as the assumption is that props changing the type of the select won't change
/* eslint-disable react-hooks/rules-of-hooks */
/**
 * The CheckboxGroup component allows users to choose from a list of checkboxes. Checkboxes can also have a maximum number of
 * items which may be selected at one given time.
 *
 * @param props the component props
 */
function CheckboxGroup(props: CheckboxGroupProps): JSX.Element {
    const formCtx = useFormContext(props);
    const [items] = useVariable(props.items);
    const [value, setValue] = useVariable(formCtx.resolveInitialValue([]));
    const [style, css] = useComponentStyles(props);
    const onChangeAction = useAction(props.onchange);

    const onChange = useCallback(
        (values: Item | Array<Item>) => {
            let newValues;

            if (Array.isArray(values)) {
                newValues = values.map((item) => item.value);
            } else {
                newValues = values.value;
            }

            setValue(newValues);
            onChangeAction(newValues);
            formCtx.updateForm(newValues);
        },
        [setValue]
    );

    return (
        <StyledCheckbox
            id={props.id_}
            $rawCss={css}
            className={props.className}
            isListStyle={props.list_styling}
            items={items}
            onChange={onChange}
            selectMax={props.select_max}
            selectMin={props.select_min}
            style={style}
            values={items.filter((item: Item) => value?.includes(item.value))}
        />
    );
}

export default CheckboxGroup;
