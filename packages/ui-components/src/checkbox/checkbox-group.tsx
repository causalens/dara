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
import { useEffect, useMemo, useState } from 'react';

import styled from '@darajs/styled-components';

import { Item } from '../types';
import Checkbox from './checkbox';

export interface ItemState {
    state: boolean;
    value: any;
}

const CheckboxWrapper = styled.div`
    user-select: none;
    display: flex;
    width: 100%;
    border: none;
`;

const CheckboxGroupWrapper = styled.div`
    color: ${(props) => props.theme.colors.text};
`;

const CheckboxInfo = styled.p`
    font-size: 0.75rem;
    color: ${(props) => props.theme.colors.grey4};
`;

export interface CheckboxGroupProps {
    /** Standard react className property */
    className?: string;
    /** Standard react className property */
    disabled?: boolean;
    /** Initial checkboxes that should be checked */
    initialValue?: Array<Item> | Item;
    /** Whether to show checkboxes in list style */
    isListStyle?: boolean;
    /** The items to pick from the list. Each should have a label and a value */
    items: Array<Item>;
    /** An optional onChange handler, will be called whenever the state of the checkbox changes */
    onChange?: (value: Array<Item> | Item, e?: React.FormEvent<HTMLInputElement>) => void | Promise<void>;
    /** The maximum number of items that can be selected at one time */
    selectMax?: number;
    /** The minimum number of items that should be selected */
    selectMin?: number;
    /** Default React style prop */
    style?: React.CSSProperties;
    /** An optional value field to put the input into a controlled mode */
    values?: Array<Item>;
}

function getInitialValue(initialValue: Array<Item> | Item): Array<Item> {
    if (Array.isArray(initialValue)) {
        return initialValue;
    }
    if (initialValue) {
        return [initialValue];
    }
    return [];
}

function getInitialCheckedState(items: Array<Item>, initialValues: Array<any>): Array<ItemState> {
    if (initialValues) {
        return items.map((item) => ({ state: initialValues.includes(item.value), value: item.value }));
    }
    return items.map((item) => ({ state: initialValues.includes(item.value), value: false }));
}

/**
 * A checkbox group component
 *
 * @param {CheckboxGroupProps} props - the component props
 */
function CheckboxGroup(props: CheckboxGroupProps): JSX.Element {
    const [values, setValues] = useState(() => getInitialValue(props.values || props.initialValue));
    const [checkedState, setCheckedState] = useState(() => getInitialCheckedState(props.items, values));

    const isSelectPermitted = useMemo(() => {
        if (!props.selectMax || values.length < props.selectMax) {
            return true;
        }
        return false;
    }, [values, props.selectMax]);

    const infoMessage = useMemo(() => {
        if (props.selectMax && props.selectMin) {
            return `You can select from ${props.selectMin} to ${props.selectMax} options`;
        }
        if (props.selectMax) {
            return `You can select up to ${props.selectMax} options`;
        }
        if (props.selectMin) {
            return `You should select at least ${props.selectMin} options`;
        }
    }, [props.selectMax, props.selectMin]);

    const onChangeValue = (event: React.FormEvent<HTMLInputElement>): void => {
        const target = event.target as HTMLInputElement;
        const chosenIndex = Number(target.value);
        const chosenValue = props.items[chosenIndex].value;
        let newValues = [...values];

        // find what the new values would be
        if (values.includes(chosenValue)) {
            newValues = newValues.filter((value) => value !== chosenValue);
        } else {
            newValues.push(chosenValue);
        }

        // if new values would result in above the number permitted, only allow to uncheck selected checkboxes
        // or if values below above permited/unconstrained then allow it to switch states
        if (
            (newValues.length > props.selectMax && checkedState[chosenIndex]) ||
            newValues.length <= props.selectMax ||
            !props.selectMax
        ) {
            const indexToUpdate = checkedState.findIndex((item) => item.value === chosenValue);
            checkedState[indexToUpdate].state = !checkedState[indexToUpdate].state;
            setCheckedState(checkedState);

            setValues(newValues);
            if (!props.selectMin || newValues.length >= props.selectMin) {
                props.onChange?.(
                    props.items.filter((item) => newValues.includes(item.value)),
                    event
                );
            }
        }
    };

    useEffect(() => {
        if (props.values) {
            const valuesArray = props.values.map((value) => value.value);
            setCheckedState(
                props.items.map((item) => ({ state: valuesArray.includes(item.value), value: item.value }))
            );
            setValues(valuesArray);
        }
    }, [props.values, props.items]);

    return (
        <CheckboxGroupWrapper className={props.className} style={props.style}>
            {(props.selectMax || props.selectMin) && <CheckboxInfo>{infoMessage}</CheckboxInfo>}
            {props.items.map((item, index) => {
                return (
                    <CheckboxWrapper aria-disabled={props.disabled} key={`item-${index}`}>
                        <Checkbox
                            disabled={
                                isSelectPermitted ?
                                    props.disabled
                                :   checkedState.find((option) => option.value === item.value)?.state === false
                            }
                            id={index}
                            isListStyle={props.isListStyle}
                            label={item.label ? item.label : item.value}
                            onChange={(checked, e) => onChangeValue(e)}
                            selected={checkedState.find((option) => option.value === item.value)?.state}
                        />
                    </CheckboxWrapper>
                );
            })}
        </CheckboxGroupWrapper>
    );
}

export default CheckboxGroup;
