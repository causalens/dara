import { StyledComponentProps, Variable, injectCss, useComponentStyles, useVariable } from '@darajs/core';
import { CodeEditor as UICodeEditor } from '@darajs/ui-code-editor';

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

    return (
        <StyledCodeEditor
            $rawCss={css}
            initialScript={script}
            onChange={setScript}
            style={style}
            language={props.language}
        />
    );
}

export default CodeEditor;
