import { ViewUpdate } from '@codemirror/view';
import * as React from 'react';

import { StyledComponentProps, Variable, injectCss, useComponentStyles, useVariable } from '@darajs/core';

import { UiCodeEditor } from './ui-code-editor';
import { LangsType, getExtensionsForLang } from './ui-code-editor/extensions/lang';

interface CodeEditorProps extends StyledComponentProps {
    script: Variable<string>;
    language?: LangsType;
}

const StyledCodeEditor = injectCss(UiCodeEditor);

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

    const extensions = React.useMemo(() => getExtensionsForLang(props.language), [props.language]);

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
