import { type Extension } from '@codemirror/state';

import { getJSONExtensions } from './json';
import { getMarkdownExtensions } from './markdown';
import { getPythonExtensions } from './python';
import { getSQLExtensions } from './sql';

export type LangsType = 'json' | 'markdown' | 'python' | 'sql';

export function getExtensionsForLang(lang?: LangsType): Extension {
    switch (lang) {
        case 'python':
            return getPythonExtensions();
        case 'json':
            return getJSONExtensions();
        case 'markdown':
            return getMarkdownExtensions();
        case 'sql':
            return getSQLExtensions();
        default:
            return [];
    }
}
