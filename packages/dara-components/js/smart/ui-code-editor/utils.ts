import type { EditorStateConfig, TransactionSpec } from '@codemirror/state';
import { Annotation, EditorState } from '@codemirror/state';
import { ViewUpdate } from '@codemirror/view';

type InitialStateConfig = Omit<EditorStateConfig, 'selection'>;

/**
 * Create an editor state with its cursor at the end of CodeMirror's parsed document.
 *
 * CodeMirror normalizes line separators while parsing strings, so positions must be
 * derived from the resulting document rather than from the source string's length.
 */
export function createInitialState(config: InitialStateConfig): EditorState {
    const state = EditorState.create(config);

    return state.update({ selection: { anchor: state.doc.length } }).state;
}

/**
 * Create a transaction that replaces an editor's contents and leaves its cursor at
 * the end of the parsed replacement document.
 */
export function createDocumentReplacement(state: EditorState, document: string): TransactionSpec {
    const changes = state.changes({
        from: 0,
        insert: document,
        to: state.doc.length,
    });

    return {
        changes,
        selection: { anchor: changes.newLength },
    };
}

/**
 * Check whether a string represents the editor's current parsed document.
 */
export function isSameEditorDocument(state: EditorState, document: string): boolean {
    return state.doc.eq(state.toText(document));
}

/**
 * Annotation to mark an update as external
 */
export const EXTERNAL_UPDATE = Annotation.define<boolean>();

/**
 * Check whether a given update is external
 *
 * @param update update object
 */
export function isExternalUpdate(update: ViewUpdate): boolean {
    // is external if any associated transaction was annotated as external
    return update.transactions.some((tr) => tr.annotation(EXTERNAL_UPDATE));
}

/**
 * Whether a markdown response is empty
 */
export function isEmptyMarkdown(response: string | null | undefined): boolean {
    if (!response) {
        return true;
    }

    const trimmed = response.trim();

    if (trimmed.length === 0) {
        return true;
    }

    // response could be an empty markdown code block
    if (trimmed.startsWith('```') && trimmed.endsWith('```')) {
        const content = trimmed.split('\n').join('').slice(3, -3).trim();
        return content.length === 0;
    }

    return false;
}
