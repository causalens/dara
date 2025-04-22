import { autocompletion } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import { EditorState, Prec } from '@codemirror/state';
import type { Tooltip as CodemirrorTooltip, KeyBinding, ViewUpdate } from '@codemirror/view';
import { EditorView, hoverTooltip, keymap, tooltips } from '@codemirror/view';
import '@vscode/codicons/dist/codicon.css';
import type { FunctionComponent } from 'react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import type { KeyBindingMap } from 'tinykeys';
import type { Range } from 'vscode-languageserver-types';

import { WebSocketCtx } from '@darajs/core';
import styled, { useTheme } from '@darajs/styled-components';
import { useFocusTinykeys, useLatestCallback, useLatestRef, useOnClickOutside } from '@darajs/ui-utils';

import { useCodeMirrorContext } from './codemirror-context';
import { argumentHints, closeArgumentsHintsTooltip } from './extensions/argument-hints';
import { getLspCompletion, getLspDefinition, getLspInspection } from './extensions/lsp-utils';
import type { ThemeType } from './extensions/shared';
import { getDefaultExtensions, goToDefinitionExtension } from './extensions/shared';
import type { LSPDefinition, LspHoverResponse } from './types';
import { EXTERNAL_UPDATE } from './utils';

const TooltipWrapper = styled.div`
    position: relative;

    overflow: hidden;
    display: flex;
    flex-direction: column;

    max-width: 550px;
    max-height: 300px;
    margin: -1px;

    color: ${(props) => props.theme.colors.text};
    word-break: break-word;

    background-color: ${({ theme }) => theme.colors.background} !important;
    border-radius: 0.25rem;
    box-shadow:
        rgb(0 0 0 / 10%) 0 1px 3px 0,
        rgb(0 0 0 / 6%) 0 1px 2px 0;

    pre {
        margin: 0;
        padding: 0.75rem 1rem;
        font-size: 0.9rem;
    }
`;

interface TooltipProps {
    content: React.ReactNode;
}

function Tooltip({ content }: TooltipProps): JSX.Element {
    return ReactDOM.createPortal(content, document.body);
}

export interface ConfigurableHotkeys {
    hotkeyBindings?: {
        [key: string]: (e: KeyboardEvent, view: EditorView) => void;
    };
    focusMiddlewares?: (() => boolean)[];
    allowInputs?: boolean;
}

export interface TooltipRenderProps {
    lineNumber: number;
    characterPos: number;
    inspectedSubstring: string;
    source?: string;
    contents: LspHoverResponse['contents'];
}

type FocusState = 'soft' | 'hard' | null;

export interface CodeEditorProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange' | 'onBlur'> {
    /**
     * The URI of the file being edited.
     * Should be in the format `file:///path/to/file#cellId`, cellId being optional
     */
    uri?: string;
    /**
     * The class name to apply to the editor wrapper
     */
    className?: string;
    /**
     * The extensions to apply to the editor
     */
    extensions?: Extension;
    /**
     * Styles to apply directly to the editor rather than the wrapper around it
     */
    editorStyle?: React.CSSProperties;
    /**
     * The initial text value of the editor
     */
    initialValue?: string;
    /**
     * Whether the editor should be disabled
     */
    disabled?: boolean;
    /**
     * Whether to disable the LSP features
     */
    enableLsp?: boolean;
    /**
     * Whether the editor should be read-only
     */
    readOnly?: boolean;
    /**
     * The type of focus on the editor, hard is editable mode, soft just browseable
     */
    focusType?: FocusState;
    /**
     * The style to apply to the editor wrapper
     */
    style?: React.CSSProperties;
    /**
     * Whether the editor should be focused on load
     */
    focusOnLoad?: boolean;
    /**
     * The onFocus handler
     */
    onFocus?: () => void;
    /**
     * The onBlur handler
     */
    onBlur?: (ev: FocusEvent, view: EditorView) => void;
    /**
     * The onChange handler
     */
    onChange?: (update: ViewUpdate) => void;
    /**
     * Callback to handle go to definition
     */
    onGoToDefinition?: (defs: LSPDefinition[]) => void;
    /**
     * The initial position in the document to select
     */
    initialPosition?: Range;
    /**
     * The configurable hotkeys to apply to the editor wrapper
     */
    configurableHotkeys?: ConfigurableHotkeys;
    /**
     * The data-testid to apply to the editor wrapper
     */
    dataTestId?: string;
    /**
     * The keymap precedence to apply to the editor
     */
    keymapPrecedence?: KeyBinding[];
    /**
     * Render props for the tooltip
     */
    tooltipRenderer?: (props: TooltipRenderProps) => React.ReactNode;
    /**
     * Whether the editor should be updated if initial value changes
     */
    shouldSyncInitialValue?: boolean;
}

// eslint-disable-next-line no-empty-function
const noop = (): void => {};

/**
 * Base CodeEditor component.
 */
const UiCodeEditor: FunctionComponent<CodeEditorProps> = ({
    className,
    uri,
    extensions,
    editorStyle,
    enableLsp,
    initialValue,
    focusType,
    disabled,
    readOnly = false,
    style,
    focusOnLoad = false,
    onFocus,
    onBlur,
    onChange,
    initialPosition,
    configurableHotkeys,
    dataTestId,
    keymapPrecedence,
    tooltipRenderer,
    onGoToDefinition,
    shouldSyncInitialValue = true,
    ...rest
}): JSX.Element => {
    if (enableLsp && !uri) {
        throw new Error('Must provide URI when LSP is enabled');
    }
    const { client } = React.useContext(WebSocketCtx);
    const ref = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onBlurStable = useLatestRef(onBlur);

    const theme = useTheme();

    const [tooltipContent, setTooltipContent] = useState<React.ReactNode>();
    const tooltipRef = useRef<HTMLDivElement>(null);

    const [signatureTooltipContent, setSignatureTooltipContent] = useState<React.ReactNode>();
    const signatureTooltipRef = useRef<HTMLDivElement>(null);

    // We use refs to prevent the editor from re-initializing when the script changes, updates to the editor on script
    // changes are handled in a dedicated useEffect More info: https://stackoverflow.com/a/70616581
    const initialThemeType = useLatestRef<ThemeType>(theme.themeType);
    const initialValueRef = useLatestRef(initialValue ?? '');
    const initialIsFocused = useLatestRef(focusOnLoad);
    const focusTypeRef = useLatestRef(focusType);
    const onChangeRef = useLatestRef<(x: ViewUpdate) => void>((update: ViewUpdate) => {
        initialValueRef.current = update.state.doc.toString();
        onChange?.(update);
    });
    const onFocusRef = useLatestRef(onFocus);

    const [prevIsFocused, setPrevIsFocused] = useState<boolean>(focusOnLoad);

    // remap the hotkeys to pass it the viewRef
    const hotkeys = useMemo(() => {
        return configurableHotkeys?.hotkeyBindings ?
                Object.keys(configurableHotkeys.hotkeyBindings).reduce((acc, key) => {
                    acc[key] = (e: KeyboardEvent) => {
                        configurableHotkeys.hotkeyBindings?.[key]?.(e, viewRef.current);
                    };
                    return acc;
                }, {} as KeyBindingMap)
            :   {};
    }, [configurableHotkeys?.hotkeyBindings, viewRef]);

    // These shortcuts are specifically for when the code editor is in focus
    useFocusTinykeys(hotkeys, ref, {
        middlewares: configurableHotkeys?.focusMiddlewares,
        allowInputs: configurableHotkeys?.allowInputs,
    });

    if (focusOnLoad !== prevIsFocused) {
        if (focusOnLoad) {
            viewRef.current?.focus();
        }
        if (focusType === 'soft' && onBlur) {
            onBlur(new FocusEvent('blur'), viewRef.current);
        }
        setPrevIsFocused(focusOnLoad);
    }

    const { setEditorView } = useCodeMirrorContext();

    const enableGoToDef = React.useMemo(() => onGoToDefinition !== undefined, [onGoToDefinition]);
    const goToDef = useLatestCallback(onGoToDefinition ?? noop);

    useOnClickOutside(ref.current, () => {
        closeArgumentsHintsTooltip(viewRef.current);
    });

    useEffect(() => {
        // client is required for LSP features
        if (!ref.current || (!client && enableLsp)) {
            return;
        }

        const signatureHelp = argumentHints(client, uri, signatureTooltipRef, setSignatureTooltipContent);

        const startState = EditorState.create({
            doc: initialValueRef.current,
            selection: {
                anchor: initialValueRef.current.length,
            },
            extensions: [
                extensions ?? [],
                ...getDefaultExtensions(initialThemeType.current),
                EditorView.clickAddsSelectionRange.of((evt) => evt.altKey && !evt.ctrlKey && !evt.metaKey),
                EditorView.editable.of(!disabled),
                EditorState.readOnly.of(readOnly),
                EditorView.updateListener.of((update: ViewUpdate) => {
                    onChangeRef.current(update);

                    if (update.focusChanged && update.view.hasFocus && onFocusRef.current) {
                        onFocusRef.current();
                    }
                }),
                // This block of extensions is only applied if LSP is enabled
                enableLsp ?
                    [
                        // signature help
                        signatureHelp,
                        // completion
                        autocompletion({
                            override: [(ctx) => getLspCompletion(client, ctx, uri)],
                            // use original sorting order from the LSP
                            compareCompletions: () => 1,
                            // reactivate completion when completing paths
                            activateOnCompletion: (completion) =>
                                completion.type === 'file' &&
                                typeof completion.apply === 'string' &&
                                completion.apply.endsWith('/'),
                        }),
                        // go-to-definition
                        enableGoToDef ?
                            goToDefinitionExtension(async (ch, line) => {
                                const res = await getLspDefinition(client, uri, line, ch);
                                if (res) {
                                    goToDef(res.definitions);
                                }
                            })
                        :   [],
                        tooltips({
                            parent: document.body,
                        }),
                        // inspect
                        hoverTooltip(async (view, pos): Promise<CodemirrorTooltip | null> => {
                            // TODO: when this is moved to base Dara it should have a default implementation
                            if (!tooltipRenderer) {
                                return null;
                            }

                            const wordRange = view.state.wordAt(pos);

                            if (!wordRange) {
                                return null;
                            }

                            const inspectedSubstring = view.state.doc.sliceString(wordRange.from, wordRange.to);
                            const linePosInfo = view.state.doc.lineAt(pos);

                            const ch = pos - linePosInfo.from;
                            const line = linePosInfo.number - 1;

                            const inspection = await getLspInspection(client, uri, line, ch);

                            if (!inspection) {
                                return null;
                            }

                            return {
                                above: true,
                                create: () => {
                                    const dom = tooltipRef.current;

                                    setTooltipContent(
                                        tooltipRenderer({
                                            characterPos: ch,
                                            lineNumber: line,
                                            inspectedSubstring,
                                            contents: inspection.contents,
                                            source: inspection.source,
                                        })
                                    );
                                    setSignatureTooltipContent(null);

                                    return {
                                        dom,
                                        overlap: true,
                                        destroy: () => {
                                            setTooltipContent(null);
                                        },
                                    };
                                },
                                end: wordRange.to,
                                pos: wordRange.from,
                            };
                        }),
                    ]
                :   [],
                keymap.of([
                    {
                        key: 'Escape',
                        run: () => {
                            if (!signatureHelp || !enableLsp) {
                                return false;
                            }

                            // if the tooltip is not currently showing, skip
                            const signatureHelpState = signatureHelp[0];
                            if (viewRef.current.state.field(signatureHelpState) === null) {
                                return false;
                            }

                            // tooltip is showing, close and return true to stop propagation
                            // so Escape doesn't trigger other events
                            closeArgumentsHintsTooltip(viewRef.current);

                            return true;
                        },
                        stopPropagation: true,
                    },
                ]),
                Prec.highest(
                    keymap.of(
                        keymapPrecedence?.map((binding) => {
                            return {
                                ...binding,
                                run: () => binding.run?.(viewRef.current) ?? false,
                            };
                        }) ?? []
                    )
                ),
                EditorView.domEventHandlers({
                    blur: (ev, view) => {
                        onBlurStable.current?.(ev, view);
                    },
                }),
            ],
        });

        viewRef.current = new EditorView({
            parent: ref.current,
            state: startState,
        });

        if (initialIsFocused.current && focusTypeRef.current !== 'soft') {
            viewRef.current.focus();
            // focus on last character
            viewRef.current.dispatch({
                selection: {
                    anchor: viewRef.current.state.doc.length,
                },
            });
        }

        if (setEditorView) {
            setEditorView(viewRef.current);
        }

        // If an initial position in the document is set then scroll to it and set the cursor
        if (initialPosition) {
            const view = viewRef.current;
            // +1 due to lsp being zero indexed and code mirror being 1 indexed
            const line = view.state.doc.line(initialPosition?.start.line + 1);
            const pos = line.from + initialPosition?.start.character;

            const endPos = line.from + initialPosition?.end.character;

            view.focus();
            view.dispatch({
                effects: EditorView.scrollIntoView(line.from, { y: 'start' }),
                selection: {
                    anchor: pos,
                    head: endPos,
                },
            });
        }

        return () => {
            viewRef.current?.destroy();
        };
    }, [
        client,
        initialPosition,
        initialValueRef,
        extensions,
        keymapPrecedence,
        initialIsFocused,
        focusTypeRef,
        setEditorView,
        onFocusRef,
        onChangeRef,
        initialThemeType,
        uri,
        goToDef,
        disabled,
        readOnly,
        tooltipRenderer,
        enableLsp,
        enableGoToDef,
        onBlurStable,
    ]);

    // keep the editor in sync with the script variable in case it changes from the outside
    React.useEffect(() => {
        // https://github.com/causalens/decision-studio/pull/394
        // First check if there is a difference, if there isn't then there's definitely nothing to do so don't bother
        // with the next step at all.
        if (shouldSyncInitialValue && viewRef.current && viewRef.current.state.doc.toString() !== initialValue) {
            // Rather than forcing the update immediately we set it in a timeout that will get wiped on any other
            // changes to initialValue coming through. If the content is still different after 100ms then we push the
            // update through as we are now sure that the difference was intentional and not due to race condition.
            const timeoutID = setTimeout(() => {
                if (viewRef.current.state.doc.toString() !== initialValue) {
                    viewRef.current.dispatch({
                        annotations: EXTERNAL_UPDATE.of(true),
                        changes: {
                            from: 0,
                            insert: initialValue,
                            to: viewRef.current.state.doc.length,
                        },
                        selection: { anchor: initialValue?.length ?? 0 },
                    });
                }
            }, 100);
            return () => clearTimeout(timeoutID);
        }

        // Just in case the editor gets recreated then make sure the initialContent ref is up to date
        initialValueRef.current = initialValue ?? '';
    }, [initialValue, initialValueRef, shouldSyncInitialValue]);

    return (
        <div className={className} style={style} {...rest}>
            {/* Wrap this in an extra div otherwise react will crash when removing the node. CodeMirror modifies
            the dom directly based on the tooltip ref and this breaks react when it attempts to unmount
            the component. */}
            <Tooltip
                content={
                    <div>
                        <TooltipWrapper
                            ref={tooltipRef}
                            role="tooltip"
                            style={{
                                display: tooltipContent ? 'flex' : 'none',
                            }}
                        >
                            {tooltipContent}
                        </TooltipWrapper>
                    </div>
                }
            />
            {/* Separate tooltip for signature help so it can live alongside the hover tooltip */}
            <Tooltip
                content={
                    <div>
                        <TooltipWrapper
                            ref={signatureTooltipRef}
                            role="tooltip"
                            style={{
                                display: signatureTooltipContent ? 'flex' : 'none',
                            }}
                        >
                            {signatureTooltipContent}
                        </TooltipWrapper>
                    </div>
                }
            />
            <div
                onBlur={() => {
                    if (enableLsp) {
                        closeArgumentsHintsTooltip(viewRef.current);
                    }
                    // if not using focus types and just a plain editor, call onBlur
                    if (focusType === undefined) {
                        onBlur?.(new FocusEvent('blur'), viewRef.current);
                    }
                }}
                data-testid={dataTestId}
                ref={ref}
                style={editorStyle}
            />
        </div>
    );
};

export default UiCodeEditor;
