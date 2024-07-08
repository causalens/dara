/**
 * Copyright 2023 Impulse Innovations Limited
 *
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { closeBrackets } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { json } from '@codemirror/lang-json';
import { python } from '@codemirror/lang-python';
import { bracketMatching, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { searchKeymap } from '@codemirror/search';
import { EditorState, StateField } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { useEffect, useRef } from 'react';

import styled from '@darajs/styled-components';

const EditorRoot = styled.div`
    overflow-y: scroll;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;

    border: 1px solid ${(props) => props.theme.colors.grey3};

    .cm-wrap {
        flex: 1 1 auto;
        color: ${(props) => props.theme.colors.text};
    }

    .cm-gutters {
        color: ${(props) => props.theme.colors.grey4};
        background-color: ${(props) => props.theme.colors.grey2};
        border-right-color: ${(props) => props.theme.colors.grey3};
    }
`;

export interface CodeEditorProps {
    /**
     * Standard classname prop
     */
    className?: string;
    /**
     * Whether the code editor should be disabled
     */
    disabled?: boolean;
    /**
     * The initial script
     */
    initialScript?: string;
    /**
     * An optional onChange handler for listening to updates
     */
    onChange?: (e: string) => void | Promise<void>;
    /**
     * Standard style prop
     */
    style?: React.CSSProperties;
}

/**
 * The CodeEditor component.
 * Currently has JSON and Python langauge support.
 */
function CodeEditor({ initialScript, disabled, onChange, style, className }: CodeEditorProps): JSX.Element {
    const editorRef = useRef();

    useEffect(() => {
        if (editorRef.current) {
            // Simple codemirror extension that sends updates up
            const dispatchChanges = StateField.define({
                create() {
                    return true;
                },
                update(value, tr) {
                    if (onChange) {
                        // this works, but toString() is not documented in the type
                        // eslint-disable-next-line @typescript-eslint/no-base-to-string
                        onChange(tr.state.doc.toString());
                    }

                    return true;
                },
            });

            // Configure extensions; for now these match the CLDS configuration
            const startState = EditorState.create({
                doc: initialScript ?? '',
                extensions: [
                    lineNumbers(),
                    dispatchChanges,
                    history(),
                    python(),
                    json(),
                    bracketMatching(),
                    closeBrackets(),
                    syntaxHighlighting(defaultHighlightStyle),
                    EditorState.tabSize.of(4),
                    EditorView.editable.of(!disabled),
                    keymap.of([...defaultKeymap, ...searchKeymap, ...historyKeymap, indentWithTab]),
                ],
            });

            const view = new EditorView({
                parent: editorRef.current,
                state: startState,
            });

            return () => view.destroy();
        }
        // this is explicitly only created once
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return <EditorRoot className={className} ref={editorRef} style={style} />;
}

export default CodeEditor;
