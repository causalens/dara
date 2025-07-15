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
import { type ColumnInterface, type Renderer } from 'react-table';

import { type ActionCol } from './cells/action-cell';

export interface TableColumn extends ColumnInterface<Record<string, unknown>> {
    // These are vague as the type we use doesn't exactly match the react-table type, we inject a few
    // global properties into the options; should be fixed once we upgrade to v8
    Cell?: Renderer<any>;
    Header?: Renderer<any>;
    accessor: string;
    actions?: Array<ActionCol>;
    align?: string;
    filter?: 'text' | 'categorical' | 'numeric' | 'datetime';
    sortKey?: string;
    sticky?: string;
    tooltip?: string;
}
