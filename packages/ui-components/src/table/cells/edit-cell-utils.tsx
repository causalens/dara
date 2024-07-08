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
import * as React from 'react';

/** Interface is very loose because react table basically lets anything go through here */
export interface EditCellProps<T> {
    cell: any;
    column: any;
    currentEditCell?: [number, string | number];
    data: any;
    onAction: (actionId: string, row: any) => void | Promise<void>;
    onChange: (value: T, rowIdx: number, colId: string) => void | Promise<void>;
    onStartEdit: (e?: React.SyntheticEvent<HTMLSpanElement>) => void | Promise<void>;
    onStopEdit: () => void | Promise<void>;
    row: any;
    rowIdx: number;
    value: any;
}
