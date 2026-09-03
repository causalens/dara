import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';

import { createDocumentReplacement, createInitialState, isSameEditorDocument } from './utils';

describe('CodeMirror document positions', () => {
    it.each([
        ['LF', 'first\nsecond'],
        ['CRLF', 'first\r\nsecond'],
        ['mixed line separators', 'first\r\nsecond\rthird\nfourth'],
        ['multiple trailing CRLFs', 'first\r\n\r\n'],
    ])('creates an initial state ending after %s text', (_name, document) => {
        const state = createInitialState({ doc: document });

        expect(state.selection.main.anchor).toBe(state.doc.length);
        expect(state.doc.toJSON()).toEqual(document.split(/\r\n?|\n/));
    });

    it('respects a configured multi-character line separator when creating the state', () => {
        const document = 'first||second||third';
        const state = createInitialState({
            doc: document,
            extensions: EditorState.lineSeparator.of('||'),
        });

        expect(state.selection.main.anchor).toBe(state.doc.length);
        expect(state.selection.main.anchor).toBeLessThan(document.length);
        expect(state.sliceDoc()).toBe(document);
    });

    it.each([
        ['LF', 'first\nsecond'],
        ['CRLF', 'first\r\nsecond'],
        ['mixed line separators', 'first\r\nsecond\rthird\nfourth'],
        ['empty', ''],
    ])('creates a replacement ending after %s text', (_name, document) => {
        const state = EditorState.create({ doc: 'existing document' });
        const nextState = state.update(createDocumentReplacement(state, document)).state;

        expect(nextState.selection.main.anchor).toBe(nextState.doc.length);
        expect(nextState.doc.toJSON()).toEqual(document.split(/\r\n?|\n/));
    });

    it('respects a configured multi-character line separator when replacing the document', () => {
        const document = 'first||second||third';
        const state = EditorState.create({
            doc: 'existing||document',
            extensions: EditorState.lineSeparator.of('||'),
        });
        const nextState = state.update(createDocumentReplacement(state, document)).state;

        expect(nextState.selection.main.anchor).toBe(nextState.doc.length);
        expect(nextState.selection.main.anchor).toBeLessThan(document.length);
        expect(nextState.sliceDoc()).toBe(document);
    });

    it('compares documents after parsing their line separators', () => {
        const state = EditorState.create({ doc: 'first\nsecond' });

        expect(isSameEditorDocument(state, 'first\r\nsecond')).toBe(true);
        expect(isSameEditorDocument(state, 'different\r\ntext')).toBe(false);
    });

    it('uses the configured line separator when comparing documents', () => {
        const state = EditorState.create({
            doc: 'first||second',
            extensions: EditorState.lineSeparator.of('||'),
        });

        expect(isSameEditorDocument(state, 'first||second')).toBe(true);
        expect(isSameEditorDocument(state, 'first||different')).toBe(false);
    });
});
