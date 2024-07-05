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
import { EditorMode } from '@types';

export interface LegendNodeDefinition {}

export type GraphLegendDefinition =
    | {
          /** defines the label for the legend entry */
          label?: string;
          /** the type of the symbol to show */
          type: 'spacer';
      }
    | {
          /** Arrow to show at end of line */
          arrow_type?: 'none' | 'normal' | 'filled' | 'empty' | 'soft';
          /** Symbol to show in the center of the arrow */
          center_symbol?: 'none' | 'cross' | 'question' | 'bidirected';
          /** defines the filled color of the edge/arrow symbol */
          color?: string;
          /** dashArray SVG path property - line will be dashed if specified */
          dash_array?: string;
          /** defines the label for the legend entry */
          label?: string;
          /** the type of the symbol to show */
          type: 'edge';
      }
    | {
          /** defines the filled color of the node symbol */
          color?: string;
          /** defines the border color of the node symbol */
          highlight_color?: string;
          /** defines the label for the legend entry */
          label?: string;
          /** the type of the symbol to show */
          type: 'node';
      };

export function getLegendData(
    defaultLegends: Record<EditorMode, GraphLegendDefinition[]>,
    editorMode: EditorMode,
    additionalLegend: GraphLegendDefinition[]
): GraphLegendDefinition[] {
    const modeData = defaultLegends?.[editorMode] ?? [];

    return [...modeData, ...(additionalLegend ?? []).filter(Boolean)];
}
