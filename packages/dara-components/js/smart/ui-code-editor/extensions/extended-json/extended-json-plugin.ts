// This file is an adapted version of https://github.com/codemirror/lang-json/blob/main/src/json.ts,
// utilizing an extended grammar to support JSON with newlines in strings
import { CMLanguage } from '@darajs/components';

import { parser } from './extended-json-parser';

const { LRLanguage, LanguageSupport, continuedIndent, foldInside, foldNodeProp, indentNodeProp } = CMLanguage;

/// A language provider that provides JSON parsing.
export const jsonLanguage = LRLanguage.define({
    name: 'json',
    parser: parser.configure({
        props: [
            indentNodeProp.add({
                Object: continuedIndent({ except: /^\s*\}/ }),
                Array: continuedIndent({ except: /^\s*\]/ }),
            }),
            foldNodeProp.add({
                'Object Array': foldInside,
            }),
        ],
    }),
    languageData: {
        closeBrackets: { brackets: ['[', '{', '"'] },
        indentOnInput: /^\s*[}\]]$/,
    },
});

/// JSON language support.
export function json(): CMLanguage.LanguageSupport {
    return new LanguageSupport(jsonLanguage);
}
