/* eslint-disable react-hooks/exhaustive-deps */
import _debounce from 'lodash/debounce';
import { useEffect, useMemo, useState } from 'react';

import { type Variable, injectCss, useAction, useComponentStyles, useVariable } from '@darajs/core';
import { Textarea as UITextarea } from '@darajs/ui-components';

import { useFormContext } from '../context';
import { type FormComponentProps } from '../types';

interface TextareaProps extends FormComponentProps {
    /** If true, cursor will start in the textarea */
    autofocus: boolean;
    /** An optional property which sets whether the textarea is resizable, and if so, in which directions */
    resize?: 'none' | 'both' | 'horizontal' | 'vertical' | 'block' | 'inline';
    /** A text variable that supplies the default value and updates when text is entered */
    // eslint-disable-next-line react/no-unused-prop-types
    value?: Variable<string>;
}

const StyledTextarea = injectCss(UITextarea);

/**
 * A component that creates a textarea. The text is stored as a variable and updated as the user types in the
 * given area. If autofocus is true, cursor begins in the textarea.
 *
 * @param {TextareaProps} props - the component props
 */
function Textarea(props: TextareaProps): JSX.Element {
    const formCtx = useFormContext(props);
    const [style, css] = useComponentStyles(props);
    const [value, setValue] = useVariable(formCtx.resolveInitialValue());
    const [internalValue, setInternalValue] = useState(value);
    const onInputAction = useAction(props.onchange);

    const debouncedAction = useMemo(() => _debounce(onInputAction, 300), [onInputAction]);
    const debouncedSetValue = useMemo(() => _debounce(setValue, 300), [setValue]);
    const debouncedUpdateForm = useMemo(() => _debounce(formCtx.updateForm, 300), [formCtx.updateForm]);

    function handleChange(val: string): void {
        // immediately update internal state
        setInternalValue(val);

        // debounce the update to the variable and the form to prevent multiple updates being fired at once
        debouncedSetValue(val);
        debouncedAction(val);
        debouncedUpdateForm(val);
    }

    useEffect(() => {
        // cancel in-progress debounced updates to make sure the variable value takes precedence
        debouncedSetValue.cancel();
        debouncedUpdateForm.cancel();

        // Sync the internal value with the variable value when the variable value changes
        setInternalValue(value);
    }, [value]);

    return (
        <StyledTextarea
            id={props.id_}
            $rawCss={css}
            autoFocus={props.autofocus}
            onChange={handleChange}
            resize={props.resize}
            style={style}
            value={internalValue}
        />
    );
}

export default Textarea;
