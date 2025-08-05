/* eslint-disable react-hooks/exhaustive-deps */
import { useMemo } from 'react';

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
import { type ColumnProps } from './column';

/* eslint-disable react/no-unused-prop-types */
interface RowProps extends LayoutComponentProps {
    /** object containing when each of the five breakpoints should occur */
    breakpoints: Breakpoints;
    /** array of children of Row component */
    children: Array<ColumnInstance>;
    /** css column-gap property */
    column_gap?: number;
    /** css row-gap property */
    row_gap?: string;
}

const RowComponent = styled.div`
    display: flex;
    flex: 1 1 auto;
    flex-flow: row wrap;
`;

type ColumnInstance = ComponentInstance<ColumnProps>;

// Defines the max column spaces available in a row
const MAX_COLUMNS = 12;

/**
 * Given the breakpoint, finds the value of the span that column should take
 *
 * @param span span of child can either be a number or a Breakpoints object
 * @param breakpoint the breakpoint to consider the span for
 * @param breakpoints an object containing when all of the breakpoints happen
 */
function getSpanForBreakpoint(span: number | Breakpoints | null | undefined, breakpoint: number, breakpoints: Breakpoints): number | null {
    if (typeof span === 'number') {
        return span;
    }

    if (span?.xl && breakpoints.xl <= breakpoint) {
        return span.xl;
    }
    if (span?.lg && breakpoints.lg <= breakpoint) {
        return span.lg;
    }
    if (span?.md && breakpoints.md <= breakpoint) {
        return span.md;
    }
    if (span?.sm && breakpoints.sm <= breakpoint) {
        return span.sm;
    }
    if (span?.xs && breakpoint < breakpoints.sm) {
        return span.xs;
    }
    // no span can be defined return null, so it can be calculated on available space
    return null;
}

/**
 * Calculates the available space for a columns of undefined span
 *
 * @param row an array containing all children in that row
 * @param breakpoint the breakpoint to consider the cell width by
 * @param breakpoints an object containing when all of the breakpoints happen
 */
function getCellWidthByRow(row: Array<ColumnInstance>, breakpoint: number, breakpoints: Breakpoints): number {
    const totalAssignedSpan = row
        .filter((column) => column.props.span !== null && column.props.span !== undefined)
        .reduce((sum, current) => sum + (getSpanForBreakpoint(current.props.span, breakpoint, breakpoints) ?? 0), 0);
    const columnsWithNoSpan = row.filter(
        (column) => getSpanForBreakpoint(column.props.span ?? null, breakpoint, breakpoints) === null
    ).length;
    const span = (MAX_COLUMNS - totalAssignedSpan) / columnsWithNoSpan;
    return span;
}

/**
 * Calculates the width considering the space taken by columnGap
 *
 * @param row an array containing all children in that row
 * @param childSpan the child/column/cell span we want to find the width for
 * @param columnGap the columnGap applied to that row
 * @param breakpoint the breakpoint to consider the cell width by
 * @param breakpoints an object containing when all of the breakpoints happen
 */
function getCellWidth(
    row: Array<ColumnInstance>,
    childSpan: number | null,
    columnGap: number | undefined,
    breakpoint: number,
    breakpoints: Breakpoints
): number {
    const widthAvailable = 100 - (row.length - 1) * columnGap!;
    const width =
        childSpan ?
            (childSpan * widthAvailable) / MAX_COLUMNS
        :   (getCellWidthByRow(row, breakpoint, breakpoints) * widthAvailable) / MAX_COLUMNS;
    return width > 100 ? 100 : width;
}

/**
 * Based on all the columns and gaps, fiits the columns to rows
 *
 * @param children an array containing all the children to be fit into rows
 * @param child the child/column we want to know the width for
 * @param columnGap the columnGap applied to that row
 * @param breakpoint the breakpoint to consider the cell width by
 * @param breakpoints an object containing when all of the breakpoints happen
 */
function getColumnWidth(
    children: Array<ColumnInstance>,
    child: ColumnInstance,
    columnGap: number | undefined,
    breakpoint: number,
    breakpoints: Breakpoints
): number | undefined {
    // contains the current sum of span occupied by all children in current row
    let currentSum = 0;
    // contains whether the child is in the current row we are looking at
    let isChildInRow = false;
    // this contains the index of first child in a row
    let startChild = 0;

    const childSpan = getSpanForBreakpoint(child.props?.span, breakpoint, breakpoints);
    for (const [childrenIndex, currentChild] of children.entries()) {
        // get the current child span for given breakpoint
        const currentChildSpan = getSpanForBreakpoint(currentChild.props?.span, breakpoint, breakpoints)!;
        // if a column does not have a span we allocate it a temporary value of 1, otherwise we add to the current sum its span
        currentSum += currentChildSpan ?? 1;

        // if we are currently looping through the child set that child will be in the current row
        if (currentChild.uid === child.uid) {
            isChildInRow = true;
        }
        // If the currentSum exceeds or equals the MAX_COLUMNS, and child was not in row, we need to reset/start looking through next row
        if (currentSum >= MAX_COLUMNS && !isChildInRow) {
            // define the start of next row, if currentSum is equal to MAX_COLUMNS then next row will be from next child, otherwise if it has overflown starts from current child
            startChild = currentSum === MAX_COLUMNS ? childrenIndex + 1 : childrenIndex;
            // the currentSum must be reset, if it has overflown we must consider next element in the starting currentSum value
            let initialSpan = currentChildSpan ?? 1;
            // If current child occupies whole row by itself then row begining will be with next child and currentSum starts at 0
            if (currentChildSpan >= MAX_COLUMNS) {
                startChild = childrenIndex + 1;
                initialSpan = 0;
            }
            currentSum = currentSum === MAX_COLUMNS ? 0 : initialSpan;
        }
        // If the currentChild spans MAX_COLUMNS it should have it's own row
        if (currentChildSpan >= MAX_COLUMNS && currentChild.uid === child.uid) {
            const row = children.slice(childrenIndex, childrenIndex + 1);
            return getCellWidth(row, childSpan, columnGap, breakpoint, breakpoints);
        }
        // If the currentSum has exceeded the MAX_COLUMNS and child is in this row then we have found all the children that are in this row
        if (currentSum > MAX_COLUMNS && isChildInRow) {
            const row = children.slice(startChild, childrenIndex);
            return getCellWidth(row, childSpan, columnGap, breakpoint, breakpoints);
        }
        // If the currentSum is equal to MAX_COLUMNS and child has been looped through then we have all the children in this row
        // Otherwise if we have reached the last element and child is in row we know that the last row is incomplete
        if ((currentSum === MAX_COLUMNS && isChildInRow) || (children.length - 1 === childrenIndex && isChildInRow)) {
            const row = children.slice(startChild, childrenIndex + 1);
            return getCellWidth(row, childSpan, columnGap, breakpoint, breakpoints);
        }
    }
}

/**
 * Given a column returns an object containing the width percentage that it should take at each breakpoint
 *
 * @param children all the columns passed to Row component
 * @param child the child/column we want to obtain the widths for
 * @param columnGap the columnGap applied to that row
 * @param breakpoints an object containing when the breakpoints happen
 */
function getAllWidthsForColumn(
    children: Array<ColumnInstance>,
    child: ColumnInstance,
    columnGap: number | undefined,
    breakpoints: Breakpoints
): Breakpoints {
    return {
        lg: getColumnWidth(children, child, columnGap, breakpoints.lg, breakpoints)!,
        md: getColumnWidth(children, child, columnGap, breakpoints.md, breakpoints)!,
        sm: getColumnWidth(children, child, columnGap, breakpoints.sm, breakpoints)!,
        xl: getColumnWidth(children, child, columnGap, breakpoints.xl, breakpoints)!,
        xs: getColumnWidth(children, child, columnGap, breakpoints.xs, breakpoints)!,
    };
}

/**
 * Calculates the margin-left percentage a column should have
 *
 * @param width the width of the column
 * @param offsetWidth if offset was a column the width it would take on the screen
 * @param columnGap the columnGap applied to that row
 */
function getMarginLeft(width: number | null, offsetWidth: number | null | undefined, columnGap: number | undefined): number {
    // if there is no offset or if the column takes the whole row then the margin-left should be 0
    if (offsetWidth && width !== 100) {
        // if offset span + width are greater than 12, then offset is corrected so row adds to 12
        if (offsetWidth + width! + columnGap! > 100) {
            return 100 - width!;
        }
        // otherwise should be the space a column of the offset span would take plus the space taken by a column gap
        // this is needed to ensure alignment between rows
        return offsetWidth + columnGap!;
    }
    return 0;
}

/**
 * Given a column, returns a string of css containing the media queries for the width
 *
 * @param children all the columns passed to Row component
 * @param child the child/column we want to obtain the widths for
 * @param breakpoints an object containing when the breakpoints happen
 * @param columnGap the columnGap applied to that row
 */
function getColumnStyle(
    children: Array<ColumnInstance>,
    child: ColumnInstance,
    breakpoints: Breakpoints,
    columnGap: number | undefined
): string {
    const widths = getAllWidthsForColumn(children, child, columnGap, breakpoints);
    let offsets: Breakpoints | undefined;
    if (child.props?.offset) {
        const offset_child = {
            props: { span: child.props?.offset },
            uid: `${child.uid}offset`,
        } as ColumnInstance;
        offsets = getAllWidthsForColumn(children, offset_child, columnGap, breakpoints);
    }
    return `
        @media (max-width: ${breakpoints.sm}px) {
            width: ${widths.xs}%;
            margin-left: ${getMarginLeft(widths.xs, offsets?.xs, columnGap)}%
        }
        @media (min-width: ${breakpoints.sm}px) {
            width: ${widths.sm}%;
            margin-left: ${getMarginLeft(widths.sm, offsets?.sm, columnGap)}%
        }
        @media (min-width: ${breakpoints.md}px) {
            width: ${widths.md}%;
            margin-left: ${getMarginLeft(widths.md, offsets?.md, columnGap)}%
        }
        @media (min-width: ${breakpoints.lg}px) {
            width: ${widths.lg}%;
            margin-left: ${getMarginLeft(widths.lg, offsets?.lg, columnGap)}%
        }
        @media (min-width: ${breakpoints.xl}px) {
            width: ${widths.xl}%;
            margin-left: ${getMarginLeft(widths.xl, offsets?.xl, columnGap)}%
        }
    `;
}

const StyledRow = injectCss(RowComponent);
const StyledColumn = injectCss('div');

/**
 * Grid Row component
 *
 * @param props Row component props
 */
function Row(props: RowProps): JSX.Element {
    const [style, css] = useComponentStyles(props);
    // we create a new list of children with fake "offset children" which will be used to calculate the width and margin column styles
    const childrenWithOffset = useMemo(
        () =>
            props.children.flatMap((child) => {
                const childWithOffset = [child];
                if (child.props?.offset) {
                    const offset_child = {
                        props: { span: child.props?.offset },
                        uid: `${child.uid}offset`,
                    } as ColumnInstance;
                    childWithOffset.unshift(offset_child);
                }
                return childWithOffset;
            }),
        [props.children]
    );

    const allColumnStyles = useMemo(
        () =>
            props.children.map((child) => {
                return getColumnStyle(childrenWithOffset, child, props.breakpoints, props.column_gap);
            }),
        [childrenWithOffset, props.breakpoints, props.column_gap]
    );

    return (
        <StyledRow
            $rawCss={css}
            className={props.className}
            style={{
                alignItems: props.align,
                columnGap: `${props.column_gap}%`,
                justifyContent: props.justify,
                ...style,
            }}
        >
            <DisplayCtx.Provider value={{ component: 'row', direction: 'horizontal' }}>
                {props.children.map((child, idx) => (
                    <StyledColumn
                        $rawCss={allColumnStyles[idx]}
                        key={`row-${idx}-${child.uid}`}
                        style={{ display: 'flex' }}
                    >
                        <DynamicComponent component={child} />
                    </StyledColumn>
                ))}
            </DisplayCtx.Provider>
        </StyledRow>
    );
}

export default Row;
