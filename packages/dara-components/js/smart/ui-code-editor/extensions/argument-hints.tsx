import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import { MapMode, StateEffect, StateField } from '@codemirror/state';
import type { EditorView, Tooltip, TooltipView, ViewUpdate } from '@codemirror/view';
import { ViewPlugin, showTooltip } from '@codemirror/view';
import * as React from 'react';
import type { SignatureHelp } from 'vscode-languageserver-types';

import styled from '@darajs/styled-components';
import { Markdown } from '@darajs/ui-components';

import type { WsClient } from '../types';
import { isEmptyMarkdown } from '../utils';
import { getLspSignatureHelp } from './lsp-utils';

export type ArgumentHintsTooltip = [StateField<Tooltip | null>, ViewPlugin<any>];
export const closeTooltip = StateEffect.define<null>();

type TooltipMsg = {
    /** Method defining how to create a new view for the tooltip */
    create: () => TooltipView;
    /** Method defining how to update existing tooltip view instead */
    update: () => void;
};

/**
 * Cursor tooltip extension for displaying argument hints.
 *
 * Modified from: https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/ui/components/text_editor/cursor_tooltip.ts
 */
function cursorTooltip(source: (state: EditorState, pos: number) => Promise<TooltipMsg | null>): ArgumentHintsTooltip {
    const openOrUpdateTooltip = StateEffect.define<TooltipMsg>();

    const state = StateField.define<null | Tooltip>({
        create() {
            return null;
        },
        update(val, tr) {
            let ret = val;

            // update position
            if (ret && !tr.changes.empty) {
                const newPos = tr.changes.mapPos(ret.pos, -1, MapMode.TrackDel);
                ret = newPos === null ? null : { pos: newPos, create: ret.create, above: true };
            }
            // handle open/close effects
            for (const effect of tr.effects) {
                if (effect.is(openOrUpdateTooltip)) {
                    // if we have a tooltip already open, just run the new updater so we don't flicker
                    if (val) {
                        effect.value.update();
                    } else {
                        ret = {
                            pos: tr.state.selection.main.from,
                            create: effect.value.create,
                            above: true,
                        };
                    }
                } else if (effect.is(closeTooltip)) {
                    ret = null;
                }
            }
            return ret;
        },
        provide: (field) => showTooltip.from(field),
    });

    const plugin = ViewPlugin.fromClass(
        class {
            pending = -1;

            updateID = 0;

            update(update: ViewUpdate): void {
                this.updateID++;
                if (update.transactions.some((tr) => tr.selection) && update.state.selection.main.empty) {
                    this.#scheduleUpdate(update.view);
                }
            }

            #scheduleUpdate(view: EditorView): void {
                if (this.pending > -1) {
                    clearTimeout(this.pending);
                }
                this.pending = window.setTimeout(() => this.#startUpdate(view), 50) as unknown as number;
            }

            #startUpdate(view: EditorView): void {
                this.pending = -1;
                const { main } = view.state.selection;
                if (main.empty) {
                    const { updateID } = this;
                    source(view.state, main.from).then((tooltip) => {
                        if (this.updateID !== updateID) {
                            if (this.pending < 0) {
                                this.#scheduleUpdate(view);
                            }
                        } else if (tooltip) {
                            // resolved to a tooltip, send open/update effect to state
                            view.dispatch({ effects: openOrUpdateTooltip.of(tooltip) });
                        } else {
                            // resolved to null, send close effect to state
                            view.dispatch({ effects: closeTooltip.of(null) });
                        }
                    });
                }
            }
        }
    );

    return [state, plugin];
}

const SignatureTooltipWrapper = styled.div`
    overflow-y: auto;
    display: flex;
    flex-direction: column;
`;

const CodeWrapper = styled.pre`
    padding: 0.25rem 0.75rem;
    white-space: normal;
    background-color: ${(props) => props.theme.colors.blue2};
`;

const DocsWrapper = styled.div`
    height: 100%;
    padding: 0.75rem;
    border-top: 1px solid ${(props) => props.theme.colors.grey3};
`;

interface SignatureHelpTooltipProps {
    signature: SignatureHelp;
}

function SignatureHelpTooltip(props: SignatureHelpTooltipProps): React.ReactNode {
    const activeSignature = React.useMemo(() => {
        return props.signature.signatures[props.signature.activeSignature ?? 0];
    }, [props.signature]);

    let documentation = null;

    if (activeSignature) {
        if (typeof activeSignature.documentation === 'string') {
            documentation = activeSignature.documentation;
        } else if (activeSignature.documentation?.value) {
            documentation = activeSignature.documentation.value;
        }

        // after setting its value check if it's empty, then set to null
        if (documentation && isEmptyMarkdown(documentation)) {
            documentation = null;
        }
    }

    // split up label into arguments so we can highlight the active one
    const splitLabel = React.useMemo(() => {
        if (!activeSignature || !activeSignature.label || typeof props.signature.activeParameter !== 'number') {
            return null;
        }

        // Regex to extract the function name and arguments
        const regex = /^(\w+)\((.*)\)$/;
        const match = activeSignature.label.match(regex);

        // invalid format
        if (!match) {
            return null;
        }

        const functionName = match[1]; // e.g., "name"
        const argumentsString = match[2]; // e.g., "arg1, arg2, ..."

        if (!argumentsString) {
            return null;
        }

        // Split arguments based on commas, taking care not to split inside argument values (e.g., nested parentheses)
        const argumentList = argumentsString.split(/,(?![^(]*\))/);

        // out of range
        if (props.signature.activeParameter >= argumentList.length) {
            return null;
        }

        return {
            functionName,
            argumentList,
        };
    }, [activeSignature, props.signature.activeParameter]);

    if (!activeSignature) {
        return null;
    }

    return (
        <SignatureTooltipWrapper>
            {splitLabel && (
                <CodeWrapper>
                    <span>{splitLabel.functionName}(</span>
                    {splitLabel.argumentList.map((arg, idx) => (
                        <span
                            key={idx}
                            style={{
                                fontWeight: idx === props.signature.activeParameter ? 'bold' : 'normal',
                            }}
                        >
                            {arg}
                            {idx < splitLabel.argumentList.length - 1 && ', '}
                        </span>
                    ))}
                    <span>)</span>
                </CodeWrapper>
            )}
            {/*  Fall back if the regex failed, just show the entire code without highlights */}
            {!splitLabel && <CodeWrapper>{activeSignature.label}</CodeWrapper>}

            {documentation && (
                <DocsWrapper>
                    <Markdown markdown={documentation} />
                </DocsWrapper>
            )}
        </SignatureTooltipWrapper>
    );
}

/**
 * Create a function to get the argument hints for the current function call.
 *
 * Adapted from:
 * https://github.com/ChromeDevTools/devtools-frontend/blob/68ead267f2b342b5488b73a73660ca2d040071f6/front_end/ui/components/text_editor/javascript.ts
 *
 * @param client - the websocket client
 * @param uri - the uri of the file
 * @param tooltipRef - a ref to the tooltip element
 * @param setTooltipContent - a function to set the content of the tooltip
 */
function getArgumentHints(
    client: WsClient,
    uri: string,
    tooltipRef: React.MutableRefObject<any>,
    setTooltipContent: (el: React.ReactNode) => void
): (state: EditorState, pos: number) => Promise<TooltipMsg | null> {
    return async function getArgumentHintsInner(state: EditorState, pos: number): Promise<TooltipMsg | null> {
        const node = syntaxTree(state).resolveInner(pos).enterUnfinishedNodesBefore(pos);

        if (node.name !== 'ArgList') {
            return null;
        }
        const callee = node.parent?.getChild('Expression');
        if (!callee) {
            return null;
        }
        const linePosInfo = state.doc.lineAt(pos);
        const line = linePosInfo.number - 1;
        const signature = await getLspSignatureHelp(client, uri, line, pos - linePosInfo.from);

        if (!signature || !signature.signatures.length) {
            return null;
        }

        return {
            create: () => {
                const dom = tooltipRef.current;

                setTooltipContent(<SignatureHelpTooltip signature={signature} />);

                return {
                    dom,
                    destroy: () => {
                        setTooltipContent(null);
                    },
                    overlap: true,
                };
            },
            update: () => {
                setTooltipContent(<SignatureHelpTooltip signature={signature} />);
            },
        };
    };
}

/**
 * Close the argument hints tooltip.
 */
export function closeArgumentsHintsTooltip(view: EditorView): boolean {
    view.dispatch({ effects: closeTooltip.of(null) });
    return true;
}

/**
 * Creates an argument hints tooltip, displaying signature help for the current function call.
 *
 * @param client - the websocket client
 * @param uri - the uri of the file
 * @param tooltipRef - a ref to the tooltip element
 * @param setTooltipContent - a function to set the content of the tooltip
 */
export function argumentHints(
    client: WsClient | undefined,
    uri: string | null | undefined,
    tooltipRef: React.MutableRefObject<any>,
    setTooltipContent: (el: React.ReactNode) => void
): ArgumentHintsTooltip | null {
    if (!uri || !client) {
        return null;
    }

    return cursorTooltip(getArgumentHints(client, uri, tooltipRef, setTooltipContent));
}
