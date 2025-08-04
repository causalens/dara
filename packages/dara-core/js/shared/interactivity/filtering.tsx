import { parseISO } from 'date-fns';

import { type DataFrame, type FilterQuery, type Pagination, type QueryCombinator, type QueryOperator } from '@/types';

import type { ColumnTypeHint, DataResponse } from './tabular-variable';

const COLUMN_PREFIX_REGEX = /__(?:col|index)__\d+__/;

export enum ColumnType {
    CATEGORICAL = 'categorical',
    DATETIME = 'datetime',
    NUMERICAL = 'numerical',
}

/**
 * Combine filters with a given combinator
 *
 * @param combinator combinator to use
 * @param queries any number of queries to combine
 */
export function combineFilters(combinator: QueryCombinator, queries: Array<FilterQuery | null>): FilterQuery | null {
    const validQueries = queries.filter((x) => x !== null && x !== undefined);

    if (validQueries.length === 0) {
        return null;
    }

    if (validQueries.length === 1) {
        return validQueries[0]!;
    }

    return {
        clauses: validQueries,
        combinator,
    };
}

/**
 * Infer column type from a value and optional type hints
 *
 * @param value sample value from the column
 * @param hint optional type hint from column definition
 */
export function inferColumnType(value: any, hint?: ColumnTypeHint): ColumnType {
    // Use explicit hints first
    if (hint?.type?.includes('datetime') || hint?.filter === 'datetime') {
        return ColumnType.DATETIME;
    }
    if (hint?.type === 'number' || hint?.filter === 'numeric') {
        return ColumnType.NUMERICAL;
    }
    if (hint?.type === 'string' || hint?.filter === 'text' || hint?.filter === 'categorical') {
        return ColumnType.CATEGORICAL;
    }

    // Fallback to value-based inference
    if (typeof value === 'number') {
        return ColumnType.NUMERICAL;
    }
    if (typeof value === 'string') {
        return ColumnType.CATEGORICAL;
    }
    if (value instanceof Date) {
        return ColumnType.DATETIME;
    }

    return ColumnType.CATEGORICAL;
}

/**
 * Apply a single filter to a row
 *
 * @param row data row
 * @param column column name
 * @param operator query operator
 * @param value filter value
 * @param columnHints optional column type hints
 */
function filterRow(
    row: Record<string, any>,
    column: string,
    operator: QueryOperator,
    value: any,
    columnHints?: Record<string, ColumnTypeHint>
): boolean {
    const cellValue = row[column];

    // Handle CONTAINS operator specially - always treat as string
    if (operator === 'CONTAINS') {
        return String(cellValue).toLowerCase().includes(String(value).toLowerCase());
    }

    const colType = inferColumnType(cellValue, columnHints?.[column]);

    try {
        let processedValue = value;
        let processedCellValue = cellValue;

        // Handle categorical filters (arrays)
        if (Array.isArray(value)) {
            return value.includes(cellValue);
        }

        // Type conversion based on column type
        if (colType === ColumnType.DATETIME) {
            if (Array.isArray(value)) {
                processedValue = value.map((v) => new Date(v).getTime());
            } else {
                processedValue = new Date(value).getTime();
            }
            // DateTime columns contain number timestamps, not strings
            if (typeof cellValue === 'number') {
                processedCellValue = cellValue;
            } else if (cellValue instanceof Date) {
                processedCellValue = cellValue.getTime();
            } else if (typeof cellValue === 'string') {
                processedCellValue = parseISO(cellValue).getTime();
            } else {
                processedCellValue = 0;
            }
        } else if (colType === ColumnType.CATEGORICAL) {
            processedValue = String(value);
            processedCellValue = String(cellValue);
        } else if (colType === ColumnType.NUMERICAL) {
            if (Array.isArray(value)) {
                processedValue = value.map((v) => {
                    const num = Number(v);
                    return Number.isNaN(num) ? 0 : num;
                });
            } else {
                const num = Number(value);
                processedValue = Number.isNaN(num) ? 0 : num;
            }
            const cellNum = Number(cellValue);
            processedCellValue = Number.isNaN(cellNum) ? 0 : cellNum;
        }

        // Apply operator
        switch (operator) {
            case 'GT':
                return processedCellValue > processedValue;
            case 'LT':
                return processedCellValue < processedValue;
            case 'NE':
                return processedCellValue !== processedValue;
            case 'BT':
                if (Array.isArray(processedValue) && processedValue.length === 2) {
                    return processedCellValue >= processedValue[0] && processedCellValue <= processedValue[1];
                }
                return false;
            case 'EQ':
            default:
                return processedCellValue === processedValue;
        }
    } catch (error) {
        // If any error occurred, don't filter the row
        // eslint-disable-next-line no-console
        console.warn('Filter error:', error, { column, value, operator });
        return true;
    }
}

/**
 * Resolve a FilterQuery to determine if a row should be included
 *
 * @param row data row
 * @param query filter query
 * @param columnHints optional column type hints
 */
function resolveFilterQuery(
    row: Record<string, any>,
    query: FilterQuery,
    columnHints?: Record<string, ColumnTypeHint>
): boolean {
    // ValueQuery
    if ('column' in query) {
        const cleanColumn = query.column.replace(COLUMN_PREFIX_REGEX, '');
        return filterRow(row, cleanColumn, query.operator, query.value, columnHints);
    }

    // ClauseQuery
    const results = query.clauses.map((clause) => resolveFilterQuery(row, clause, columnHints));

    if (query.combinator === 'AND') {
        return results.every((result) => result);
    }
    if (query.combinator === 'OR') {
        return results.some((result) => result);
    }

    return true;
}

/**
 * Apply filters and pagination to tabular data
 *
 * @param data array of data rows
 * @param filters optional filter query
 * @param pagination optional pagination settings
 * @param columnHints optional column type hints
 */
export function applyFilters(
    data: DataFrame,
    filters?: FilterQuery | null,
    pagination?: Pagination | null,
    columnHints?: Record<string, ColumnTypeHint>
): DataResponse {
    if (!data || data.length === 0) {
        return { data: [], count: 0, schema: null };
    }

    let filteredData = data;

    // Apply filters
    if (filters) {
        filteredData = data.filter((row) => resolveFilterQuery(row, filters, columnHints));
    }

    const totalCount = filteredData.length;

    // Apply pagination
    if (pagination) {
        // Handle specific index request
        if (pagination.index !== undefined) {
            const targetRow = data[pagination.index];
            return {
                data: targetRow ? [targetRow] : [],
                count: totalCount,
                schema: null,
            };
        }

        // Apply sorting
        if (pagination.sort) {
            const { id, desc } = pagination.sort;
            filteredData = [...filteredData].sort((a, b) => {
                const aVal = a[id];
                const bVal = b[id];

                // Handle null/undefined values
                if (aVal == null && bVal == null) {
                    return 0;
                }
                if (aVal == null) {
                    return desc ? 1 : -1;
                }
                if (bVal == null) {
                    return desc ? -1 : 1;
                }

                // Infer type for sorting
                const colType = inferColumnType(aVal, columnHints?.[id]);

                let comparison = 0;
                if (colType === ColumnType.NUMERICAL) {
                    comparison = Number(aVal) - Number(bVal);
                } else if (colType === ColumnType.DATETIME) {
                    // DateTime columns contain number timestamps
                    let aTime = 0;
                    if (typeof aVal === 'number') {
                        aTime = aVal;
                    } else if (aVal instanceof Date) {
                        aTime = aVal.getTime();
                    } else if (typeof aVal === 'string') {
                        aTime = parseISO(aVal).getTime();
                    }

                    let bTime = 0;
                    if (typeof bVal === 'number') {
                        bTime = bVal;
                    } else if (bVal instanceof Date) {
                        bTime = bVal.getTime();
                    } else if (typeof bVal === 'string') {
                        bTime = parseISO(bVal).getTime();
                    }
                    comparison = aTime - bTime;
                } else {
                    comparison = String(aVal).localeCompare(String(bVal));
                }

                return desc ? -comparison : comparison;
            });
        }

        // Apply pagination slice
        const startIndex = pagination.offset || 0;
        const endIndex = pagination.limit ? startIndex + pagination.limit : filteredData.length;
        filteredData = filteredData.slice(startIndex, endIndex);
    }

    return {
        data: filteredData,
        count: totalCount,
        schema: null,
    };
}

export function createFetcher(df: DataFrame) {
    // eslint-disable-next-line @typescript-eslint/require-await
    return async (filters: FilterQuery | null, pagination: Pagination | null) => {
        return applyFilters(df, filters, pagination);
    };
}
