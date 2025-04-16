import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { nanoid } from 'nanoid';
import { type CompletionItem, CompletionItemKind, type SignatureHelp } from 'vscode-languageserver-types';

import type {
    ErrorResponse,
    LspCompletionResponse,
    LspDefinitionResponse,
    LspHoverResponse,
    LspMessage,
    LspSignatureHelpResponse,
    WsClient,
} from './types';
import { MessageKind, isErrorResponse } from './types';

const LSP_CODEMIRROR_TYPE_MAP = Object.fromEntries(
    Object.entries(CompletionItemKind).map(([key, value]) => [value, key])
) as Record<CompletionItemKind, string>;

function lspCompletionToCodeMirror(completion: CompletionItem): Completion & {
    filterText: string;
    sortText?: string;
    apply: string;
} {
    return {
        label: completion.label,
        detail: (completion?.labelDetails?.detail ?? '') + (completion?.labelDetails?.description ?? ''),
        type: completion.kind ? LSP_CODEMIRROR_TYPE_MAP[completion.kind]?.toLowerCase() : undefined,
        apply: completion.textEdit?.newText ?? completion.insertText ?? completion.label,
        sortText: completion.sortText ?? completion.label,
        filterText: completion.filterText ?? completion.label,
    };
}

/**
 * Convert a set of characters to a RegExp character set string.
 * For word-like characters, \w is used instead of listing them all.
 *
 * @example
 * // Only word characters
 * toSet(new Set(['a', 'b', 'c', '1', '2', '3']))
 * // Returns: '[\\w]'
 *
 * @example
 * // Mix of word and non-word characters
 * toSet(new Set(['a', 'b', '!', '@', '1', '2']))
 * // Returns: '[\\w!@]'
 *
 * @example
 * // Only non-word characters
 * toSet(new Set(['!', '@', '#', '$']))
 * // Returns: '[!@#$]'
 *
 * @example
 * // Empty set
 * toSet(new Set([]))
 * // Returns: '[]'
 *
 * @example
 * // Set with RegExp special characters
 * toSet(new Set(['[', ']', '-', '^']))
 * // Returns: '[\\[\\]\\-\\^]'
 *
 * @param chars - the set of characters to convert
 * @returns the RegExp character set string
 */
function toSet(chars: Set<string>) {
    let preamble = '';
    let flat = Array.from(chars).join('');

    // Check if the set contains any word characters (\w in RegExp)
    const words = /\w/.test(flat);

    if (words) {
        // If word characters are present, add \w to the preamble instead of the explicit set
        // This represents all word characters in the set
        preamble += '\\w';
        flat = flat.replace(/\w/g, '');
    }

    // $& in the replacement string means "replace with the matched substring", used here to add an extra backslash
    // See: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace#specifying_a_string_as_the_replacement
    return `[${preamble}${flat.replace(/[^\w\s]/g, '\\$&')}]`;
}

/**
 * Generate a RegExp pattern to match the prefix of a completion.
 *
 * Adapted from https://github.com/FurqanSoftware/codemirror-languageserver
 *
 * @param options - the list of completions
 * @returns the RegExp pattern
 */
function prefixMatch(options: Completion[]): RegExp {
    // First character of each completion
    const first = new Set<string>();
    // Rest of the characters of each completion
    const rest = new Set<string>();

    for (const { apply } of options) {
        const [initial, ...restStr] = apply as string;
        first.add(initial!);
        for (const char of restStr) {
            rest.add(char);
        }
    }

    // Create a RegExp source string using the collected characters
    // This pattern will match any number of characters from both sets
    const source = `${toSet(first) + toSet(rest)}*$`;
    return new RegExp(source);
}

/** The characters that trigger completion, i.e. if one of those is the last character in the line then completion is triggered */
const TRIGGER_CHARS = new Set(['.', '[', '"', "'"]);
/** The regex that matches prior characters that trigger completion */
const COMPLETION_REGEX = new RegExp(`[a-z_A-Z0-9${[...TRIGGER_CHARS].join('')}]+$`);
/** The minimum length of a word matching COMPLETION_REGEX to trigger completion */
const COMPLETION_MIN_LENGTH = 2;

/**
 * Helper to get LSP completions
 *
 * @param client - the websocket client
 * @param context - the completion context
 * @param uri - the uri of the file
 */
export async function getLspCompletion(
    client: WsClient,
    context: CompletionContext,
    uri: string
): Promise<CompletionResult | null> {
    const linePosInfo = context.state.doc.lineAt(context.pos);

    const ch = context.pos - linePosInfo.from;
    const id = nanoid();

    const lastChar = linePosInfo.text.charAt(ch - 1);

    let canComplete = false;

    // complete if a trigger char is the last one
    if (TRIGGER_CHARS.has(lastChar)) {
        canComplete = true;
    } else {
        // only complete if user has typed a matching sequence of at least MIN_LENGTH
        const wordMatch = linePosInfo.text.slice(0, ch).match(COMPLETION_REGEX);
        canComplete = wordMatch !== null && wordMatch[0].length >= COMPLETION_MIN_LENGTH;
    }

    if (!canComplete) {
        return null;
    }

    const msg = await client?.sendCustomMessage(
        MessageKind.LspMessage,
        {
            method: 'textDocument/completion',
            id,
            uri,
            params: {
                line: linePosInfo.number - 1,
                character: ch,
            },
        } satisfies LspMessage,
        true
    );

    if (!msg) {
        return null;
    }

    const data = msg.message.data as ErrorResponse | LspCompletionResponse;

    if (isErrorResponse(data)) {
        return null;
    }

    /**
     * Whether all returned completions are files.
     * This can occur in completions e.g. within open() or os.path.join()
     */
    let allFiles = true;

    let options = data.items.map((item) => {
        const completion = lspCompletionToCodeMirror(item);

        if (completion.type !== 'file') {
            allFiles = false;
        }

        return completion;
    });

    // build a regex to match the prefix of the completion
    const match = prefixMatch(options);
    // find the current word being typed
    const token = context.matchBefore(match);

    let from = context.pos;

    // if the token is found
    if (token) {
        const word = token.text;

        // if we're in file-matching mode
        if (allFiles) {
            // Find the position of the last path separator
            const lastSeparatorIndex = Math.max(word.lastIndexOf('/'), word.lastIndexOf('\\'));

            if (lastSeparatorIndex !== -1) {
                // Adjust pos to the position after the last separator
                from = token.from + lastSeparatorIndex + 1;
            } else {
                // If no separator found, use the start of the token
                from = token.from;
            }

            // Extract the last segment of the path for filtering
            const lastSegment = word.slice(lastSeparatorIndex + 1).toLowerCase();

            options = options
                .filter(({ filterText }) => filterText.toLowerCase().includes(lastSegment))
                .sort(
                    (a, b) =>
                        a.filterText.toLowerCase().indexOf(lastSegment) -
                        b.filterText.toLowerCase().indexOf(lastSegment)
                );
        } else {
            // update the from position to the start of the word
            from = token.from;
            const lowerWord = token.text.toLowerCase();

            if (/^\w+$/.test(lowerWord)) {
                options = options
                    .filter(({ filterText }) => filterText.toLowerCase().startsWith(lowerWord))
                    .sort(({ apply: a }, { apply: b }) => {
                        if (a.startsWith(token.text) && !b.startsWith(token.text)) {
                            return -1;
                        }
                        if (!a.startsWith(token.text) && b.startsWith(token.text)) {
                            return 1;
                        }
                        return 0;
                    });
            }
        }
    }

    return {
        from,
        options,
    };
}

/**
 * Helper to send hover request to backend
 *
 * @param client - the websocket client
 * @param uri - the uri of the file
 * @param line - the line number
 * @param ch - the character number
 */
export async function getLspInspection(
    client: WsClient,
    uri: string,
    line: number,
    ch: number
): Promise<LspHoverResponse | null> {
    const id = nanoid();
    const msg = await client?.sendCustomMessage(
        MessageKind.LspMessage,
        {
            method: 'textDocument/hover',
            id,
            uri,
            params: {
                line,
                character: ch,
            },
        } satisfies LspMessage,
        true
    );

    if (!msg) {
        return null;
    }

    const data = msg.message.data as ErrorResponse | LspHoverResponse;

    if (isErrorResponse(data)) {
        return null;
    }

    return data;
}

/**
 * Helper to get definition from LSP server
 *
 * @param client - the websocket client
 * @param uri - the uri of the file
 * @param line - the line number
 * @param ch - the character number
 */
export async function getLspDefinition(
    client: WsClient,
    uri: string,
    line: number,
    ch: number
): Promise<LspDefinitionResponse | null> {
    const id = nanoid();
    const msg = await client.sendCustomMessage(
        MessageKind.LspMessage,
        {
            method: 'textDocument/definition',
            id,
            uri,
            params: {
                line,
                character: ch,
            },
        } as LspMessage,
        true
    );

    if (!msg) {
        return null;
    }

    const data = msg.message.data as ErrorResponse | LspDefinitionResponse;

    if (isErrorResponse(data)) {
        return null;
    }

    return data;
}

/**
 * Helper function to get signature help from LSP server
 *
 * @param client - the websocket client
 * @param uri - the uri of the file
 * @param line - the line number
 * @param ch - the character number
 */
export async function getLspSignatureHelp(
    client: WsClient,
    uri: string,
    line: number,
    ch: number
): Promise<SignatureHelp | null> {
    const id = nanoid();
    const msg = await client.sendCustomMessage(
        MessageKind.LspMessage,
        {
            method: 'textDocument/signatureHelp',
            id,
            uri,
            params: {
                line,
                character: ch,
            },
        } as LspMessage,
        true
    );

    if (!msg) {
        return null;
    }

    const data = msg.message.data as ErrorResponse | LspSignatureHelpResponse;

    if (isErrorResponse(data)) {
        return null;
    }

    return data.signature;
}
