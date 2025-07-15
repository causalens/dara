import { useCallback, useMemo, useState } from 'react';

import {
    type Action,
    type ComponentInstance,
    DynamicComponent,
    type LayoutComponentProps,
    type Variable,
    injectCss,
    useAction,
    useComponentStyles,
    useVariable,
} from '@darajs/core';
import styled from '@darajs/styled-components';
import { Button } from '@darajs/ui-components';

import { FormCtx } from '../context';

const ButtonWrapper = styled.section`
    display: flex;
    flex-direction: row-reverse;
    gap: 0.75rem;
    justify-content: space-between;

    button {
        width: 6rem;
    }
`;

const FormWrapper = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
`;

interface FormProps extends LayoutComponentProps {
    children: Array<ComponentInstance>;
    /** Action for what happens when the button is clicked */
    onsubmit: Action;
    /** Form state */
    value: Variable<Record<string, any>>;
}

type VariablesMap = {
    [id: string]: any;
};

const StyledForm = injectCss('div');

function Form(props: FormProps): JSX.Element {
    const [formState, setFormState] = useVariable<VariablesMap>(props.value);

    const onSubmit = useAction(props.onsubmit);
    const [style, css] = useComponentStyles(props);

    const updateForm = useCallback(
        (value: any, id: string): void => {
            setFormState((oldFormState: VariablesMap) => ({ ...oldFormState, [id]: value }));
        },
        [setFormState]
    );

    const resolveInitialValue = useCallback(
        (defaultValue?: any, variable?: Variable<any>, id?: string): any => {
            if (formState?.[id]) {
                if (variable) {
                    return { ...variable, default: formState?.[id] };
                }
                return formState?.[id];
            }
            return variable ?? defaultValue;
        },
        [formState]
    );

    const pages = useMemo(() => {
        return props.children.filter((child) => child.name === 'FormPage');
    }, [props.children]);

    const [currentPage, setCurrentPage] = useState(0);

    return (
        <FormCtx.Provider value={{ formValues: formState, resolveInitialValue, updateForm }}>
            <StyledForm $rawCss={css} className={props.className} style={style}>
                {pages.length === 0 && (
                    <FormWrapper style={{ alignItems: props.align, justifyContent: props.justify }}>
                        {props.children.map((child, idx) => (
                            <DynamicComponent component={child} key={`form-${idx}-${child.uid}`} />
                        ))}
                        <ButtonWrapper>
                            {props.onsubmit && (
                                <Button onClick={() => onSubmit(formState)} styling="primary">
                                    Submit
                                </Button>
                            )}
                        </ButtonWrapper>
                    </FormWrapper>
                )}
                {pages.length > 0 && (
                    <FormWrapper>
                        <DynamicComponent component={props.children[currentPage]} />
                        <ButtonWrapper>
                            {currentPage < pages.length - 1 && (
                                <Button onClick={() => setCurrentPage(currentPage + 1)} styling="primary">
                                    Next
                                </Button>
                            )}
                            {currentPage === pages.length - 1 && props.onsubmit && (
                                <Button onClick={() => onSubmit(formState)} styling="primary">
                                    Submit
                                </Button>
                            )}
                            {currentPage > 0 && pages.length > 1 && (
                                <Button onClick={() => setCurrentPage(currentPage - 1)} outline styling="primary">
                                    Back
                                </Button>
                            )}
                        </ButtonWrapper>
                    </FormWrapper>
                )}
            </StyledForm>
        </FormCtx.Provider>
    );
}

export default Form;
