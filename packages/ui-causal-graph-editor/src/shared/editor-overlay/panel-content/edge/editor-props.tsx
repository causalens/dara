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
import type { GraphApi } from '@shared/use-causal-graph-editor';

import type { EdgeConstraintItem, GraphState, SimulationEdge } from '@types';

export interface EdgeEditorProps {
    /** Graph API */
    api: GraphApi;
    /** The edge meta data */
    edge: SimulationEdge;
    /** Edge constraint for the specific edge */
    edgeConstraint: EdgeConstraintItem;
    /** Handler called when the type of the constraint is updated */
    onUpdateConstraint: (constraint: EdgeConstraintItem) => void | Promise<void>;
    /** The id of the source node */
    source: string;
    /** Graph data  */
    state: GraphState;
    /** The id of the target node */
    target: string;
}
