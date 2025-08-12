import { createContext, useContext, useRef } from 'react';

import { type Variable } from '@darajs/core';

import { type FormComponentProps } from '../types';

export interface FormContextValue {
    /** current form values in the format id: component value */
    formValues: Record<string, any>;
    /** defines the initial value a form component should take */
    resolveInitialValue: (defaultValue?: any, variable?: Variable<any>, id?: any) => any;
    /** defines how the form context should be updated */
    updateForm: (value: any, id?: string) => void;
}

const formCtx = createContext<FormContextValue | null>(null);

export default formCtx;

export interface UseFormContextAPI {
    /** defines the initial value a form component should take */
    resolveInitialValue: (defaultValue?: any) => any;
    /** defines how the form context should be updated */
    updateForm: (value: any) => void;
}

export function useFormContext(props: FormComponentProps): UseFormContextAPI {
    const formContext = useContext(formCtx);
    const idRef = useRef<string | null>(null);
    const isMounted = useRef(false);

    // if component is not in a form, then it doesn't need to update it
    if (formContext === null) {
        return {
            resolveInitialValue: (defaultValue?: any) => props.value ?? defaultValue,
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            updateForm: () => {},
        };
    }

    // if components in a form we check they have valid unique ids
    if (isMounted.current === false) {
        isMounted.current = true;
        if (!props.id) {
            throw new Error('Attempted to add a form interactive component without an id');
        }
        idRef.current = props.id;
    }

    const updateForm = (value: any): void => formContext.updateForm(value, idRef.current!);
    const resolveInitialValue = (defaultValue?: any): any =>
        formContext.resolveInitialValue(defaultValue, props.value, idRef.current);

    return { resolveInitialValue, updateForm };
}
