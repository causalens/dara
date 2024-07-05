/**
 * Copyright 2023 Impulse Innovations Limited
 *
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { faCircleQuestion } from '@fortawesome/free-regular-svg-icons';
import { IconDefinition, faArrowDown, faArrowUp } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import memoize from 'memoize-one';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import * as React from 'react';
import {
    FilterProps,
    Filters,
    HeaderGroup,
    SortingRule,
    useFilters,
    useFlexLayout,
    useResizeColumns,
    useSortBy,
    useTable,
} from 'react-table';
import { useSticky } from 'react-table-sticky';
import AutoSizer from 'react-virtualized-auto-sizer';
import { FixedSizeList } from 'react-window';

import styled from '@darajs/styled-components';
import { useDeepCompare, useThrottle, useThrottledState } from '@darajs/ui-utils';

import CategoricalFilter from '../filter/categorical-filter';
import DatetimeFilter from '../filter/datetime-filter';
import NumericFilter from '../filter/numeric-filter';
import Tooltip from '../tooltip/tooltip';
import { ItemsRenderedPayload } from '../utils/use-infinite-loader';
import { Action, ActionCell, ActionCol, Actions } from './cells/action-cell';
import DatetimeCell from './cells/datetime-cell';
import EditInputCell from './cells/edit-input-cell';
import EditSelectCell from './cells/edit-select-cell';
import { FilterContainer, HeaderIconWrapper, TextFilter, categorical, datetime, numeric } from './filters';
import SelectHeader from './headers/select-header';
import OptionsMenu from './options-menu';
import RenderRow, { ROW_HEIGHT, shouldForwardProp } from './render-row';
import { TableColumn } from './types';

const Wrapper = styled.div<{ $hasMaxRows: boolean }>`
    display: inline-block;
    width: 100%;
    max-width: 100%;
    padding: 1rem;

    ${(props) => !props.$hasMaxRows && `flex: 1 1 auto;`}
    &.sticky {
        [data-sticky-td] {
            position: sticky;
        }

        [data-sticky-last-left-td] {
            box-shadow: 4px 0 4px -3px ${(props) => props.theme.colors.shadowMedium};
        }

        [data-sticky-first-right-td] {
            box-shadow: -4px 0 4px -3px ${(props) => props.theme.colors.shadowMedium};
        }
    }
`;

const StyledFixedSizeList = styled(FixedSizeList)`
    /* this adds a fixed box shadow underneath the header */
    ::before {
        content: '';

        position: sticky;
        z-index: 5;
        inset: calc(2.5rem - 2px) 0 0 0;

        display: block;

        height: 1px;

        box-shadow: 0 3px 3px ${(props) => props.theme.colors.shadowLight};
    }
`;

const Header = styled.div`
    position: sticky;
    z-index: 4;
    top: 0;

    flex-direction: column;

    width: fit-content;
    min-width: 80px;

    /* needed as before box shadow pushes this dows by 1px */
    margin-top: -1px;
`;

const HeaderRow = styled.div`
    display: flex;
`;

const HeaderCell = styled.div`
    user-select: none;

    display: flex !important;
    align-items: center;
    justify-content: space-between;

    min-width: 80px;
    height: ${ROW_HEIGHT}px;

    color: ${(props) => props.theme.colors.text};

    background-color: ${(props) => props.theme.colors.blue3};

    :not(:last-child) {
        border-right: 1px solid ${(props) => props.theme.colors.background};
    }

    :hover {
        /* stylelint-disable-next-line -- hard-coded classname */
        .tableSortArrow {
            color: ${(props) => props.theme.colors.grey3};
        }
    }
`;

interface HeaderContainerProps {
    // whether header is a simple string or a more complex component
    isPrimitiveHeader?: boolean;
}

const HeaderContentWrapper = styled.span<HeaderContainerProps>`
    overflow: hidden;
    flex: 1 1 auto;

    padding-left: ${(props) => (props.isPrimitiveHeader ? '1rem' : undefined)};

    text-overflow: ellipsis;
    white-space: nowrap;
`;

const HeaderTooltipContainer = styled.div<HeaderContainerProps>`
    display: flex;
    gap: 0.5rem;
    align-items: center;
    justify-content: center;

    width: ${(props) => (props.isPrimitiveHeader ? undefined : '100%')};
    max-width: ${(props) => (props.isPrimitiveHeader ? 'calc(100% - 3rem)' : undefined)};
`;

const HeaderCellButtonContainer = styled.div`
    display: flex;
    flex-direction: row;
    height: 100%;
`;

const HeaderIconsWrapper = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    justify-self: flex-end;
`;

const ResizeBorder = styled.div`
    /* prevents from scrolling while dragging on touch devices */
    touch-action: none;
    width: 10px;
    height: 100%;
`;

interface isSortedProp {
    isSorted: boolean;
}

const SortIcon = styled(FontAwesomeIcon).withConfig({ shouldForwardProp })<isSortedProp>`
    color: ${(props) => (props.isSorted ? props.theme.colors.grey3 : props.theme.colors.blue3)};
`;

const TooltipIcon = styled(FontAwesomeIcon)`
    color: ${(props) => props.theme.colors.grey4};
`;

/**
 * A helper function to get the correct icon for the current column sort
 *
 * @param isSorted - whether the column is sorted or not
 * @param isSortedDesc - whether it is sorted in descending order
 */
const getSortIcon = (isSorted: boolean, isSortedDesc: boolean): IconDefinition => {
    if (!isSorted) {
        return faArrowUp;
    }
    return isSortedDesc ? faArrowDown : faArrowUp;
};

/**
 * Quick helper for remapping the sortId of a column to what the backend is expecting. Useful when the parser has
 * remapped they keys or structure of the object
 *
 * @param sortBy the sortBy from the react table state
 * @param columns the tables passed to the column
 */
const getSortKey = (sortBy: Array<SortingRule<string>>, columns: Array<TableColumn>): Array<SortingRule<string>> => {
    return sortBy.map((sort) => ({
        ...sort,
        id: columns.find((col) => col.accessor === sort.id)?.sortKey || sort.id,
    }));
};

/**
 * Quick helper for reordering the columns to have the left sticky columns first and the right sticky columns
 * in the end.
 *
 * @param columns the columns from the component props
 */
const orderStickyCols = (columns: Array<TableColumn>): Array<TableColumn> => {
    const leftStickyCols: Array<TableColumn> = [];
    const nonStickyCols: Array<TableColumn> = [];
    const rightStickyCols: Array<TableColumn> = [];
    columns.forEach((col) => {
        if (col.sticky === 'left') {
            leftStickyCols.push(col);
        } else if (col.sticky === 'right') {
            rightStickyCols.push(col);
        } else {
            nonStickyCols.push(col);
        }
    });
    return [...leftStickyCols, ...nonStickyCols, ...rightStickyCols];
};

// Map of filter name -> filter component
const filterComponentMap: Record<string, (props: FilterProps<any>) => JSX.Element> = {
    categorical: CategoricalFilter,
    datetime: DatetimeFilter,
    numeric: NumericFilter,
    text: TextFilter,
};

/**
 * Helper to append correct filter components to columns based on the filter function chosen
 *
 * @param columns columns to append components to;
 */
const appendFilterComponents = (columns: Array<TableColumn>): Array<TableColumn> => {
    return columns.map((col) => {
        if (!col.filter) {
            return col;
        }

        if (!(col.filter in filterComponentMap)) {
            throw new Error(
                `Invalid filter ${col.filter} encountered in column ${col.id}, only ${Object.keys(
                    filterComponentMap
                ).join(',')} are supported`
            );
        }

        return {
            ...col,
            Filter: filterComponentMap[col.filter],
        };
    });
};

/** Predefined cells */
const cells = {
    DATETIME: DatetimeCell,
    EDIT_INPUT: EditInputCell,
    EDIT_SELECT: EditSelectCell,
} as const;

/**
 * Handle exposed if attaching a `ref` to the Table
 */
export interface TableHandle {
    resetFilters(): void;
}

/**
 * Extra properties available on the Table function itself
 */
interface TableProperties {
    ActionColumn?: (
        actions: Array<ActionCol>,
        accessor?: string,
        sticky?: string,
        disableSelectAll?: boolean
    ) => TableColumn;
    Actions?: typeof Actions;
    cells?: typeof cells;
}

export interface Props<T extends { [k: string]: any }> {
    /** Optional flag to enable or disable column hiding functionality */
    allowHiding?: boolean;
    /** An optional argument to specify the background color of the table either in hex or rgba format */
    backgroundColor?: string;
    /** Standard react className property */
    className?: string;
    /** An array of column definitions, see react-table docs for all options */
    columns: Array<TableColumn>;
    /** An array of data objects, each object should contain the keys defined as accessors in the column defs */
    data?: Array<T>;
    /** An optional function to retrieve an item from a virtualized dataset, use in conjunction with onItemsRendered */
    getItem?: (index: number) => T;
    /** An optional initial sort for the table */
    initialSort?: Array<SortingRule<string>>;
    /** The total number of items in the table, required when using the infinite loader */
    itemCount?: number;
    /** The maximum number of rows to display, useful when table is not in a flexed container */
    maxRows?: number;
    /** An optional handler for listening to any action buttons */
    onAction?: (actionId: string, input: any) => void | Promise<void>;
    /**
     * An optional onChange handler for listening to any changes from edit cells, the handler is called with the new
     * value, the rowIdx and the column id passed in as accessor. The Table component will not try and update the data
     * it has, it's up to the consuming component to apply the update and pass data in again.
     */
    onChange?: (value: any, rowIdx: number, colId: string) => void | Promise<void>;
    /** An optional handler for listening to a click on a row, will pass the callback the row that was clicked */
    onClickRow?: (row: T) => void | Promise<void>;
    /**
     * An optional onFilter handler, can be used to draw filtering logic up into the parent component, rather than being
     * done in the table itself
     */
    onFilter?: (filters: Filters<any>) => Promise<void>;
    /** An optional handler for triggering the infinite loader to fetch more data, use alongside getItem */
    onItemsRendered?: (payload: ItemsRenderedPayload) => Promise<void>;
    /**
     * An optional onSort handler, can be used to draw sorting logic up into the parent component, rather than being
     * done in the table itself
     */
    onSort?: (sort: Array<SortingRule<string>>) => void | Promise<void>;
    /** Optional flag to control whether or not to show additional table options */
    showTableOptions?: boolean;
    /** Pass through of the style prop to the root component */
    style?: React.CSSProperties;
    /** Pass through of the style prop to the table options Dropdown */
    tableOptionsStyle?: React.CSSProperties;
}

type TableType = React.ForwardRefExoticComponent<Props<{ [k: string]: any }> & React.RefAttributes<TableHandle>> &
    TableProperties;

interface ColumnHeader extends HeaderGroup<object> {
    tooltip?: string;
}

// This helper function memoizes incoming props,
// To avoid causing unnecessary re-renders pure Row components.
const createItemData = memoize(
    (
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
        mappedColumns
    ) => ({
        backgroundColor,
        currentEditCell,
        getItem,
        headerGroups,
        mappedColumns,
        onClickRow,
        prepareRow,
        rows,
        throttledClickRow,
        totalColumnsWidth,
        width,
    })
);

/**
 * The Table component builds on top of the thirdparty react-table library and aims to provide a simple outward facing
 * api. A table can be completely defined by passing in an array of columns and an array of data. The columns
 * definitions are the same as that of ReactTable and the data can be any JSON like data. For more info on column
 * definitions check the react table docs and examples:
 *
 * https://react-table.tanstack.com/docs/quick-start
 *
 * @param props - the component props
 */
const Table = forwardRef(
    <T extends { [k: string]: any }>(
        {
            allowHiding,
            backgroundColor,
            className,
            columns,
            data,
            getItem,
            initialSort = [],
            itemCount,
            maxRows,
            onAction,
            onChange,
            onClickRow,
            onItemsRendered,
            onFilter,
            onSort,
            showTableOptions,
            style,
            tableOptionsStyle,
        }: Props<T>,
        ref: React.ForwardedRef<TableHandle>
    ) => {
        // This state helps in retaining the current sorted column even if the data gets updated
        const [currentSortBy, setCurrentSortBy] = useState<Array<SortingRule<string>>>(initialSort);

        useEffect(
            () => {
                setCurrentSortBy(initialSort);
            },
            // eslint-disable-next-line react-hooks/exhaustive-deps
            useDeepCompare([initialSort])
        );

        if (!data && !getItem) {
            throw new Error('One of data and getItem must be passed to the table component');
        }

        if (getItem && (!onItemsRendered || !Number.isFinite(itemCount))) {
            throw new Error('itemCount and onItemsRendered must also be passed when using the table in infinite mode');
        }

        const [currentEditCell, throttledSetEditCell, immediateSetEditCell] = useThrottledState<
            [number, string | number]
        >(undefined, 500);

        // ClickRow is throttled so multiple or double clicks don't fire multiple events
        const throttledClickRow = useThrottle(onClickRow, 500);

        const onStopEdit = (): void => {
            throttledSetEditCell(undefined);
        };

        const onStartEdit = (e?: React.MouseEvent<HTMLSpanElement>): void => {
            const cell = e?.currentTarget?.getAttribute('data-cell')?.split(',');
            if (!cell || cell?.length !== 2) {
                throttledSetEditCell(undefined);
                return;
            }
            // This pattern lets clicking on a new cell be instant, but then calls the throttled version as well to
            // overwrite any blur calls that are pending. This allows the blur throttle to be longer without making the UI
            // feel sluggish, which makes the blur much less likely to overwrite the current edit cell.
            immediateSetEditCell([Number(cell[0]), cell[1]]);
            throttledSetEditCell([Number(cell[0]), cell[1]]);
        };

        // If the component is in infinite mode, then the table needs an array of data to work with
        const infiniteData = useMemo(() => Array(itemCount).fill(0), [itemCount]);

        /**
         * Columns with transformations applied:
         * - re-ordered using sticky - to have left sticky columns first and right sticky columns in the end
         * - filter components appended based on filter chosen
         */
        const mappedColumns = useMemo(() => appendFilterComponents(orderStickyCols(columns)), [columns]);

        // Check if the table has fixed columns, then only apply sticky hooks and classes based on this
        const hasFixedColumns = useMemo(() => mappedColumns.some((column) => 'sticky' in column), [mappedColumns]);
        // Calculate table column manually here in case it's passed in with px, useTable version goes to NaN
        const totalColumnsWidth = useMemo(
            () => mappedColumns.reduce((acc, column) => acc + (parseInt(column.width as any) || 150), 0),
            [mappedColumns]
        );

        // Available filters (in addition to the default 'text' filter)
        const filterTypes = useMemo(
            () => ({
                categorical,
                datetime,
                numeric,
            }),
            []
        );

        const {
            getTableProps,
            getTableBodyProps,
            headerGroups,
            rows,
            prepareRow,
            state: { sortBy, filters },
            setAllFilters,
            resetResizing,
            allColumns,
        } = useTable(
            {
                columns: mappedColumns,
                data: data || infiniteData,
                filterTypes,
                initialState: {
                    sortBy: currentSortBy.map((sort) => ({
                        ...sort,
                        id: mappedColumns.find((col) => [col.sortKey, col.accessor].includes(sort.id)).accessor,
                    })),
                },
                // In infinite mode, don't filter client-side
                manualFilters: !data,
                manualSortBy: !!onSort,
                onAction,
                onChange,
                onStartEdit,
                onStopEdit,
            },
            useFilters,
            useFlexLayout,
            useSortBy,
            useResizeColumns,
            ...(hasFixedColumns ? [useSticky] : [])
        );

        useImperativeHandle(ref, () => ({
            resetFilters() {
                setAllFilters([]);
            },
        }));

        // If onSort is passed then delegate sorting to parent component
        useEffect(() => {
            if (onSort) {
                onSort(getSortKey(sortBy, mappedColumns));
            } else {
                setCurrentSortBy(sortBy);
            }
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [onSort, sortBy]);

        useEffect(() => {
            if (onFilter) {
                onFilter(filters);
            }
        }, [onFilter, filters]);

        const tableProps = getTableBodyProps();
        const renderTable = useCallback(
            ({ children, style: tableStyle, ...rest }: any) => {
                return (
                    <div key="table-inner">
                        <Header style={{ width: `max(${totalColumnsWidth}px, 100%)` }}>
                            {headerGroups.map((headerGroup, gidx) => (
                                <HeaderRow {...headerGroup.getHeaderGroupProps()} key={`group-${gidx}`}>
                                    {headerGroup.headers.map((col: ColumnHeader, cidx) => {
                                        const headerProps = col.getHeaderProps();
                                        const sortProps = col.getSortByToggleProps();
                                        const headerContent = col.render('Header');
                                        const resizerProps = col.getResizerProps();
                                        const numVisibleColumns = allColumns.filter(
                                            (column) => column.isVisible
                                        ).length;
                                        const showSort = !col.disableSortBy;
                                        const showFilter = col.canFilter && col.filter;
                                        const showOptions = cidx === numVisibleColumns - 1 && showTableOptions;
                                        const showHeaderCellButtonContainer = showSort || showFilter || showOptions;
                                        return (
                                            <HeaderCell
                                                {...headerProps}
                                                key={`col-${gidx}-${cidx}`}
                                                style={{
                                                    ...headerProps.style,

                                                    maxWidth: col.maxWidth,
                                                    // If width calc has messed up then use the raw width from the column
                                                    width:
                                                        (headerProps.style as any).width === 'NaNpx' ?
                                                            mappedColumns[cidx].width
                                                        :   (headerProps.style as any).width,
                                                }}
                                            >
                                                <HeaderTooltipContainer
                                                    isPrimitiveHeader={typeof headerContent === 'string'}
                                                >
                                                    <HeaderContentWrapper
                                                        {...sortProps}
                                                        isPrimitiveHeader={typeof headerContent === 'string'}
                                                        title={typeof headerContent === 'string' ? headerContent : ''}
                                                    >
                                                        {headerContent}
                                                    </HeaderContentWrapper>
                                                    {col.tooltip && (
                                                        <Tooltip content={col.tooltip}>
                                                            <TooltipIcon icon={faCircleQuestion} />
                                                        </Tooltip>
                                                    )}
                                                </HeaderTooltipContainer>
                                                {showHeaderCellButtonContainer && (
                                                    <HeaderCellButtonContainer>
                                                        <HeaderIconsWrapper>
                                                            {showSort && (
                                                                <HeaderIconWrapper>
                                                                    <SortIcon
                                                                        {...sortProps}
                                                                        className="tableSortArrow"
                                                                        icon={getSortIcon(
                                                                            col.isSorted,
                                                                            col.isSortedDesc
                                                                        )}
                                                                        isSorted={col.isSorted}
                                                                    />
                                                                </HeaderIconWrapper>
                                                            )}
                                                            {showFilter ?
                                                                <FilterContainer col={col} />
                                                            :   null}

                                                            {showOptions && (
                                                                <OptionsMenu
                                                                    allColumns={allColumns}
                                                                    allowColumnHiding={allowHiding}
                                                                    numVisibleColumns={numVisibleColumns}
                                                                    resetResizing={resetResizing}
                                                                    setAllFilters={setAllFilters}
                                                                    style={tableOptionsStyle}
                                                                />
                                                            )}
                                                        </HeaderIconsWrapper>
                                                        <ResizeBorder {...resizerProps} />
                                                    </HeaderCellButtonContainer>
                                                )}
                                            </HeaderCell>
                                        );
                                    })}
                                </HeaderRow>
                            ))}
                        </Header>
                        <div {...tableProps} {...rest} key="table-body-inner" style={tableStyle}>
                            {children}
                        </div>
                    </div>
                );
            },
            // eslint-disable-next-line react-hooks/exhaustive-deps
            useDeepCompare([tableProps, totalColumnsWidth, headerGroups])
        );

        return (
            <Wrapper
                {...getTableProps()}
                $hasMaxRows={!!maxRows}
                className={`${className} ${hasFixedColumns ? 'sticky' : ''}`}
                style={{ height: maxRows ? (Math.min(rows.length, maxRows) + 1) * ROW_HEIGHT : '100%', ...style }}
            >
                <AutoSizer>
                    {({ height, width }) => {
                        return (
                            <StyledFixedSizeList
                                height={height}
                                innerElementType={renderTable}
                                itemCount={itemCount || rows.length}
                                itemData={createItemData(
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
                                    mappedColumns
                                )}
                                itemSize={ROW_HEIGHT}
                                key="table-list"
                                onItemsRendered={onItemsRendered}
                                style={{
                                    overflowX: width < totalColumnsWidth ? 'auto' : 'hidden',
                                    overflowY: height < (rows.length + 1) * ROW_HEIGHT ? 'auto' : 'hidden',
                                }}
                                width={width}
                            >
                                {RenderRow}
                            </StyledFixedSizeList>
                        );
                    }}
                </AutoSizer>
            </Wrapper>
        );
    }
) as TableType;

Table.displayName = 'Table';

/**
 * A pre-made action column, just pass a list of actions to add them as a column, optional accessor property if you want
 * multiple action columns on a single table
 *
 * @param actions: An array of actions to be added to this column
 * @param accessor: Optional parameter to define a unique accessor property if you have multiple action columns
 * @param sticky: Optional param to sticky the action column to left or right
 * @param disableSelectAll: optional parameter to exclude the select-all header even if SELECT action is added
 */
Table.ActionColumn = (
    actions: Array<ActionCol>,
    accessor?: string,
    sticky?: string,
    disableSelectAll = false
): TableColumn => {
    // 24 for width of each action and 12 padding either side
    const width = actions.includes(Actions.SELECT) ? 52 : actions.length * 24 + 24;
    return {
        Cell: ActionCell,
        Header: actions.includes(Actions.SELECT) && !disableSelectAll ? SelectHeader : '',
        accessor: accessor || 'actions',
        actions,
        disableSortBy: true,
        maxWidth: width,
        minWidth: actions.includes(Actions.SELECT) ? 52 : 48,
        sticky: sticky || null,
        width,
    };
};
Table.Actions = Actions;
Table.cells = cells;

export { Action as TableAction };
export default Table;
