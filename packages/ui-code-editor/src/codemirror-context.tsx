import type { EditorView } from '@codemirror/view';
import * as React from 'react';

interface CodeMirrorContextInterface {
    /**
     *
     * The current editor view.
     */
    editorView: EditorView;
    /**
     *
     * Set the editor view
     */
    setEditorView: (editorView: EditorView) => void;
}

const noop = (): void => {};

export const CodeMirrorContext = React.createContext<CodeMirrorContextInterface>({
    editorView: null as unknown as EditorView,
    setEditorView: noop,
});

export function useCodeMirrorContext(): CodeMirrorContextInterface {
    return React.useContext(CodeMirrorContext);
}
