import { FilterQuery, QueryCombinator } from '@/types';

/**
 * Combine filters with a given combinator
 *
 * @param combinator combinator to use
 * @param queries any number of queries to combine
 */
export function combineFilters(combinator: QueryCombinator, queries: FilterQuery[]): FilterQuery {
    const validQueries = queries.filter(Boolean); // filter out undefined/null values

    if (validQueries.length === 0) {
        return null;
    }

    if (validQueries.length === 1) {
        return validQueries[0];
    }

    return {
        clauses: validQueries,
        combinator,
    };
}
