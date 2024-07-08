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
import TriStateCheckbox, { CheckboxState } from '../../checkbox/tri-state-checkbox';
import { Action } from '../cells/action-cell';

interface selectHeaderProps {
    /** An action handler, will be called for selecting/unselecting all rows */
    onAction: (actionId: string, input?: any) => void | Promise<void>;
    /** The rows of the table, needed to keep track of them being selected or not */
    rows: any;
}

/**
 * A table header with a tri-state checkbox, for bulk selection actions
 *
 * @param {selectHeaderProps} props - the component props
 */
function SelectHeader(props: selectHeaderProps): JSX.Element {
    const allValues = props.rows.map((r: any) => r.original.selected);
    const countSelected = allValues.filter(Boolean).length;

    const allSelected = countSelected > 0 && countSelected === allValues.length;
    const noneSelected = countSelected === 0;

    const onChange = (state: CheckboxState): void => {
        if (state === CheckboxState.UNCHECKED) {
            props.onAction(Action.UNSELECT_ALL);
        } else if (state === CheckboxState.CHECKED) {
            props.onAction(
                Action.SELECT_ALL,
                props.rows.map((r: any) => r.original)
            );
        }
    };
    return (
        <TriStateCheckbox
            allSelected={allSelected}
            noneSelected={noneSelected}
            onChange={onChange}
            style={{ display: 'flex', justifyContent: 'center' }}
        />
    );
}

export default SelectHeader;
