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
import isEqual from 'lodash/isEqual';
import { useEffect, useId, useState } from 'react';

import styled from '@darajs/styled-components';

import { type InteractiveComponentProps } from '../types';

interface RadioGroupWrapperProps {
    isHorizontal?: boolean;
}

const RadioGroupWrapper = styled.div<RadioGroupWrapperProps>`
    display: ${(props) => (props.isHorizontal ? 'flex' : 'block')};
    gap: ${(props) => (props.isHorizontal ? '1.25rem' : '0rem')};
`;

interface RadioWrapperProps {
    isListStyle: boolean;
}

const RadioWrapper = styled.label<RadioWrapperProps>`
    cursor: ${(props) => (props['aria-disabled'] ? 'not-allowed' : 'pointer')};
    user-select: none;

    display: flex;
    gap: 0.5rem;
    align-items: center;
    justify-content: flex-start;

    width: ${(props) => (props.isListStyle ? 'auto' : 'fit-content')};
    height: 2.5rem;
    padding: 0 0.5rem;

    color: ${(props) => (props['aria-disabled'] ? props.theme.colors.grey3 : props.theme.colors.text)};

    border: none;
    border-radius: 0.25rem;

    /* sets checkmark indicator */
    span::after {
        top: calc(0.25rem - 1px);
        left: calc(0.25rem - 1px);

        width: 0.5rem;
        height: 0.5rem;

        background-color: ${(props) => (props['aria-disabled'] ? props.theme.colors.grey3 : props.theme.colors.grey5)};
        border-radius: 50%;
    }

    /* Show the checkmark when checked */
    input:checked ~ span::after {
        display: block;
    }

    /* Controls background color change depending on style */
    ${(props) => {
        if (props.isListStyle) {
            return `:hover {
                        background-color: ${props['aria-disabled'] ? 'none' : props.theme.colors.grey1}
            }
            :active {
                background-color: ${props['aria-disabled'] ? 'none' : props.theme.colors.grey2}
    }`;
        }
        return `
        :hover {
            span {
            background-color: ${props['aria-disabled'] ? 'none' : props.theme.colors.grey1};
            }
        }

        :active {
            span {
            background-color: ${props['aria-disabled'] ? 'none' : props.theme.colors.grey2};
            }
        }
        `;
    }}

    /* Sets the outer rim color of radio button */
    :hover {
        span {
            border: 1px solid
                ${(props) => (props['aria-disabled'] ? props.theme.colors.grey2 : props.theme.colors.grey4)};
        }
    }

    :active {
        span {
            border: 1px solid
                ${(props) => (props['aria-disabled'] ? props.theme.colors.grey2 : props.theme.colors.grey4)};
        }
    }
`;

// hides default html radio button
const RadioButton = styled.input`
    position: absolute;
    opacity: 0;
`;

interface StyledCheckmarkProps {
    disabled: boolean;
}

// customdot/circle for the radio button
const StyledCheckmark = styled.span<StyledCheckmarkProps>`
    position: relative;
    top: 0;
    left: 0;

    width: 1rem;
    height: 1rem;

    background-color: ${(props) => (props.disabled ? props.theme.colors.grey1 : props.theme.colors.blue1)};
    border: 1px solid ${(props) => (props.disabled ? props.theme.colors.grey2 : props.theme.colors.grey3)};
    border-radius: 50%;

    ::after {
        content: '';
        position: relative;
        display: none;
    }
`;

export interface RadioItem {
    value: any;
    label: React.ReactNode;
}

export interface RadioGroupProps extends InteractiveComponentProps<RadioItem> {
    /** An optional id for the component */
    id?: string;
    /** An optional value which determines the direction of the radio group components by default is vertical */
    direction?: 'horizontal' | 'vertical';
    /** Whether to show radio in list style */
    isListStyle?: boolean;
    /** The items to pick from the list. Each should have a label and a value */
    items: Array<RadioItem>;
    /** An optional onChange handler, will be called whenever the state of the checkbox changes */
    onChange?: (value: RadioItem, e?: React.FormEvent<HTMLInputElement>) => void | Promise<void>;
}

/**
 * A simple radio component
 *
 * @param {RadioGroupProps} props - the component props
 */
function RadioGroup(props: RadioGroupProps): JSX.Element {
    const isControlled = props.value !== undefined;

    const [currentSelected, setCurrentSelected] = useState(() => {
        if (isControlled) {
            return props.items.findIndex((item) => isEqual(item.value, props.value));
        }
        return props.items.findIndex((item) => isEqual(item.value, props.initialValue));
    });

    // radio needs a name that is unique to that radio component, so that more than one radio components on a page don't get mixed inputs
    const uuid = useId();

    const onChangeValue = (event: React.FormEvent<HTMLInputElement>): void => {
        const target = event.target as HTMLInputElement;
        const chosenIndex = Number(target.value);

        if (isControlled) {
            // controlled mode - only call onChange, don't update internal state
            props.onChange?.(props.items[chosenIndex], event);
        } else {
            // uncontrolled mode - update internal state and call onChange
            setCurrentSelected(chosenIndex);
            props.onChange?.(props.items[chosenIndex], event);
        }
    };

    useEffect(() => {
        if (isControlled) {
            const newIndex = props.items.findIndex((item) => isEqual(item.value, props.value));
            setCurrentSelected(newIndex);
        }
    }, [isControlled, props.value, props.items]);

    return (
        <RadioGroupWrapper
            className={props.className}
            isHorizontal={props.direction === 'horizontal'}
            style={props.style}
            id={props.id}
        >
            {props.items.map((item, index) => {
                return (
                    <RadioWrapper aria-disabled={props.disabled} isListStyle={props.isListStyle} key={`item-${index}`}>
                        <RadioButton
                            checked={isControlled ? isEqual(props.value?.value, item.value) : currentSelected === index}
                            disabled={props.disabled}
                            name={uuid}
                            onChange={(e) => onChangeValue(e)}
                            type="radio"
                            value={index}
                        />
                        <StyledCheckmark disabled={props.disabled} />
                        {item.label ? item.label : item.value}
                    </RadioWrapper>
                );
            })}
        </RadioGroupWrapper>
    );
}

export default RadioGroup;
