import {
    Action,
    ComponentInstance,
    Condition,
    DisplayCtx,
    DynamicComponent,
    StyledComponentProps,
    Variable,
    getIcon,
    injectCss,
    useAction,
    useActionIsLoading,
    useComponentStyles,
    useVariable,
} from '@darajs/core';
import styled from '@darajs/styled-components';
import { Button as UiButton } from '@darajs/ui-components';

import { ComponentType } from '../constants';
import { isConditionTrue } from '../if/if';

type OmitFromMappedType<Type, ToOmit> = {
    [Property in keyof Type as Exclude<Property, ToOmit>]: Type[Property];
};

interface ButtonProps extends OmitFromMappedType<StyledComponentProps, 'children'> {
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
}

/** Check if an object is a condition */
function isCondition(condition: any): condition is Condition<any> {
    return condition && !!condition.operator;
}

// Assume the arg won't change from a variable to a condition
/* eslint-disable react-hooks/rules-of-hooks */
/** Accept a condition or variable object and extract the value from it */
function useConditionOrVariable(arg: boolean | Variable<boolean> | Condition<boolean>): boolean {
    if (isCondition(arg)) {
        const value = useVariable(arg.variable)[0];
        const other = useVariable(arg.other)[0];
        return isConditionTrue(arg.operator, value, other);
    }
    return useVariable(arg)[0];
}

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
function Button(props: ButtonProps): JSX.Element {
    const [style, css] = useComponentStyles(props as Omit<ButtonProps, 'children'>); // the styles hook doesn't care about children though here it's wider, includes string
    const onClick = useAction(props.onclick);
    const loading = useActionIsLoading(props.onclick);
    const disabled = useConditionOrVariable(props.disabled);

    // Extract icon and grab color from first child if it has it
    const Icon = props.icon ? getIcon(props.icon) : null;
    const iconColor = Array.isArray(props.children) ? props.children?.[0]?.props?.color || 'inherit' : 'inherit';

    return (
        <StyledButton
            $rawCss={css}
            className={props.className}
            disabled={disabled}
            isSimpleButton={typeof props.children === 'string' || props.children[0]?.name === 'Text'}
            loading={loading}
            onClick={() => onClick(null)}
            outline={props.outline}
            style={{
                gap: '0.75rem',
                ...style,
            }}
            styling={props.styling}
        >
            {props.icon && (
                <Icon
                    style={{
                        color: iconColor,
                        cursor: 'pointer',
                    }}
                />
            )}
            <DisplayCtx.Provider value={{ component: ComponentType.BUTTON, direction: 'horizontal' }}>
                {typeof props.children === 'string' ?
                    props.children
                :   props.children.map((child) => <DynamicComponent component={child} key={`button-${child.uid}`} />)}
            </DisplayCtx.Provider>
        </StyledButton>
    );
}

export default Button;
