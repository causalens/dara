import { transparentize } from 'polished';
import * as React from 'react';
import { HeaderGroup } from 'react-table';
import { areEqual } from 'react-window';

import styled from '@darajs/styled-components';

import { TableColumn } from './types';

interface RowProps {
    onClickRow?: (row: any) => void | Promise<void>;
}

// Get the row height from the font size of the root element to respect rem units
const { fontSize } = window.getComputedStyle(document.documentElement);

export const ROW_HEIGHT = parseFloat(fontSize) * 2.5;

// Prevents the isSorted or onClickRow prop being added to the dom element
export const shouldForwardProp = (prop: any): boolean => !['isSorted', 'onClickRow'].includes(prop);

const Row = styled.div.withConfig({ shouldForwardProp })<RowProps>`
    cursor: ${(props) => (props.onClickRow ? 'pointer' : 'default')};
    display: flex;

    :hover {
        div {
            background-color: ${(props) => props.theme.colors.grey1};
        }
    }

    :active,
    :focus {
        div {
            background-color: ${(props) => props.theme.colors.grey2};
        }
    }
`;

const RowPlaceholder = styled(Row)`
    position: absolute;
    left: 0;

    display: flex;
    align-items: center;
    justify-content: center;
`;

const CellPlaceholder = styled.div`
    min-width: 80px;
    height: 0.7rem;
    margin: 0.5rem;

    background: ${(props) =>
        `linear-gradient(to right, ${props.theme.colors.grey2}, ${transparentize(0.2, props.theme.colors.grey3)}, ${
            props.theme.colors.grey2
        });`};
    background-size: 50%;
    border-radius: 0.5rem;

    animation-name: ani-horizontal;
    animation-duration: 3.5s;
    animation-timing-function: linear;
    animation-iteration-count: infinite;

    @keyframes ani-horizontal {
        0% {
            background-position: -100% 0;
        }

        100% {
            background-position: 100% 0;
        }
    }
`;

const Cell = styled.div`
    display: flex !important;
    align-items: center;

    min-width: 80px;
    height: ${() => `${ROW_HEIGHT}px`};

    color: ${(props) => props.theme.colors.grey6};

    background-color: ${(props) => props.theme.colors.blue1};
    border-bottom: 1px solid ${(props) => props.theme.colors.grey3};

    :last-child {
        border-right: 0;
    }
`;

const CellContent = styled.span`
    overflow: hidden;

    width: 100%;
    padding: 0 1rem;

    text-overflow: ellipsis;
    white-space: nowrap;
`;

/**
 * Checks if the previous and next props are equal while also
 * forcing a re-render if any column in any headerGroup is being resized
 *
 * @param {any} prevProps - The previous props.
 * @param {any} nextProps - The next props.
 * @returns {boolean} - Whether the props are equal.
 */
const arePropsEqual = (prevProps: Props, nextProps: Props): boolean =>
    areEqual(prevProps, nextProps) &&
    !(nextProps.data?.headerGroups || []).some((headerGroup) =>
        (headerGroup?.headers || []).some((header) => header.isResizing)
    );

type Props = {
    data: {
        backgroundColor: string;
        currentEditCell: [number, string | number];
        getItem: (index: number) => any;
        headerGroups: Array<HeaderGroup<object>>;
        mappedColumns: Array<TableColumn>;
        onClickRow: (row: any) => void | Promise<void>;
        prepareRow: (row: any) => void;
        rows: Array<any>;
        throttledClickRow: (row: any) => void | Promise<void>;
        totalColumnsWidth: number;
        width: number;
    };
    index: number;
    style: React.CSSProperties;
};

const RenderRow = React.memo(
    ({
        data: {
            width,
            currentEditCell,
            headerGroups,
            rows,
            prepareRow,
            getItem,
            totalColumnsWidth,
            onClickRow,
            throttledClickRow,
            backgroundColor,
            mappedColumns,
        },
        index,
        style: renderRowStyle,
    }: Props): JSX.Element => {
        let row = rows[index];

        if (getItem) {
            const value = getItem(index);

            // attempting to render a row which there's no data yet, make sure loading state is used
            if (!value) {
                row = null;
            } else {
                row.original = value;
                row.values = value;
            }
        }
        if (!row) {
            return (
                <div>
                    {headerGroups.map((headerGroup, gidx) => (
                        <RowPlaceholder
                            key={`row-${gidx}`}
                            style={{
                                height: ROW_HEIGHT,
                                top: (index + 1) * ROW_HEIGHT,
                                width: totalColumnsWidth > width ? totalColumnsWidth : '100%',
                            }}
                        >
                            {headerGroup?.headers.map((col: any, cidx: number) => {
                                const headerProps = col.getHeaderProps();
                                // If width calc has messed up then use the raw width from the column
                                const headerWidth =
                                    headerProps.style.width === 'NaNpx' ?
                                        mappedColumns[cidx].width
                                    :   headerProps.style.width;

                                return (
                                    <CellPlaceholder
                                        key={`col-${index}-${cidx}`}
                                        style={{
                                            maxWidth: col.maxWidth,
                                            width: headerWidth,
                                        }}
                                    />
                                );
                            })}
                        </RowPlaceholder>
                    ))}
                </div>
            );
        }
        prepareRow(row);
        const onClick = (): void => {
            if (onClickRow) {
                throttledClickRow(row.original);
            }
        };
        const { style: rowStyle, ...restRow } = row.getRowProps({ style: renderRowStyle });
        return (
            <Row
                {...restRow}
                key={`row-${index}`}
                onClick={onClick}
                onClickRow={onClickRow}
                style={{
                    ...rowStyle,

                    top: (index + 1) * ROW_HEIGHT,
                    width: totalColumnsWidth > width ? totalColumnsWidth : '100%',
                }}
            >
                {row.cells.map((cell: any, colIdx: number) => {
                    const cellProps = cell.getCellProps();
                    return (
                        <Cell
                            {...cellProps}
                            key={`cell-${index}-${colIdx}`}
                            style={{
                                ...cellProps.style,

                                backgroundColor,
                                justifyContent: mappedColumns[colIdx].align,
                                maxWidth: cell.column?.maxWidth,
                                width:
                                    // If width calc has messed up then use the raw width from the column
                                    cellProps.style.width === 'NaNpx' ?
                                        mappedColumns[colIdx].width
                                    :   cellProps.style.width,
                            }}
                        >
                            <CellContent>
                                {cell.render('Cell', {
                                    colIdx,
                                    currentEditCell,
                                    rowIdx: index,
                                })}
                            </CellContent>
                        </Cell>
                    );
                })}
            </Row>
        );
    },
    arePropsEqual
);

export default RenderRow;
