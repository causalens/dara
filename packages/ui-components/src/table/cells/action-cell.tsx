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

import styled from '@darajs/styled-components';
import { CheckSquare, Copy, IconProps, Square, ToggleOff, ToggleOn, Trash } from '@darajs/ui-icons';

export enum Action {
    COPY = 'copy',
    DELETE = 'delete',
    SELECT = 'select',
    SELECT_ALL = 'select_all',
    SWITCH = 'switch',
    UNSELECT_ALL = 'unselect_all',
}

const SelectCheck = styled(CheckSquare)`
    color: ${(props) => props.theme.colors.primary};
`;

function getSelectIcon(row: { [k: string]: any }): (props: IconProps) => JSX.Element {
    return row.selected ? SelectCheck : Square;
}

const SwitchOn = styled(ToggleOn)`
    color: ${(props) => props.theme.colors.primary};
`;

function getSwitchIcon(row: { [k: string]: any }): (props: IconProps) => JSX.Element {
    return row.active ? SwitchOn : ToggleOff;
}

export interface ActionCol {
    getIcon?: (row: any) => (props: IconProps) => JSX.Element;
    getLabel?: (row: any) => string;
    icon?: (props: IconProps) => JSX.Element;
    id: Action | string;
    label?: string;
}

export const Actions: { [k: string]: ActionCol } = {
    COPY: { icon: Copy, id: Action.COPY, label: 'Copy' },
    DELETE: { icon: Trash, id: Action.DELETE, label: 'Delete' },
    SELECT: { getIcon: getSelectIcon, id: Action.SELECT, label: 'Select Row' },
    SELECT_ALL: { id: Action.SELECT_ALL, label: 'Select All Rows' },
    SWITCH: { getIcon: getSwitchIcon, id: Action.SWITCH, label: 'Switch On/Off' },
    UNSELECT_ALL: { id: Action.UNSELECT_ALL, label: 'Unselect All Rows' },
};

const ActionWrapper = styled.div`
    display: flex;
    align-items: center;
    justify-content: flex-end;

    width: 100%;
    padding: 0 1rem;

    svg:not(:last-of-type) {
        margin-right: 0.7rem;
    }
`;

/** Interface is very loose because react table basically lets anything go through here */
interface ActionCellProps {
    column: any;
    // eslint-disable-next-line react/no-unused-prop-types
    data: any;
    onAction: (actionId: string, row: any) => void | Promise<void>;
    row: any;
}

/**
 * The action cell is used by the action column to render row actions such as delete on each row of a table
 *
 * @param {ActionCellProps} props see interface for details
 */
export function ActionCell(props: ActionCellProps): JSX.Element {
    if (!props.column.actions) {
        throw new Error('Must pass an array of actions to the column def when using the ActionCell');
    }
    return (
        <ActionWrapper className="table-action-cell">
            {props.column.actions.map((action: ActionCol) => {
                const Icon = action.getIcon ? action.getIcon(props.row.original) : action.icon;
                if (Icon === undefined) {
                    return;
                }
                const label = action.getLabel ? action.getLabel(props.row.original) : action.label;
                const onClick = (e: React.SyntheticEvent<SVGSVGElement>): void => {
                    e.stopPropagation();
                    props.onAction?.(action.id, props.row.original);
                };
                return <Icon asButton key={action.label} onClick={onClick} title={label} />;
            })}
        </ActionWrapper>
    );
}
