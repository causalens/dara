/* eslint-disable react-hooks/exhaustive-deps */
import { useCallback, useMemo } from 'react';

import {
    type ComponentInstance,
    DynamicComponent,
    type Variable,
    injectCss,
    useAction,
    useComponentStyles,
    useVariable,
} from '@darajs/core';
import { type RadioItem as UIRadioItem, RadioGroup as UiRadio } from '@darajs/ui-components';

import { useFormContext } from '../context';
import { type FormComponentProps } from '../types';

const StyledRadio = injectCss(UiRadio);

interface RadioItem {
    value: any;
    label: ComponentInstance | string;
}

interface RadioGroupProps extends FormComponentProps {
    /** Pass through the className property */
    className: string;
    /** An optional value which determines the direction of the radio group components by default is vertical */
    direction?: 'horizontal' | 'vertical';
    /** The list of items to choose from */
    items: Array<RadioItem> | Variable<RadioItem[]>;
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
    const [rawItems] = useVariable(props.items);
    const items = useMemo<UIRadioItem[]>(() => {
        return rawItems.map((item) => ({
            value: item.value,
            label: typeof item.label === 'string' ? item.label : <DynamicComponent component={item.label} />,
        }));
    }, [rawItems]);
    const [value, setValue] = useVariable(formCtx.resolveInitialValue([]));
    const [style, css] = useComponentStyles(props);
    const onChangeAction = useAction(props.onchange);

    const onChange = useCallback(
        (values: UIRadioItem) => {
            setValue(values.value);
            onChangeAction(values.value);
            formCtx.updateForm(values.value);
        },
        [setValue]
    );

    return (
        <StyledRadio
            id={props.id_}
            $rawCss={css}
            className={props.className}
            direction={props.direction}
            isListStyle={props.list_styling}
            items={items}
            onChange={onChange}
            style={style}
            // @ts-expect-error incorrect type in ui-components
            value={items.find((item) => item.value === value) ?? null}
        />
    );
}

export default RadioGroup;
