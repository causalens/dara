import { acceptCompletion } from '@codemirror/autocomplete';
import { defaultKeymap, indentWithTab, toggleComment } from '@codemirror/commands';
import { defaultHighlightStyle, indentUnit, syntaxHighlighting, syntaxTree } from '@codemirror/language';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import type { Extension } from '@codemirror/state';
import { EditorState, Prec, StateEffect, StateField, findClusterBreak } from '@codemirror/state';
import { oneDarkHighlightStyle, oneDarkTheme } from '@codemirror/theme-one-dark';
import type { DecorationSet, KeyBinding, MouseSelectionStyle } from '@codemirror/view';
import { Decoration, EditorView, crosshairCursor, drawSelection, keymap, rectangularSelection } from '@codemirror/view';

export type LangsType = 'json' | 'markdown' | 'python';
export type NonPythonLangsType = Exclude<LangsType, 'python'>;
export type ThemeType = 'light' | 'dark';

/**
 * Helper function to get a selection range matching the currently hovered element as well as the nodeType of that element.
 *
 * @param view - the editor view
 * @param event - the mouse event triggering this query
 * @returns - a tuple of [from: number, to: number, nodeType: strin]
 */
export function getHoveredElement(view: EditorView, event: MouseEvent): [from: number, to: number, nodeType: string] {
    const position = view.posAtCoords({ x: event.clientX, y: event.clientY }, false);
    const line = view.state.doc.lineAt(position);
    const linePos = position - line.from;

    let to = findClusterBreak(line.text, linePos);
    let from = findClusterBreak(line.text, linePos, false);
    const categorize = view.state.charCategorizer(position);
    const cat = categorize(line.text.slice(from, to));

    while (from > 0) {
        const prev = findClusterBreak(line.text, from, false);
        if (categorize(line.text.slice(prev, from)) !== cat) {
            break;
        }
        from = prev;
    }
    while (to < line.length) {
        const next = findClusterBreak(line.text, to);
        if (categorize(line.text.slice(to, next)) !== cat) {
            break;
        }
        to = next;
    }

    const nodeType = syntaxTree(view.state).resolve(line.from + from).type.name;
    return [line.from + from, line.from + to, nodeType];
}

// This whitelist represents the types of nodes that have a definition to jump to. It will likely need refining with
// time and a better lezer would make this much more robust.
const jumpToDefWhitelist = new Set(['ArgList', 'VariableName', 'AssignStatement', 'MemberExpression', 'ParamList']);

// The following StateEffects and StateField manage the presence of the plain underline decoration for hovering
// clickable elements
const addUnderline = StateEffect.define<{ from: number; to: number }>({
    map: ({ from, to }, change) => ({ from: change.mapPos(from), to: change.mapPos(to) }),
});

const removeUnderline = StateEffect.define();

const underlineMark = Decoration.mark({ class: 'cm-underline' });

const underlineField = StateField.define<DecorationSet>({
    create() {
        return Decoration.none;
    },
    provide: (f) => EditorView.decorations.from(f),
    update(underlines, tr) {
        let mappedUnderlines = underlines.map(tr.changes);
        for (const e of tr.effects) {
            if (e.is(addUnderline)) {
                mappedUnderlines = underlines.update({
                    add: [underlineMark.range(e.value.from, e.value.to)],
                    filter: (from, to) => from === e.value.from && to === e.value.to,
                });
            }
            if (e.is(removeUnderline)) {
                return Decoration.none;
            }
        }
        return mappedUnderlines;
    },
});

/**
 * Extension to handle the logic for jumping to definition.
 * Adds underline decorations to clickable elements and invokes provided callback on click.
 *
 * @param callback - the callback to handle the jump to definition
 */
export function goToDefinitionExtension(callback: (ch: number, line: number) => void): Extension {
    return [
        EditorView.domEventHandlers({
            mousemove: (event, view) => {
                if (event.metaKey || event.ctrlKey) {
                    const [from, to, nodeType] = getHoveredElement(view, event);

                    if (jumpToDefWhitelist.has(nodeType)) {
                        const effects = [addUnderline.of({ from, to }), StateEffect.appendConfig.of([underlineField])];
                        view.dispatch({ effects });
                    } else {
                        const effects = [removeUnderline.of(null), StateEffect.appendConfig.of([underlineField])];
                        view.dispatch({ effects });
                    }
                } else {
                    const effects = [removeUnderline.of(null), StateEffect.appendConfig.of([underlineField])];
                    view.dispatch({ effects });
                }
            },
        }),
        EditorView.mouseSelectionStyle.of((view: EditorView, event: MouseEvent): MouseSelectionStyle | null => {
            if (event.metaKey || event.ctrlKey) {
                const position = view.posAtCoords({ x: event.clientX, y: event.clientY }, false);
                const line = view.state.doc.lineAt(position);
                const linePos = position - line.from;
                callback(linePos - 1, line.number - 1);
            }
            return null;
        }),
    ];
}

export const acceptCompletionKeymap = {
    key: 'Tab',
    run: (target: any) => acceptCompletion(target),
    win: 'Tab',
};

// Localization Overrides
const localizationKeymap: KeyBinding[] = [
    // Overrides for German Keyboards
    {
        key: 'Ctrl-Shift-7',
        preventDefault: false,
        run: toggleComment,
        stopPropagation: false,
    },
];

/**
 * Get the default codemirror editor extensions.
 * Currently includes:
 * - multiple selections
 * - tab size of 4
 * - indent unit of 4 spaces
 * - rectangular selection
 * - draw selection
 * - crosshair cursor
 * - default keymap
 * - search keymap
 * - indent with tab keymap
 *
 * @returns The default editor extensions
 */
export const getDefaultExtensions = (themeType: ThemeType): Extension[] => {
    return [
        EditorState.allowMultipleSelections.of(true),
        EditorState.tabSize.of(4),
        indentUnit.of(' '.repeat(4)),
        rectangularSelection(),
        drawSelection(),
        crosshairCursor(),
        highlightSelectionMatches(),
        keymap.of([...defaultKeymap, ...searchKeymap, ...localizationKeymap, indentWithTab]),
        Prec.highest(keymap.of([acceptCompletionKeymap])),
        themeType === 'dark' ? oneDarkTheme : EditorView.baseTheme({}),
        syntaxHighlighting(themeType === 'dark' ? oneDarkHighlightStyle : defaultHighlightStyle),
    ];
};

/**
 * Format a file path into an LSP URI string.
 * This is the format expected by the backend convention. Also supports a cell-based notebook
 * system with a #cellId appended to the URI.
 */
export function formatUri(filePath: string, cellId?: string): string {
    const base = `file:///${filePath}`;

    if (cellId) {
        return `${base}#${cellId}`;
    }

    return base;
}
