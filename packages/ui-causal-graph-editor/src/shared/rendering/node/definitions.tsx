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
import { DefaultTheme } from '@darajs/styled-components';

import { NodeCategory } from '../../../types';

export const BORDER_PADDING = 2;

/**
 * Defines complete set of information used to determine node visuals
 */
export interface PixiNodeStyle {
    /** Node background color */
    color?: string;
    /** The category the node belongs to */
    category: NodeCategory;
    /** Border/shadow color */
    highlight_color?: string;
    /** Whether there is a edge currently selected */
    isEdgeSelected: boolean;
    /** Whether there is a new edge being created from this node */
    isSourceOfNewEdge: boolean;
    /** Node text */
    label: string;
    /** Node text color */
    label_color?: string;
    /** Node text font size */
    label_size?: number;
    /** Node size */
    size: number;
    /** Current node state */
    state: NodeState;
    /** Current theme object */
    theme: DefaultTheme;
    /** Whether the node should show as a group node or not */
    isGroupNode?: boolean;
}

/**
 * Current node state
 */
export interface NodeState {
    /** Whether an edge connected to the node is selected */
    attachedEdgeSelected: boolean;
    hover: boolean;
    matched: boolean;
    selected: boolean;
}
