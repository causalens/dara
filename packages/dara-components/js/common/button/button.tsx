import * as React from 'react';

import {
    type Action,
    type ComponentInstance,
    type Condition,
    DisplayCtx,
    DynamicComponent,
    type StyledComponentProps,
    type Variable,
    getIcon,
    injectCss,
    useAction,
    useActionIsLoading,
    useComponentStyles,
    useConditionOrVariable,
} from '@darajs/core';
import styled from '@darajs/styled-components';
import { Button as UiButton } from '@darajs/ui-components';

import { ComponentType } from '../constants';

type OmitFromMappedType<Type, ToOmit> = {
    [Property in keyof Type as Exclude<Property, ToOmit>]: Type[Property];
};

type ButtonProps = OmitFromMappedType<StyledComponentProps, 'children'> &
    React.HTMLAttributes<HTMLButtonElement> & {
        children: Array<ComponentInstance> | string;
        /** Passthrough the className property */
        className: string;
        /** Whether to disable the button */
        disabled: boolean | Condition<any> | Variable<boolean>;
        /** Optional Icon to display in the button */
        icon: string;
        /** Action for what happens when the button is clicked */
        onclick: Action;
        /** If true the button will have the outline look, otherwise by default it takes the filled style */
        outline?: boolean;
        /** Preset styling property for the button */
        styling: 'primary' | 'secondary' | 'error' | 'ghost' | 'plain';
    };

/** Accept a boolean on whether the button is considerd simple, a simple button is one which has either a string or Text inside of it
 * This matters as if the button is complex we want it to fill available space as a Stack would
 */
interface StyledButtonProps {
    isSimpleButton: boolean;
}

const StyledButton = injectCss(styled(UiButton)<StyledButtonProps>`
    flex: ${(props) => (props.isSimpleButton ? undefined : '1 1 100%')};
`);

/**
 * The Button component creates a clickable button in the UI that can be used to trigger an action
 *
 * @param props the component props
 */
function Button(
    { children, className, disabled, icon, onclick, outline, styling, ...props }: ButtonProps,
    ref: React.ForwardedRef<HTMLElement>
): JSX.Element {
    const [style, css] = useComponentStyles(props as Omit<ButtonProps, 'children'>); // the styles hook doesn't care about children though here it's wider, includes string
    const onClick = useAction(onclick);
    const loading = useActionIsLoading(onclick);
    const disabledValue = useConditionOrVariable(disabled);

    // Extract icon and grab color from first child if it has it
    const Icon = icon ? getIcon(icon) : null;
    const iconColor = Array.isArray(children) ? children?.[0]?.props?.color || 'inherit' : 'inherit';

    return (
        <StyledButton
            $rawCss={css}
            className={className}
            disabled={disabledValue}
            isSimpleButton={typeof children === 'string' || children[0]?.name === 'Text'}
            loading={loading}
            onClick={() => onClick(null)}
            outline={outline}
            style={{
                gap: '0.75rem',
                ...style,
            }}
            styling={styling}
            ref={ref}
            {...props}
        >
            {icon && (
                <Icon
                    style={{
                        color: iconColor,
                        cursor: 'pointer',
                    }}
                />
            )}
            <DisplayCtx.Provider value={{ component: ComponentType.BUTTON, direction: 'horizontal' }}>
                {typeof children === 'string' ?
                    children
                :   children.map((child) => <DynamicComponent component={child} key={`button-${child.uid}`} />)}
            </DisplayCtx.Provider>
        </StyledButton>
    );
}

export default React.forwardRef(Button);
