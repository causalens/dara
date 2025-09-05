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
interface GridProps extends LayoutComponentProps {
    /** object containing when each of the five breakpoints should occur */
    breakpoints: Breakpoints;
    /** array of children of Grid component */
    children: Array<ComponentInstance>;
    /** css row-gap property */
    row_gap?: string;
}

const GridComponent = styled.div`
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
`;

const StyledGrid = injectCss(GridComponent);

/**
 * Grid component
 *
 * @param props Grid component props
 */
function Grid(props: GridProps): JSX.Element {
    const breakpoints = {
        lg: props?.breakpoints?.lg ?? 992,
        md: props?.breakpoints?.md ?? 768,
        sm: props?.breakpoints?.sm ?? 576,
        xl: props?.breakpoints?.xl ?? 1200,
        xs: props?.breakpoints?.xs ?? 0,
    };
    const [style, css] = useComponentStyles(props);
    const _children = props.children.map((child) => {
        return {
            ...child,
            props: {
                ...child.props,
                breakpoints,
                row_gap: props.row_gap,
            },
        };
    });

    return (
        <StyledGrid
            id={props.id_}
            $rawCss={css}
            className={props.className}
            style={{
                alignItems: props.align,
                justifyContent: props.justify,
                rowGap: props.row_gap,
                ...style,
            }}
        >
            <DisplayCtx.Provider value={{ component: 'grid', direction: 'vertical', hug: props.hug }}>
                {_children.map((child, idx) => (
                    <DynamicComponent component={child} key={`grid-${idx}-${child.uid}`} />
                ))}
            </DisplayCtx.Provider>
        </StyledGrid>
    );
}

export default Grid;
