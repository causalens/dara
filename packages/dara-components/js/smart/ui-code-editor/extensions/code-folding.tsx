import { codeFolding, foldGutter, foldKeymap } from '@codemirror/language';
import type { EditorState, Extension } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { keymap } from '@codemirror/view';

/**
 * Prepare the placeholder text for a folded range
 * This is the text that will be displayed when the range is folded
 * (e.g., "... X lines")
 *
 * @param state - the editor state
 * @param range - the range to fold
 * @returns - the placeholder text
 */
function preparePlaceholder(
    state: EditorState,
    range: {
        from: number;
        to: number;
    }
): string {
    // Get the folded range's line count
    const startPos = range.from;
    const endPos = range.to;
    const lineCount = state.doc.lineAt(endPos).number - state.doc.lineAt(startPos).number;

    // Return the custom placeholder text (e.g., "Folded: 3 lines")
    return `... ${lineCount} ${lineCount === 1 ? 'line' : 'lines'}`;
}

/**
 * Create the DOM element for a folded range
 * This is the element that will be displayed when the range is folded
 *
 * @param view - the editor view
 * @param onclick - the click handler to toggle folding
 * @param prepared - the prepared placeholder text
 * @returns - the DOM element for the folded range
 */
function placeholderDOM(view: EditorView, onclick: (event: Event) => void, prepared: any): HTMLSpanElement {
    const span = document.createElement('span');
    span.setAttribute('aria-label', 'folded code');
    span.setAttribute('title', 'unfold');
    span.setAttribute('contenteditable', 'false');
    span.className = 'cm-foldPlaceholder';
    span.textContent = prepared; // Display the prepared text (e.g., "Folded: X lines")

    // Add the default click handler to toggle folding
    span.addEventListener('click', onclick);

    return span;
}

/**
 * A function that creates the DOM element used to indicate a given line is folded or can be folded.
 *
 * @param open - a boolean indicating whether the line is open or closed
 * @returns - the DOM element for the marker
 */
function markerDOM(open: boolean): HTMLSpanElement {
    const span = document.createElement('span');
    span.setAttribute('aria-label', 'fold marker');
    span.setAttribute('title', open ? 'fold' : 'unfold');
    span.setAttribute('contenteditable', 'false');
    span.className = 'cm-foldMarker';
    span.textContent = '›';

    if (!open) {
        span.style.display = 'inline-block';
        span.style.transform = 'rotate(90deg)';
    }

    return span;
}

export const codeFoldingExtensions = (): Extension => [
    foldGutter({
        markerDOM,
    }),
    codeFolding({
        placeholderDOM,
        preparePlaceholder,
    }),
    keymap.of(foldKeymap),
];
