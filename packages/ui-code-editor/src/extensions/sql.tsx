import { closeBrackets } from '@codemirror/autocomplete';
import { StandardSQL, sql } from '@codemirror/lang-sql';
import { bracketMatching } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { lineNumbers } from '@codemirror/view';

/**
 * Get the extensions for SQL
 * Currently includes:
 * - lineNumbers
 * - sql
 * - StandardSQL
 * - bracketMatching
 * - closeBrackets
 *
 * @returns - an array of extensions for SQL
 */
export const getSQLExtensions = (): Extension[] => [
    lineNumbers(),
    sql(),
    StandardSQL,
    bracketMatching(),
    closeBrackets(),
];
