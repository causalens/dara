import { ViewUpdate } from '@codemirror/view';
import * as React from 'react';

import { StyledComponentProps, Variable, injectCss, useComponentStyles, useVariable } from '@darajs/core';

import { CodeEditor as UICodeEditor } from './ui-code-editor';
import { getJSONExtensions } from './ui-code-editor/extensions/json';
import { getMarkdownExtensions } from './ui-code-editor/extensions/markdown';
import { getPythonExtensions } from './ui-code-editor/extensions/python';
import { getSQLExtensions } from './ui-code-editor/extensions/sql';

interface CodeEditorProps extends StyledComponentProps {
    script: Variable<string>;
    language?: 'json' | 'python' | 'markdown' | 'sql';
}

const StyledCodeEditor = injectCss(UICodeEditor);

/**
 * A component that creates a CodeEditor. The script is stored in a variable and is updated
 * as user types in the code editor area.
 */
function CodeEditor(props: CodeEditorProps): JSX.Element {
    const [style, css] = useComponentStyles(props);
    const [script, setScript] = useVariable(props.script);

    const onChange = React.useCallback(
        (update: ViewUpdate) => {
            if (update.docChanged) {
                setScript(update.state.doc.toString());
            }
        },
        [setScript]
    );

    const extensions = React.useMemo(() => {
        if (props.language === 'json') {
            return getJSONExtensions();
        }
        if (props.language === 'python') {
            return getPythonExtensions();
        }
        if (props.language === 'markdown') {
            return getMarkdownExtensions();
        }
        if (props.language === 'sql') {
            return getSQLExtensions();
        }
        return [];
    }, [props.language]);

    return (
        <StyledCodeEditor
            $rawCss={css}
            initialValue={script}
            onChange={onChange}
            style={style}
            extensions={extensions}
        />
    );
}

export default CodeEditor;
