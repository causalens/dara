import { type ForwardedRef, forwardRef } from 'react';
import AutoSizer from 'react-virtualized-auto-sizer';

import {
    type ComponentInstance,
    DisplayCtx,
    DynamicComponent,
    type LayoutComponentProps,
    type Variable,
    injectCss,
    useComponentStyles,
    useVariable,
} from '@darajs/core';
import styled from '@darajs/styled-components';

// The props are actually used deep within the useComponentStyles etc hooks
/* eslint-disable react/no-unused-prop-types */
interface StackProps extends LayoutComponentProps {
    children: Array<ComponentInstance>;
    className: string;
    collapsed: Variable<boolean>;
    direction: 'horizontal' | 'vertical';
    hug?: boolean;
    scroll: boolean;
}

function getCollapseStyles(collapsed: boolean): React.CSSProperties {
    if (collapsed) {
        return {
            display: 'none',
        };
    }
    return {};
}

const StyledStack = injectCss(styled.div<StackProps>`
    display: flex;
    flex: 1 1 100%;
    flex-direction: ${(props) => (props.direction === 'horizontal' ? 'row' : 'column')};
    gap: 0.75rem;

    width: ${(props) => (props.direction === 'horizontal' ? undefined : '100%')};
    height: ${(props) => (props.direction === 'horizontal' ? '100%' : undefined)};
`);

function Stack(props: StackProps, ref: ForwardedRef<HTMLDivElement>): JSX.Element {
    const [collapsed] = useVariable(props.collapsed);
    // Default hug to false for Stack — when the server excludes hug=false (the default),
    // props.hug is undefined. Without this, undefined would cause hug-inheritance from
    // the parent DisplayCtx, which is incorrect for Stack's default behavior.
    const resolvedProps = props.hug == null ? { ...props, hug: false } : props;
    const [style, css] = useComponentStyles(resolvedProps);

    const stackContent = (
        <DisplayCtx.Provider value={{ component: 'stack', direction: props.direction }}>
            {props.children.map((child, idx) => (
                <DynamicComponent component={child} key={`stack-${idx}-${child.uid}`} />
            ))}
        </DisplayCtx.Provider>
    );

    return (
        <StyledStack
            id={props.id_}
            $rawCss={css}
            className={props.className}
            data-type="children-wrapper"
            direction={props.direction}
            ref={ref}
            style={{
                alignItems: props.align,
                justifyContent: props.justify,
                ...getCollapseStyles(collapsed),
                ...style,
            }}
        >
            {props.scroll ?
                <AutoSizer>
                    {({ height, width }) => (
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: props.direction === 'horizontal' ? 'row' : 'column',
                                gap: style.gap ?? '0.75rem',
                                height,
                                overflow: 'auto',
                                width,
                            }}
                        >
                            {stackContent}
                        </div>
                    )}
                </AutoSizer>
            :   stackContent}
        </StyledStack>
    );
}

export default forwardRef(Stack);
