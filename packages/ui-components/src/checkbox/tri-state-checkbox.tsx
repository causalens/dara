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
import { useEffect, useState } from 'react';

import styled from '@darajs/styled-components';

import { InteractiveComponentProps } from '../types';
import Checkbox from './checkbox';

export enum CheckboxState {
    CHECKED = 'checked',
    INDETERMINATE = 'indeterminate',
    UNCHECKED = 'unchecked',
}

interface TriStateProp {
    state: CheckboxState;
}

const StyledTriStateCheckbox = styled.div<TriStateProp>`
    ${(props) => {
        if (props.state === CheckboxState.INDETERMINATE) {
            return `
                    span:after {
                        display: block ;
                        left: 0.07rem;
                        top: 0.4rem;
                        width: 0.75rem;
                        border-radius: 0.25rem;
                        height: 0px;
                        border: 1px solid ${props.theme.colors.grey6};
                        transform: rotate(0deg)
                    }

            `;
        }
    }}
`;

function computeState(allSelected: boolean, noneSelected: boolean): CheckboxState {
    if (noneSelected) {
        return CheckboxState.UNCHECKED;
    }
    return allSelected ? CheckboxState.CHECKED : CheckboxState.INDETERMINATE;
}

export interface CheckboxProps extends InteractiveComponentProps<boolean> {
    /** Set the check box to be checked */
    allSelected?: boolean;
    /** Set the check box to be unchecked */
    noneSelected?: boolean;
    /** An optional onChange handler, will be called whenever the state of the checkbox changes */
    onChange?: (state: CheckboxState, e?: React.SyntheticEvent<HTMLInputElement, Event>) => void | Promise<void>;
}

function getControlledState(allSelected: boolean, noneSelected: boolean): boolean | undefined {
    if (allSelected) {
        return allSelected;
    }
    if (noneSelected) {
        return false;
    }
    return undefined;
}

/**
 * A tri-state (or indeterminate) checkbox component
 *
 * @param {CheckboxProps} props - the component props
 */
function TriStateCheckbox(props: CheckboxProps): JSX.Element {
    const [state, setState] = useState(computeState(props.allSelected, props.noneSelected));

    useEffect(() => {
        setState(computeState(props.allSelected, props.noneSelected));
    }, [props.allSelected, props.noneSelected]);

    const onClick = (checked: boolean, e: React.FormEvent<HTMLInputElement>): void => {
        setState(checked ? CheckboxState.CHECKED : CheckboxState.UNCHECKED);

        if (props.onChange) {
            if (state === CheckboxState.UNCHECKED) {
                props.onChange(CheckboxState.CHECKED, e);
            } else {
                props.onChange(CheckboxState.UNCHECKED, e);
            }
        }
    };

    return (
        <StyledTriStateCheckbox state={state} style={props.style}>
            <Checkbox
                className={props.className}
                disabled={props.disabled}
                initialValue={state === CheckboxState.CHECKED}
                onChange={(checked, event) => {
                    onClick(checked, event);
                }}
                selected={getControlledState(props.allSelected, props.noneSelected)}
            />
        </StyledTriStateCheckbox>
    );
}

export default TriStateCheckbox;
