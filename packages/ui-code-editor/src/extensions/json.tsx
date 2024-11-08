import { closeBrackets } from '@codemirror/autocomplete';
import { json, jsonLanguage, jsonParseLinter } from '@codemirror/lang-json';
import { bracketMatching } from '@codemirror/language';
import { linter } from '@codemirror/lint';
import type { Extension } from '@codemirror/state';
import { lineNumbers } from '@codemirror/view';

/**
 * Get the extensions for JSON
 * Currently includes:
 * - lineNumbers
 * - json
 * - jsonLanguage
 * - linter
 * - bracketMatching
 * - closeBrackets
 *
 * @returns - an array of extensions for JSON
 */
export const getJSONExtensions = (): Extension[] => [
    lineNumbers(),
    json(),
    jsonLanguage,
    linter(jsonParseLinter()),
    bracketMatching(),
    closeBrackets(),
];
