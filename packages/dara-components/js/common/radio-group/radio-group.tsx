/* eslint-disable react-hooks/exhaustive-deps */

import { useCallback } from 'react';

import { Variable, injectCss, useAction, useComponentStyles, useVariable } from '@darajs/core';
import { Item, RadioGroup as UiRadio } from '@darajs/ui-components';

import { useFormContext } from '../context';
import { FormComponentProps } from '../types';

const StyledRadio = injectCss(UiRadio);

interface RadioGroupProps extends FormComponentProps {
    /** Pass through the className property */
    className: string;
    /** An optional value which determines the direction of the radio group components by default is vertical */
    direction?: 'horizontal' | 'vertical';
    /** The list of items to choose from */
    items: Array<Item> | Variable<Item[]>;
    /** Whether to show radio in list style */
    list_styling?: boolean;
}

// Disabling rules-of-hook as the assumption is that props changing the type of the select won't change
/* eslint-disable react-hooks/rules-of-hooks */
/**
 * The RadioGroup component allows users to choose from a list of radio buttons.
 *
 * @param props the component props
 */
function RadioGroup(props: RadioGroupProps): JSX.Element {
    const formCtx = useFormContext(props);
    const [items] = useVariable(props.items);
    const [value, setValue] = useVariable(formCtx.resolveInitialValue([]));
    const [style, css] = useComponentStyles(props);
    const [onChangeAction] = useAction(props.onchange);

    const onChange = useCallback(
        (values: Item) => {
            setValue(values.value);
            onChangeAction(values.value);
            formCtx.updateForm(values.value);
        },
        [setValue]
    );

    return (
        <StyledRadio
            $rawCss={css}
            className={props.className}
            direction={props.direction}
            isListStyle={props.list_styling}
            items={items}
            onChange={onChange}
            style={style}
            value={items.find((item) => item.value === value) ?? null}
        />
    );
}

export default RadioGroup;
