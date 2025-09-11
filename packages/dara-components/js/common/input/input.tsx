import _debounce from 'lodash/debounce';
import { useEffect, useMemo, useState } from 'react';

import { type Variable, injectCss, useAction, useComponentStyles, useVariable } from '@darajs/core';
import { Input as UiInput, NumericInput as UiNumericInput } from '@darajs/ui-components';
import { useLatestRef } from '@darajs/ui-utils';

import { useFormContext } from '../context';
import { type FormComponentProps } from '../types';

interface InputProps extends FormComponentProps {
    /** Passthrough the className property */
    className: string;
    /** Placeholder to show when inputs is empty */
    placeholder?: string;
    /** Input type attribute */
    type?: string;
    /** The value Variable to display and update */
    // eslint-disable-next-line react/no-unused-prop-types
    value?: Variable<string>;
}

const StyledInput = injectCss(UiInput);
const StyledNumericInput = injectCss(UiNumericInput);

function getNumericValue(value: string | number): number | null {
    return value == null || Number.isNaN(Number(value)) ? null : Number(value);
}
/**
 * The input component accepts a value Variable from the backend and allows the user to view and edit that variable.
 *
 * @param props the component props
 */
function Input(props: InputProps): JSX.Element {
    const formCtx = useFormContext(props);
    const [style, css] = useComponentStyles(props);
    const [value, setValue] = useVariable(formCtx.resolveInitialValue());
    const [internalValue, setInternalValue] = useState<string | number | null>(value);
    const onInputAction = useAction(props.onchange);

    const debouncedAction = useMemo(() => _debounce(onInputAction, 300), [onInputAction]);
    const debouncedSetValue = useMemo(() => _debounce(setValue, 300), [setValue]);
    const debouncedUpdateForm = useMemo(() => _debounce(formCtx.updateForm, 300), [formCtx.updateForm]);

    function handleChange(val: string | number): void {
        let newValue: string | number | null = val;
        if (props.type === 'number') {
            newValue = getNumericValue(newValue);
        }
        // Immediately update internal state
        setInternalValue(newValue);
        // Debounce the update to the variable and the form to prevent multiple updates being fired at once
        debouncedSetValue(newValue);
        debouncedAction(newValue);
        debouncedUpdateForm(newValue);
    }

    const debouncedUpdateFormRef = useLatestRef(debouncedUpdateForm);
    const debouncedSetValueRef = useLatestRef(debouncedSetValue);

    useEffect(() => {
        // cancel in-progress debounced updates to make sure the variable value takes precedence
        debouncedSetValueRef.current.cancel();
        debouncedUpdateFormRef.current.cancel();

        // If value has been coerced to string convert it back to number for NumericInput
        let newValue = value;
        if (props.type === 'number') {
            newValue = getNumericValue(newValue);
        }
        // Sync the internal value with the variable value when the variable value changes
        setInternalValue(newValue);
    }, [debouncedSetValueRef, debouncedUpdateFormRef, props.type, value]);

    if (props.type === 'number') {
        return (
            <StyledNumericInput
                id={props.id_}
                $rawCss={css}
                className={props.className}
                onChange={(e) => handleChange(String(e))}
                placeholder={props.placeholder}
                stepper
                style={style}
                value={internalValue as number}
            />
        );
    }
    return (
        <StyledInput
            id={props.id_}
            $rawCss={css}
            className={props.className}
            onChange={handleChange}
            placeholder={props.placeholder}
            style={style}
            type={props.type}
            value={internalValue as string}
        />
    );
}

export default Input;
