/**
 * Copyright 2023 Impulse Innovations Limited
 *
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
export { default as UiCodeEditor } from './code-editor';
export { argumentHints, closeArgumentsHintsTooltip } from './extensions/argument-hints';
export { codeFoldingExtensions } from './extensions/code-folding';
export { getJSONExtensions } from './extensions/json';
export { getMarkdownExtensions } from './extensions/markdown';
export { getPythonExtensions } from './extensions/python';
export { getSQLExtensions } from './extensions/sql';
export { getExtensionsForLang, type LangsType } from './extensions/lang';
export * from './extensions/shared';
export * from './extensions/lsp-utils';
export * from './extensions/extended-json';
export * from './code-editor';
export * from './codemirror-context';
export * from './types';
export * from './utils';

// Re-export CodeMirror modules to prevent duplication in other packages
export * as CMState from '@codemirror/state';
export * as CMView from '@codemirror/view';
export * as CMAutoComplete from '@codemirror/autocomplete';
export * as CMLanguage from '@codemirror/language';
export * as CMSearch from '@codemirror/search';
export * as CMCommands from '@codemirror/commands';
export * as CMLint from '@codemirror/lint';
export * as CMLangMarkdown from '@codemirror/lang-markdown';
export * as CMLangJson from '@codemirror/lang-json';
