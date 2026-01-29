import { formatISO } from 'date-fns';
import debounce from 'lodash/debounce';
import isEqual from 'lodash/isEqual';
import mapKeys from 'lodash/mapKeys';
import { type ComponentProps, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
    type Action,
    type ClauseQuery,
    type ColumnTypeHint,
    type DataFrame,
    type DataFrameSchema,
    DefaultFallback,
    type DerivedVariable,
    type FilterQuery,
    type QueryOperator,
    type ServerVariable,
    type SingleVariable,
    type StyledComponentProps,
    UserError,
    type Variable,
    combineFilters,
    getIcon,
    injectCss,
    useAction,
    useComponentStyles,
    useTabularVariable,
    useVariable,
} from '@darajs/core';
import styled from '@darajs/styled-components';
import { Input, type Item, Table as UiTable, useInfiniteLoader } from '@darajs/ui-components';
import { type SortingRule, useThrottledState } from '@darajs/ui-utils';

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
    data: SingleVariable<DataFrame> | DerivedVariable | ServerVariable | DataFrame;
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
     * On action handler; when provided, is called when an action is performed
     */
    on_action?: Action;
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
    suppress_click_events_for_selection?: boolean;
    /**
     * Whether to render the index column
     */
    include_index?: boolean;

    /**
     * Set a Row Height for the table, if not set, the row height will be the table default(font size * 2.5)
     */

    row_height?: number;

    /**
     * Optional actions for the table
     */
    actions?: Array<ActionProps>;
}

interface ActionProps {
    icon_name: string;
    label: string;
    id: string;
}

interface ColumnProps {
    align?: string;
    col_id: string;
    filter?: 'text' | 'categorical' | 'numeric' | 'datetime';
    formatter?: { [k: string]: any };
    label?: string;
    sticky?: string;
    tooltip?: string;
    type?: 'number' | 'string' | 'datetime' | 'datetime64[ns]' | 'datetime64[us]' | 'datetime64[ms]' | 'datetime64[s]';
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

const columnSortTypes: Record<NonNullable<ColumnProps['type']>, (a: any, b: any, id: string) => number> = {
    datetime: (a, b, id) => compareDateStrings(a.values[id], b.values[id]),
    'datetime64[ms]': (a, b, id) => compareDateStrings(a.values[id], b.values[id]),
    'datetime64[us]': (a, b, id) => compareDateStrings(a.values[id], b.values[id]),
    'datetime64[ns]': (a, b, id) => compareDateStrings(a.values[id], b.values[id]),
    'datetime64[s]': (a, b, id) => compareDateStrings(a.values[id], b.values[id]),
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

function selectedToOperator(selected: string): QueryOperator | null {
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
function filtersToFilterQuery(filters: Filter[]): FilterQuery | null {
    if (filters.length === 0) {
        return null;
    }

    return {
        clauses: filters
            .map((filt) => {
                let cleanValue: string | number | Array<string> | null = null;
                let operator: QueryOperator | null = null;

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

                if (String(cleanValue).length === 0 || operator === null) {
                    return null;
                }

                return {
                    column: filt.id,
                    operator,
                    value: cleanValue,
                } satisfies FilterQuery;
            })
            .filter((x) => x !== null && x !== undefined),
        combinator: 'AND',
    };
}

/**
 * Infer which columns are datetime columns and should be formatted.
 *
 * If column has datetime formatter, datetime filter, or type=datetime then its a datetime column
 */
function getDatetimeColumns(columns: ColumnProps[]): [id: string, type: string | undefined][] {
    return columns
        .filter(
            (col) => col?.formatter?.type === 'datetime' || col?.type?.includes('datetime') || col.filter === 'datetime'
        )
        .map((c) => [c.col_id, c.type]);
}

type DatetimeUnit = 'ns' | 'us' | 'ms' | 's';

function extractDatetimeUnit(dtypeString: string | undefined): DatetimeUnit {
    if (!dtypeString) {
        return 'ns';
    }
    // Extract unit from strings like 'datetime64[ns]', 'datetime64[ms]', etc.
    const match = dtypeString.match(/datetime64\[(\w+)\]/);
    return match ? (match[1] as DatetimeUnit) : 'ns'; // default to nanoseconds
}

function parseTimestamp(timestamp: number | null, colType: string | undefined): string {
    if (!timestamp) {
        return String(timestamp);
    }

    const unit = extractDatetimeUnit(colType);
    let timestampMs;

    switch (unit) {
        case 's':
            timestampMs = timestamp * 1000;
            break;
        case 'ms':
            timestampMs = timestamp;
            break;
        case 'us':
            timestampMs = timestamp / 1000;
            break;
        case 'ns':
            timestampMs = timestamp / 1_000_000;
            break;
        default:
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            return String(timestamp);
    }
    return formatISO(new Date(timestampMs));
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

function getColumnHints(columns: ColumnProps[]): Record<string, ColumnTypeHint> {
    return columns.reduce(
        (acc, column) => {
            acc[column.col_id] = { type: column.type, filter: column.filter };
            return acc;
        },
        {} as Record<string, ColumnTypeHint>
    );
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

function resolveColumns(
    dataRow: Record<string, any>,
    schema: DataFrameSchema | null,
    columnsProp: ColumnProps[] | null,
    includeIndex?: boolean
): ColumnProps[] {
    const columns = Object.keys(dataRow);
    const fieldTypes =
        schema ?
            Object.fromEntries(
                schema.fields.flatMap((field) => {
                    const key = Array.isArray(field.name) ? field.name.join('_') : field.name;
                    return [[key, { type: field.type }]];
                })
            )
        :   null;

    const columnsWithoutGeneratedIndex = columns.filter((col) => col !== INDEX_COL);
    let processedColumns: ColumnProps[];

    if (columnsProp) {
        // Prop provided, parse the columns provided and map them to the columns from data
        // Limitation: If there are columns with duplicate names, data from only one of them will be shown
        const reverseColumnIdMap = Object.fromEntries(
            columnsWithoutGeneratedIndex.map((col) => [extractColumnLabel(col, col.startsWith(INDEX_COL)), col])
        ); // name -> __col__1__name
        processedColumns = columnsProp.map((column) => {
            const col_id = reverseColumnIdMap[column.col_id] ?? column.col_id;
            return {
                ...column,
                type: column.type ?? (fieldTypes?.[col_id]?.type as ColumnProps['type']), // Infer type from data, allow override
                col_id,
            };
        });
    } else {
        // Prop not provided, create columns from data
        processedColumns = columnsWithoutGeneratedIndex.map((column) => {
            const isIndex = column.startsWith(INDEX_COL);
            let formatter: ColumnProps['formatter'];

            if (fieldTypes) {
                if (fieldTypes[column]?.type === 'boolean') {
                    formatter = { type: 'boolean' };
                } else if ((fieldTypes[column]?.type ?? '').includes('datetime')) {
                    formatter = { type: 'datetime' };
                }
            }

            return {
                col_id: column,
                sticky: isIndex ? 'left' : undefined,
                label: extractColumnLabel(column, isIndex),
                type: fieldTypes?.[column]?.type as ColumnProps['type'],
                formatter,
            };
        });
        if (!includeIndex) {
            processedColumns = processedColumns.filter((column) => !column.col_id.startsWith(INDEX_COL));
        }
    }

    return processedColumns;
}

const TableWrapper = injectCss('div');

function Table(props: TableProps): JSX.Element {
    const getData = useTabularVariable(props.data);
    const [selectedRowIndices, setSelectedRowIndices] = useVariable(props.selected_indices);

    const [columnsProp] = useVariable(props.columns);
    const resolvedPropColumns = useMemo(() => (columnsProp ? getColumnProps(columnsProp) : null), [columnsProp]);
    const columnHints = useMemo(() => getColumnHints(resolvedPropColumns ?? []), [resolvedPropColumns]);
    const [resolvedColumns, setResolvedColumns] = useState<ColumnProps[] | null>(null);

    const [searchQuery, setSearchQuery] = useState<ClauseQuery | null>(null);
    const debouncedSetSearchQuery = useMemo(() => debounce(setSearchQuery, 500), [setSearchQuery]);

    const [sortingRules, setSortingRules] = useThrottledState<SortingRule[]>([], 300);
    const [filters, setFilters] = useThrottledState<Filter[]>([], 500);

    const fetchData = useCallback(
        async (startIndex?: number, stopIndex?: number, index?: number) => {
            const { data, count, schema } = await getData(
                combineFilters('AND', [filtersToFilterQuery(filters), searchQuery]),
                {
                    index,
                    limit: stopIndex !== undefined && startIndex !== undefined ? stopIndex - startIndex : undefined,
                    offset: startIndex !== undefined ? startIndex : undefined,
                    sort: sortingRules[0],
                },
                columnHints
            );

            if (data === null || data.length === 0) {
                setResolvedColumns([]);
                return { data: [], totalCount: count };
            }

            // update columns with schema on each fetch
            const columns = resolveColumns(data[0]!, schema, resolvedPropColumns, props.include_index);
            setResolvedColumns(columns);
            const datetimeColumns = getDatetimeColumns(columns);

            return {
                data: data.map((row) => {
                    for (const [colId, colType] of datetimeColumns) {
                        // Format datetime timestamps to dates
                        if (typeof row[colId] === 'number') {
                            row[colId] = parseTimestamp(row[colId], colType);
                        }
                    }

                    return row;
                }),
                totalCount: count,
            };
        },
        [getData, filters, searchQuery, sortingRules, resolvedPropColumns, props.include_index, columnHints]
    );

    const extraDataCache = useRef<Record<string, DataRow>>({});

    // throw user errors to error boundary
    // workaround for error-boundaries not catching errors from async code
    const [userError, setUserError] = useState<Error | null>(null);
    if (userError) {
        throw userError;
    }
    const onError = useCallback((err: Error) => {
        if (err instanceof UserError) {
            setUserError(err);
        }
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
    const getRowByIndex = useCallback(
        async (idx: number): Promise<DataRow> => {
            // populate cache with a few rows around the index if row not in cache
            if (!extraDataCache.current[idx]) {
                const { data } = await fetchData(undefined, undefined, idx);
                for (const row of data) {
                    extraDataCache.current[row[INDEX_COL]] = row as DataRow;
                }
            }

            return extraDataCache.current[idx]!;
        },
        [fetchData]
    );

    useLayoutEffect(() => {
        extraDataCache.current = {};
    }, [getData]);

    const [style, css] = useComponentStyles(props);
    const onClickRowRaw = useAction(props.onclick_row);
    const onClickRow = useCallback(
        (rows: Omit<DataRow, '__index__'>[] | null) =>
            onClickRowRaw(
                // Preserve original data column names on click
                // Limitation: If there are columns with duplicate names, data from only one of them will be returned
                rows?.map((row) => mapKeys(row, (_, key) => extractColumnLabel(key, key.startsWith(INDEX_COL)))) ?? null
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
        [onSelectRowRaw]
    );

    const columns = useMemo(() => {
        if (resolvedColumns === null) {
            return null;
        }

        const mappedCols = mapColumns(resolvedColumns);

        if ((props.show_checkboxes && (props.onclick_row || props.onselect_row)) || props.selected_indices) {
            mappedCols?.unshift(UiTable.ActionColumn([UiTable.Actions.SELECT], 'select_box_col', 'left', true));
        }

        return mappedCols;
    }, [resolvedColumns, props.show_checkboxes, props.onclick_row, props.selected_indices, props.onselect_row]);

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
                onSelectRow(selectedRows || []);
            }

            // If we don't want to suppress click events for selection, we want to trigger the click event as is before
            if (!props.suppress_click_events_for_selection) {
                onClickRow(selectedRows);
            }

            // If suppression is enabled, we want to trigger the click event and return the whole row
            else if (!isCheckboxSelect) {
                onClickRow(cleanIndex([row]));
            }
        },
        [
            selectedRowIndices,
            setSelectedRowIndices,
            props.multi_select,
            onClickRow,
            getRowByIndex,
            onSelectRow,
            props.suppress_click_events_for_selection,
        ]
    );

    const onActionRaw = useAction(props.on_action);

    const onAction = useCallback(
        (actionId: string, row: any): void => {
            if (actionId === UiTable.Actions.SELECT.id) {
                onSelect(row, true);
            }

            // Call the on_action handler, if it doesn't exist, it is a no-op anyways
            onActionRaw({
                action_id: actionId,
                data: row,
            });
        },
        [onSelect, onActionRaw]
    );

    const actions = useMemo(
        () =>
            props.actions?.map((action) => ({
                icon: getIcon(action.icon_name),
                label: action.label,
                id: action.id,
            })) ?? [],
        [props.actions]
    );

    const searchColumns = useMemo(() => props.search_columns ?? [], [props.search_columns]);

    const onSearchChange = (searchTerm: string): void => {
        const searchTermClean = searchTerm.trim().toLowerCase();

        // Construct filter query
        const newSearchQuery: ClauseQuery | null =
            searchTermClean.length > 0 ?
                ({
                    clauses: searchColumns.map((col) => ({
                        column: col,
                        operator: 'CONTAINS',
                        value: searchTermClean,
                    })),
                    combinator: 'OR',
                } satisfies ClauseQuery)
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
        (idx: number): InternalDataRow | undefined => {
            const row = getItem(idx) as DataRow | undefined;

            if (!row) {
                return undefined;
            }

            return { ...row, selected: (selectedRowIndices ?? []).includes(row[INDEX_COL]) };
        },
        [getItem, selectedRowIndices]
    );

    return (
        <TableWrapper
            id={props.id_}
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
                        rowHeight={props.row_height}
                        actions={actions}
                        style={{ padding: 0 }}
                    />
                </div>
            )}
            {!resolvedColumns && <DefaultFallback />}
        </TableWrapper>
    );
}

export default Table;
