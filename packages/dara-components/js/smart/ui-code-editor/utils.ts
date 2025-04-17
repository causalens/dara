import { Annotation } from '@codemirror/state';
import { ViewUpdate } from '@codemirror/view';

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
