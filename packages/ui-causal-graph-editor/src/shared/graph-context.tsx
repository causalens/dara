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
import { createContext } from 'react';

import { GraphApi } from '@shared/use-causal-graph-editor';

import { EdgeConstraintItem, GraphState } from '@types';

interface GraphContext {
    /** Graph API */
    api: GraphApi;
    /** Constraints related to the edge */
    constraints: EdgeConstraintItem[];
    /** Defines whether the graph is editable */
    editable?: boolean;
    /** Graph state */
    graphState?: GraphState;
    /** Handler to update a given constraint */
    onUpdateConstraint: (constraint: EdgeConstraintItem) => void | Promise<void>;
    /** Currently selected edge */
    selectedEdge?: [string, string];
    /** Currently selected node */
    selectedNode?: string;
    /** Defines whether verbose description should show */
    verboseDescriptions?: boolean;
}

/**
 * Context for handling interactions between the side panel and graph canvas
 */
const graphCtx = createContext<GraphContext>(null);

export default graphCtx;
