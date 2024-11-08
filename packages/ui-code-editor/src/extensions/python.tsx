import { closeBrackets } from '@codemirror/autocomplete';
import { python, pythonLanguage } from '@codemirror/lang-python';
import { bracketMatching } from '@codemirror/language';
import type { Extension } from '@codemirror/state';
import { lineNumbers } from '@codemirror/view';

/**
 * Get the extensions for Python
 * Currently includes:
 * - lineNumbers
 * - python
 * - pythonLanguage
 * - bracketMatching
 * - closeBrackets
 *
 * @returns - an array of extensions for Python
 */
export const getPythonExtensions = (): Extension[] => {
    return [lineNumbers(), python(), pythonLanguage, bracketMatching(), closeBrackets()];
};
