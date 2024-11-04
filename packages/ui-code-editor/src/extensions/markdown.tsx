import { markdown as markdownExtension, markdownLanguage } from '@codemirror/lang-markdown';
import type { Extension } from '@codemirror/state';
import { highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';

/**
 * Get the extensions for markdown
 * Currently includes:
 * - highlightActiveLine
 * - highlightActiveLineGutter
 * - markdownExtension
 *
 * @returns - an array of extensions for markdown
 */
export const getMarkdownExtensions = (): Extension[] => [
    highlightActiveLine(),
    highlightActiveLineGutter(),
    markdownExtension({ base: markdownLanguage }),
];
