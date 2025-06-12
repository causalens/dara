import { type FilterQuery, type QueryCombinator } from '@/types';

/**
 * Combine filters with a given combinator
 *
 * @param combinator combinator to use
 * @param queries any number of queries to combine
 */
export function combineFilters(
    combinator: QueryCombinator,
    queries: Array<FilterQuery | undefined | null>
): FilterQuery | null {
    const validQueries = queries.filter(Boolean) as FilterQuery[]; // filter out undefined/null values

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
