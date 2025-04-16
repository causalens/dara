import type { CompletionItem, MarkupContent, Position, SignatureHelp } from 'vscode-languageserver-types';

type LspPayload =
    | { method: 'textDocument/definition'; params: { line: number; character: number } }
    | { method: 'textDocument/completion'; params: { line: number; character: number } }
    | { method: 'textDocument/hover'; params: { line: number; character: number } }
    | {
          method: 'textDocument/signatureHelp';
          params: {
              line: number;
              character: number;
          };
      };

export type LspMessage = {
    id: string;
    uri: string;
} & LspPayload;

export interface LSPDefinition {
    range: {
        end: Position;
        start: Position;
    };
    uri: string;
}

export type LspDefinitionResponse = { id: string; definitions: LSPDefinition[] };

export type LspCompletionResponse = { id: string; items: CompletionItem[] };

export type LspHoverResponse = {
    id: string;
    contents: MarkupContent | null;
    source?: string;
};

export type LspSignatureHelpResponse = {
    id: string;
    signature: SignatureHelp;
};
