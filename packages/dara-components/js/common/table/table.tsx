/* eslint-disable react-hooks/exhaustive-deps */
import { formatISO } from 'date-fns';
import debounce from 'lodash/debounce';
import isEqual from 'lodash/isEqual';
import mapKeys from 'lodash/mapKeys';
import { ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
    Action,
    AnyDataVariable,
    ClauseQuery,
    FilterQuery,
    QueryOperator,
    StyledComponentProps,
    Variable,
    combineFilters,
    injectCss,
    useAction,
    useComponentStyles,
    useDataVariable,
    useVariable,
} from '@darajs/core';
import styled from '@darajs/styled-components';
import { Input, Item, Table as UiTable, useInfiniteLoader } from '@darajs/ui-components';
import { SortingRule, useThrottledState } from '@darajs/ui-utils';

import {
    AdaptivePrecisionCell,
    BadgeFormattedCell,
    CodeCell,
    CompareCell,
    FormattedTextCell,
    LinkCell,
    NumberCell,
    NumberIntlCell,
    PercentageCell,
    ThresholdFormattedCell,
} from './cells';

interface TableProps extends StyledComponentProps {
    /**
     * Column definitions
     */
    columns?: ColumnProps[] | Variable<ColumnProps[]>;
    /**
     * Data
     */
    data: AnyDataVariable;
    /**
     * When specified, a set number of rows is displayed
     */
    max_rows?: number;
    /**
     * Whether multiple selections are allowed
     */
    multi_select?: boolean;
    /**
     * Onclick handler; when provided, select action is added to the table
     */
    onclick_row?: Action;
    /**
     * Onselect handler; when provided, is called when a row is selected
     */
    onselect_row?: Action;
    /**
     * List of searchable columns
     */
    search_columns?: Array<string>;
    /**
     * Whether the table is searchable
     */
    searchable: boolean;
    /**
     * List of selected row indices
     */
    selected_indices?: Variable<Array<number>>;
    /**
     * When set to true hides the checkboxes column of table
     */
    show_checkboxes?: boolean;
    /**
     * A flag to suppress click events for clicks in select boxes. This will be come the default behavior in a future
     * version but it would be a breaking change so under a flag for now.
     */
    supress_click_events_for_selection?: boolean;
    /**
     * Whether to render the index column
     */
    include_index?: boolean;
}

interface ColumnProps {
    align?: string;
    col_id: string;
    filter?: 'text' | 'categorical' | 'numeric' | 'datetime';
    formatter?: { [k: string]: any };
    label?: string;
    sticky?: string;
    tooltip?: string;
    type?: 'number' | 'string' | 'datetime';
    unique_items?: Array<string>;
    width?: string;
}

const coerceValueToUnit = (num: number): number => {
    if (num < 0) {
        return -1;
    }
    if (num > 0) {
        return 1;
    }
    return 0;
};

const compareDateStrings = (a: string, b: string): number =>
    coerceValueToUnit(new Date(a).getTime() - new Date(b).getTime());

const compareNumberStrings = (a: string, b: string): number => coerceValueToUnit(Number(a) - Number(b));

const compareStrings = (a: string, b: string): number => coerceValueToUnit(a.localeCompare(b));

const columnSortTypes: Record<ColumnProps['type'], (a: any, b: any, id: string) => number> = {
    datetime: (a, b, id) => compareDateStrings(a.values[id], b.values[id]),
    number: (a, b, id) => compareNumberStrings(a.values[id], b.values[id]),
    string: (a, b, id) => compareStrings(a.values[id], b.values[id]),
};

const TableSearch = styled.div`
    display: flex;
    justify-content: flex-end;
`;

function getCellRenderer(formatter: { [k: string]: any }): any {
    if (formatter.type === 'adaptive_precision') {
        return AdaptivePrecisionCell();
    }
    if (formatter.type === 'code') {
        return CodeCell(formatter.language);
    }
    if (formatter.type === 'compare') {
        return CompareCell(formatter.condition, formatter.target);
    }
    if (formatter.type === 'datetime') {
        return UiTable.cells.DATETIME(formatter.format);
    }
    if (formatter.type === 'formatted_text') {
        return FormattedTextCell();
    }
    if (formatter.type === 'number') {
        return NumberCell(formatter.precision);
    }
    if (formatter.type === 'number_intl') {
        return NumberIntlCell(formatter.locales, formatter.options);
    }
    if (formatter.type === 'percent') {
        return PercentageCell(formatter.precision);
    }
    if (formatter.type === 'link') {
        return LinkCell();
    }
    if (formatter.type === 'threshold') {
        return ThresholdFormattedCell(formatter.thresholds);
    }
    if (formatter.type === 'badge') {
        return BadgeFormattedCell(formatter.badges);
    }
    if (formatter.type === 'boolean') {
        return ({ value }: any) => value?.toString();
    }
}

function mapColumns(columns: Array<ColumnProps>): any {
    if (columns) {
        return columns.map((column: ColumnProps) => ({
            Header: column.label ? column.label : column.col_id,
            accessor: column.col_id,
            ...(column.align && { align: column.align }),
            ...(column.filter && { filter: column.filter }),
            ...(column.formatter && { Cell: getCellRenderer(column.formatter) }),
            ...(column.sticky && { sticky: column.sticky }),
            ...(column.width && { maxWidth: column.width, width: column.width }),
            ...(column.type && { sortType: columnSortTypes[column.type] }),
            ...(column.unique_items && { uniqueItems: column.unique_items }),
            ...(column.tooltip && { tooltip: column.tooltip }),
        }));
    }
}

const INDEX_COL = '__index__';

interface DataRow {
    [col: string]: any;
    [INDEX_COL]: number;
}

interface InternalDataRow extends DataRow {
    selected: boolean;
}

enum NumericOperator {
    BT = 'Between',
    EQ = 'Equal to',
    GT = 'Greater than',
    LT = 'Less than',
    NE = 'Not equal to',
    None = 'None',
}

enum DateOperator {
    BT = 'Between',
    EQ = 'On date',
    GT = 'After',
    LT = 'Before',
    None = 'None',
}

interface FilterValue {
    selected: NumericOperator | DateOperator;
    value: any;
}

interface Filter {
    // id of the column the filter is applied to
    id: string;
    // value returned by the filter, for text Filters that is just a string, other filters vary
    value: FilterValue | string | Array<Item>;
}

function selectedToOperator(selected: string): QueryOperator {
    switch (selected) {
        case NumericOperator.EQ:
            return 'EQ';
        case DateOperator.EQ:
            return 'EQ';
        case NumericOperator.GT:
            return 'GT';
        case DateOperator.GT:
            return 'GT';
        case NumericOperator.LT:
            return 'LT';
        case DateOperator.LT:
            return 'LT';
        case NumericOperator.BT:
            return 'BT';
        case DateOperator.BT:
            return 'BT';
        case NumericOperator.NE:
            return 'NE';
        default:
            return null;
    }
}

/**
 * Gets the results returned by each filter on the table and sets it in a query format that can be consumed
 *
 * @param filters a list containing the results from each filter that is currently applied
 */
function filtersToFilterQuery(filters: Filter[]): FilterQuery {
    if (filters.length === 0) {
        return null;
    }

    return {
        clauses: filters
            .map((filt) => {
                // eslint-disable-next-line prefer-const
                let cleanValue: string | number | Array<string> = null;
                let operator: QueryOperator = null;

                if (typeof filt.value === 'string') {
                    operator = 'CONTAINS';
                    cleanValue = filt.value.trim();
                } else if (Array.isArray(filt.value)) {
                    // the operator is only here so that the filter can be acepted by the backend
                    operator = 'EQ';
                    cleanValue = filt.value.map((val) => val.value);
                } else if (!filt.value.selected || filt.value.selected === 'None') {
                    // invalid operator
                    return null;
                } else {
                    operator = selectedToOperator(filt.value.selected);
                    cleanValue = filt.value.value;
                }

                if (String(cleanValue).length === 0) {
                    return null;
                }

                return {
                    column: filt.id,
                    operator,
                    value: cleanValue,
                };
            })
            .filter(Boolean),
        combinator: 'AND',
    };
}

/**
 * Infer which columns are datetime columns and should be formatted.
 *
 * If column has datetime formatter, datetime filter, or type=datetime then its a datetime column
 */
function getDatetimeColumns(columns: ColumnProps[]): string[] {
    if (columns) {
        return columns
            .filter(
                (col) => col?.formatter?.type === 'datetime' || col.type === 'datetime' || col.filter === 'datetime'
            )
            .map((c) => c.col_id);
    }
}

/**
 * Clean up the index column from rows.
 *
 * @param rows rows to remove the index column from
 */
function cleanIndex(rows: DataRow[]): Omit<DataRow, typeof INDEX_COL>[] {
    return rows.map((r) => {
        const { [INDEX_COL]: _, ...rest } = r;
        return rest;
    });
}

/**
 * Type guard for checking whether column is of type `ColumnProps`
 *
 * @param column column to check for
 */
function isColumnProp(column: ColumnProps | string): column is ColumnProps {
    return (column as ColumnProps).col_id !== undefined;
}

/**
 * Gets columns and ensures they return an Array of ColumnProps
 *
 * @param columns columns to be converted into correct format
 */
function getColumnProps(columns: Array<string> | ColumnProps[]): ColumnProps[] {
    return columns.map((col: any) => {
        if (isColumnProp(col)) {
            return col;
        }
        if (typeof col === 'string') {
            return { col_id: col } as ColumnProps;
        }
        throw new Error(
            'Columns could not be rendered, check that your data is correct and columns are passed as a List'
        );
    });
}

/**
 * Extracts the column label from the column name by removing the index or col prefix
 *
 * @param col column name
 * @param isIndex whether the column is an index column
 * @returns column label
 */
function extractColumnLabel(col: string, isIndex: boolean): string {
    return isIndex ? col.replace(/__index__\d+__/, '') : col.replace(/__col__\d+__/, '');
}

const TableWrapper = injectCss('div');

function Table(props: TableProps): JSX.Element {
    const [searchQuery, setSearchQuery] = useState<ClauseQuery>(null);

    const getData = useDataVariable(props.data);
    const [selectedRowIndices, setSelectedRowIndices] = useVariable(props.selected_indices);

    const [columnsProp] = useVariable(props.columns);
    const [resolvedColumns, setResolvedColumns] = useState<ColumnProps[]>(() =>
        Array.isArray(columnsProp) ? getColumnProps(columnsProp) : null
    );

    // Resolve columns from data
    useEffect(() => {
        getData(
            null,
            {
                limit: 1,
                offset: 0,
            },
            { schema: true }
        )
            .then((dataset) => {
                const columns = Object.keys(dataset.data[0]);
                const fieldTypes = Object.fromEntries(
                    dataset.schema.fields.flatMap((field) => {
                        const key = Array.isArray(field.name) ? field.name.join('_') : field.name;
                        return [[key, { type: field.type }]];
                    })
                );

                const columnsWithoutGeneratedIndex = columns.filter((col) => col !== INDEX_COL);
                let processedColumns: ColumnProps[];
                if (columnsProp) {
                    // Prop provided, parse the columns provided and map them to the columns from data
                    // Limitation: If there are columns with duplicate names, data from only one of them will be shown
                    const reverseColumnIdMap = Object.fromEntries(
                        columnsWithoutGeneratedIndex.map((col) => [
                            extractColumnLabel(col, col.startsWith(INDEX_COL)),
                            col,
                        ])
                    ); // name -> __col__1__name
                    processedColumns = getColumnProps(columnsProp).map((column) => {
                        const col_id = reverseColumnIdMap[column.col_id] ?? column.col_id;
                        return {
                            type: fieldTypes[col_id]?.type as ColumnProps['type'], // Infer type from data, allow override
                            ...column,
                            col_id,
                        };
                    });
                } else {
                    // Prop not provided, create columns from data
                    processedColumns = columnsWithoutGeneratedIndex.map((column) => {
                        const isIndex = column.startsWith(INDEX_COL);
                        return {
                            col_id: column,
                            sticky: isIndex ? 'left' : undefined,
                            label: extractColumnLabel(column, isIndex),
                            type: fieldTypes[column]?.type as ColumnProps['type'],
                            formatter: fieldTypes[column]?.type === 'boolean' ? { type: 'boolean' } : undefined,
                        };
                    });
                    if (!props.include_index) {
                        processedColumns = processedColumns.filter((column) => !column.col_id.startsWith(INDEX_COL));
                    }
                }
                setResolvedColumns(processedColumns);
            })
            .catch((err) => {
                throw new Error(err);
            });
    }, [columnsProp, getData]);

    const debouncedSetSearchQuery = useMemo(() => debounce(setSearchQuery, 500), [setSearchQuery]);

    const [sortingRules, setSortingRules] = useThrottledState<SortingRule[]>([], 300);

    const [filters, setFilters] = useThrottledState<Filter[]>([], 500);

    const datetimeColumns = useMemo(() => getDatetimeColumns(resolvedColumns), [resolvedColumns]);
    const fetchData = useCallback(
        async (startIndex?: number, stopIndex?: number, index?: number) => {
            const response = await getData(combineFilters('AND', [filtersToFilterQuery(filters), searchQuery]), {
                index,
                limit: stopIndex !== undefined && startIndex !== undefined ? stopIndex - startIndex : undefined,
                offset: startIndex !== undefined ? startIndex : undefined,
                sort: sortingRules[0],
            });

            return {
                data: response.data.map((row: DataRow) => {
                    for (const val of datetimeColumns) {
                        // Format datetime timestamps to dates
                        if (typeof row[val] === 'number') {
                            let timestamp = row[val];
                            if (timestamp < 1e12) {
                                // Likely in seconds
                                timestamp *= 1_000; // Convert to milliseconds
                            } else if (timestamp > 1e15) {
                                // Likely in nanoseconds
                                timestamp /= 1_000_000; // Convert to milliseconds
                            }
                            row[val] = formatISO(new Date(timestamp));
                        }
                    }

                    return row;
                }),
                totalCount: response.totalCount,
            };
        },
        [filters, searchQuery, getData, sortingRules, resolvedColumns]
    );

    const extraDataCache = useRef<Record<string, DataRow>>({});

    const onError = useCallback((err: Error) => {
        // eslint-disable-next-line no-console
        console.error('[Table] error while fetching data', err);
    }, []);

    const { getItem, onItemsRendered, itemCount: totalCount } = useInfiniteLoader(fetchData, onError);

    /**
     * Returns a row by index
     * Fetches a few rows around the index and stores them in the extraDataCache
     *
     * @param idx index of row to get
     */
    async function getRowByIndex(idx: number): Promise<DataRow> {
        // populate cache with a few rows around the index if row not in cache
        if (!extraDataCache.current[idx]) {
            const { data } = await fetchData(undefined, undefined, idx);
            for (const row of data) {
                extraDataCache.current[row[INDEX_COL]] = row;
            }
        }

        return extraDataCache.current[idx];
    }
    useEffect(() => {
        extraDataCache.current = {};
    }, [getData]);

    const [style, css] = useComponentStyles(props);
    const onClickRowRaw = useAction(props.onclick_row);
    const onClickRow = useCallback(
        (rows: Omit<DataRow, '__index__'>[]) =>
            onClickRowRaw(
                // Preserve original data column names on click
                // Limitation: If there are columns with duplicate names, data from only one of them will be returned
                rows.map((row) => mapKeys(row, (_, key) => extractColumnLabel(key, key.startsWith(INDEX_COL))))
            ),
        [onClickRowRaw]
    );

    const onSelectRowRaw = useAction(props.onselect_row);
    const onSelectRow = useCallback(
        (rows: Omit<DataRow, '__index__'>[]) =>
            onSelectRowRaw(
                // Preserve original data column names on click
                // Limitation: If there are columns with duplicate names, data from only one of them will be returned
                rows.map((row) => mapKeys(row, (_, key) => extractColumnLabel(key, key.startsWith(INDEX_COL))))
            ),
        [onClickRowRaw]
    );

    const columns = useMemo(() => {
        const mappedCols = mapColumns(resolvedColumns);

        if ((props.show_checkboxes && (props.onclick_row || props.onselect_row)) || props.selected_indices) {
            mappedCols?.unshift(UiTable.ActionColumn([UiTable.Actions.SELECT], 'select_box_col', 'left', true));
        }
        return mappedCols;
    }, [resolvedColumns, props.onclick_row]);

    const onSelect = useCallback(
        async (row: any, isCheckboxSelect: boolean = false): Promise<void> => {
            // If selected row has already been selected
            let selectedRows: Omit<DataRow, '__index__'>[] | null = null;
            if ((selectedRowIndices ?? []).find((idx) => row[INDEX_COL] === idx) !== undefined) {
                // Remove it from selected indices
                const newSelectedIndices = (selectedRowIndices ?? []).filter((idx) => row[INDEX_COL] !== idx);
                setSelectedRowIndices(newSelectedIndices);

                if (props.multi_select) {
                    // In multiselect mode, send selected rows
                    selectedRows = cleanIndex(await Promise.all(newSelectedIndices.map((idx) => getRowByIndex(idx))));
                }
            } else {
                let newSelectedIndices = [...(selectedRowIndices ?? []), row[INDEX_COL]];

                // If not in multiselect mode then only the new row is selected
                if (!props.multi_select) {
                    newSelectedIndices = [row[INDEX_COL]];
                }

                setSelectedRowIndices(newSelectedIndices);
                selectedRows = cleanIndex(await Promise.all(newSelectedIndices.map((idx) => getRowByIndex(idx))));
            }
            if (isCheckboxSelect) {
                onSelectRow(selectedRows);
            }
            if (!props.supress_click_events_for_selection) {
                onClickRow(selectedRows);
            }
        },
        [selectedRowIndices, getItem]
    );

    const onAction = useCallback(
        (actionId: string, row: any): void => {
            if (actionId === UiTable.Actions.SELECT.id) {
                onSelect(row, true);
            }
        },
        [onSelect]
    );

    const searchColumns = useMemo(() => {
        if (props.search_columns) {
            return props.search_columns;
        }

        return [];
    }, []);

    const onSearchChange = (searchTerm: string): void => {
        const searchTermClean = searchTerm.trim().toLowerCase();

        // Construct filter query
        const newSearchQuery: ClauseQuery =
            searchTermClean.length > 0 ?
                {
                    clauses: searchColumns.map((col) => ({
                        column: col,
                        operator: 'CONTAINS',
                        value: searchTermClean,
                    })),
                    combinator: 'OR',
                }
            :   null;

        debouncedSetSearchQuery(newSearchQuery);
    };

    const onFilter: ComponentProps<typeof UiTable>['onFilter'] = (newFilters: Filter[]) => {
        if (newFilters.length !== filters.length || !isEqual(newFilters, filters)) {
            setFilters(newFilters);
        }
        return Promise.resolve();
    };

    const onSort: ComponentProps<typeof UiTable>['onSort'] = (sort) => {
        if (sort.length !== sortingRules.length || !isEqual(sort, sortingRules)) {
            setSortingRules(sort);
        }
    };

    /**
     * Item getter which also appends whether the row is selected or not
     *
     * @param idx index
     */
    const getItemWithSelected = useCallback(
        (idx: number): InternalDataRow => {
            const row = getItem(idx);

            if (!row) {
                return undefined;
            }

            return { ...row, selected: (selectedRowIndices ?? []).includes(row[INDEX_COL]) };
        },
        [getItem, selectedRowIndices]
    );

    return (
        <TableWrapper
            $rawCss={css}
            style={{
                display: 'flex',
                flex: '1 1 auto',
                flexDirection: 'column',
                // Set a min height so at the very least Table shows header and one row
                minHeight: props.searchable ? '9rem' : '6rem',
                overflow: 'auto',
                position: 'relative',
                ...style,
            }}
        >
            {props.searchable && (
                <TableSearch>
                    <Input onChange={onSearchChange} placeholder="Search Table..." />
                </TableSearch>
            )}
            {/* paddingBottom is needed due to an issue with AutoSizer constantly recalculating the height */}
            {/* width is needed due to an issue with AutoSizer miscalculating the width to be a value greater than it should be */}
            {resolvedColumns && (
                <div
                    style={{
                        bottom: 0,
                        height: props.searchable ? 'calc(100% - 3rem)' : '100%',
                        left: 0,
                        paddingBottom: '1.1rem',
                        position: 'absolute',
                        right: 0,
                        top: props.searchable ? '3rem' : 0,
                        width: 'calc(100% - 1px)',
                    }}
                >
                    <UiTable
                        columns={columns}
                        getItem={getItemWithSelected}
                        itemCount={totalCount}
                        maxRows={props.max_rows}
                        onAction={onAction}
                        onClickRow={props.onclick_row && onSelect}
                        onFilter={onFilter}
                        onItemsRendered={onItemsRendered}
                        onSort={onSort}
                        style={{ padding: 0 }}
                    />
                </div>
            )}
        </TableWrapper>
    );
}

export default Table;
