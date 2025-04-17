import { markdown as markdownExtension, markdownLanguage } from '@codemirror/lang-markdown';
import type { Extension } from '@codemirror/state';
import { EditorView, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';

/**
 * Get the extensions for markdown
 * Currently includes:
 * - highlightActiveLine
 * - highlightActiveLineGutter
 * - markdownExtension
 * - EditorView.lineWrapping
 *
 * @returns - an array of extensions for markdown
 */
export const getMarkdownExtensions = (): Extension[] => [
    highlightActiveLine(),
    highlightActiveLineGutter(),
    EditorView.lineWrapping,
    markdownExtension({ base: markdownLanguage }),
];
