import { ComponentInstance, DynamicComponent, StyledComponentProps, injectCss, useComponentStyles } from '@darajs/core';
import styled from '@darajs/styled-components';

/* eslint-disable react/no-unused-prop-types */
export interface LabelProps extends StyledComponentProps {
    /** children to add label to */
    children: Array<ComponentInstance>;
    /** Pass through the className property */
    className: string;
    /** An optional value which determines the label placement */
    direction?: 'horizontal' | 'vertical';
    /** An optional value which determines the width of the label */
    label_width?: string;
    /** An optional value to be displayed next to or above children */
    value: string | ComponentInstance;
}

const StyledLabel = injectCss(styled.label`
    display: flex;
    flex-grow: 0 !important;
    gap: 0.5rem;
    align-items: flex-start;

    font-size: 1rem;
`);

/**
 * Label component, adds a Label to an Interactive component
 *
 * @param props Label component props
 */
function Label(props: LabelProps): JSX.Element {
    const [style, css] = useComponentStyles(props);
    return (
        <StyledLabel
            $rawCss={css}
            className={props.className}
            style={{
                flexDirection: props.direction === 'horizontal' ? 'row' : 'column',
                ...style,
            }}
        >
            {typeof props.value === 'string' ? (
                <span
                    style={{
                        alignItems: 'center',
                        display: 'flex',
                        height: props.direction === 'horizontal' ? '2.5rem' : 'auto',
                        width: props.label_width ?? 'auto',
                    }}
                >
                    {props.value}
                </span>
            ) : (
                <DynamicComponent component={props.value} />
            )}
            {props.children.map((child, idx) => (
                <DynamicComponent component={child} key={`cell-${idx}-${child.uid}`} />
            ))}
        </StyledLabel>
    );
}

export default Label;
