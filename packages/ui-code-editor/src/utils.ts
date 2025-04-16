import { Annotation } from '@codemirror/state';
import type { ViewUpdate } from '@codemirror/view';

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
