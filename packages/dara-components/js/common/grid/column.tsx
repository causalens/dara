import {
    type ComponentInstance,
    DisplayCtx,
    DynamicComponent,
    type LayoutComponentProps,
    injectCss,
    useComponentStyles,
} from '@darajs/core';
import styled from '@darajs/styled-components';

import { type Breakpoints } from '../types';

/* eslint-disable react/no-unused-prop-types */
export interface ColumnProps extends LayoutComponentProps {
    /** array of children of column */
    children: Array<ComponentInstance>;
    /** An optional value which determines the direction of the Column children by default is horizontal */
    direction?: 'horizontal' | 'vertical';
    /** how many columns should this column be offset by */
    offset?: number | Breakpoints;
    /** how many columns should this column span */
    span?: number | Breakpoints;
}

const ColumnComponent = injectCss(styled.div<ColumnProps>`
    overflow: visible;
    display: flex;
    flex: 1 1 auto;
    flex-direction: ${(props) => (props.direction === 'horizontal' ? 'row' : 'column')};
    gap: 0.75rem;
`);

const StyledColumn = injectCss(ColumnComponent);

/**
 * Grid Column component
 *
 * @param props Column component props
 */
function Column(props: ColumnProps): JSX.Element {
    const [style, css] = useComponentStyles(props);
    return (
        <StyledColumn
            id={props.id_}
            $rawCss={css}
            className={props.className}
            direction={props.direction}
            style={{
                alignItems: props.align,
                justifyContent: props.justify,
                ...style,
            }}
        >
            <DisplayCtx.Provider value={{ component: 'column', direction: props.direction ?? 'vertical' }}>
                {props.children.map((child, idx) => (
                    <DynamicComponent component={child} key={`cell-${idx}-${child.uid}`} />
                ))}
            </DisplayCtx.Provider>
        </StyledColumn>
    );
}

export default Column;
