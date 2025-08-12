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
import { type KeyboardEvent, useCallback, useEffect, useMemo, useState } from 'react';

import styled from '@darajs/styled-components';

import { CONTROL_KEYS, Key } from '../constants';
import Input from '../input/input';
import { type InteractiveComponentProps } from '../types';
import InputStepper from './input-stepper';

const InputWrapper = styled.div<NumericInputProps>`
    display: flex;
    flex-direction: row;

    width: 22ch;
    height: 2.5rem;
    padding-right: 0.5rem;

    background-color: ${(props) => props.theme.colors.grey1};
    border: 1px solid ${(props) => (props.errorMsg ? props.theme.colors.error : props.theme.colors.grey1)};
    border-radius: 0.25rem;

    input {
        height: calc(2.5rem - 2px);
        border: none;
        border-radius: 0.25rem;
    }

    div {
        border: none;
        border-radius: 0.25rem;

        div {
            border: none;
            border-radius: 0.25rem;
        }
    }

    :hover {
        background-color: ${(props) => (props.disabled ? props.theme.colors.grey1 : props.theme.colors.grey2)};
        /* stylelint-disable -- fails to parse the statement */
        border: 1px solid
            ${(props) => {
                if (props.disabled) {
                    return props.theme.colors.grey1;
                }
                if (props.errorMsg) {
                    return props.theme.colors.error;
                }
                return props.theme.colors.grey2;
            }};
        /* stylelint-enable */

        input {
            background-color: ${(props) => (props.disabled ? props.theme.colors.grey1 : props.theme.colors.grey2)};
        }

        div {
            background-color: ${(props) => (props.disabled ? props.theme.colors.grey1 : props.theme.colors.grey2)};
        }
    }

    :focus-within:not(:disabled) {
        border: 1px solid ${(props) => (props.errorMsg ? props.theme.colors.error : props.theme.colors.grey3)};

        input {
            border: none;
        }
    }

    /* Fix: Overrides the 22ch default width of the nested regular input */
    > div:first-child {
        width: 100%;
        height: auto;
    }
`;

/**
 * A numeric characters only filter for the input component, can be applied to create a numeric input that prevents
 * invalid entries rather than just erroring them
 *
 * @param integerOnly whether to limit the input to only accept integers
 */
const numericFilter =
    (integerOnly?: boolean) =>
    (e: React.KeyboardEvent<HTMLInputElement>): boolean => {
        // Check for numbers
        if (parseInt(e.key) || parseInt(e.key) === 0) {
            return true;
        }

        // Check control keys
        if (CONTROL_KEYS.includes(e.key)) {
            return true;
        }

        const target = e.target as HTMLInputElement;
        // Check for decimal point and make sure there is only one
        if (!integerOnly && e.key === Key.PERIOD && !target.value.includes(Key.PERIOD)) {
            return true;
        }

        // Check for minus and make sure it's at the start
        if (e.key === Key.MINUS && !e.shiftKey && target.selectionStart === 0 && !target.value.includes(Key.MINUS)) {
            return true;
        }

        return false;
    };

/**
 * A helper function to get the initial value of the input, either from the value or the initialValue props
 *
 * @param value the value prop
 * @param initialValue the initialValue prop
 * @returns the initial value of the numeric input
 */
const getInitialValue = (value: number, initialValue: number): string => {
    if (Number.isFinite(value)) {
        return String(value);
    }
    if (Number.isFinite(initialValue)) {
        return String(initialValue);
    }
    return '';
};

export interface NumericInputProps
    extends InteractiveComponentProps<number>,
        // `value`, `initialValue`, and `onChange` have a different signature compared to the standard input element
        Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'initialValue'> {
    /** An optional parameter to restrict the field to just integers */
    integerOnly?: boolean;
    /** An optional property to set the maximum accepted value */
    maxValue?: number;
    /** An optional property to set the minimum accepted value */
    minValue?: number;
    /** An optional onChange handler for listening to changes in the input */
    onChange?: (value: number, e?: React.SyntheticEvent<HTMLInputElement>) => void | Promise<void>;
    /** An optional event listener for complete events (enter presses) */
    onComplete?: () => void | Promise<void>;
    /** An optional property to set how many steps the stepper should take */
    stepSkip?: number;
    /** An optional property to show input stepper control */
    stepper?: boolean;
}

/**
 * NumericInput is a wrapper around the input component that restricts the value to be numeric, either float or integer.
 *
 * @param props the component props
 */
const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(
    (
        { value, onChange, initialValue, ...props }: NumericInputProps,
        ref: React.ForwardedRef<HTMLInputElement>
    ): JSX.Element => {
        const keydownFilter = useMemo(() => numericFilter(props.integerOnly), [props.integerOnly]);
        const [input, setInput] = useState(() => getInitialValue(value, initialValue));

        const step = (v: number): void => {
            let currentInput = input;

            if (!input || input === '-') {
                currentInput = props.minValue ? String(props.minValue) : '0';
            }

            const parsedValue = parseFloat(currentInput) || 0;
            const nextValueNumber = parsedValue + v;
            // Determine appropriate decimal places for formatting
            let nextValueStr: string;
            const inputHasDecimals = currentInput.includes('.');
            const stepHasDecimals = v % 1 !== 0;

            if (inputHasDecimals || stepHasDecimals) {
                // Preserve reasonable precision
                const inputDecimals = inputHasDecimals ? currentInput.split('.')[1]?.length || 0 : 0;
                const stepDecimals = stepHasDecimals ? v.toString().split('.')[1]?.length || 0 : 0;
                const maxDecimals = Math.max(inputDecimals, stepDecimals);
                nextValueStr = nextValueNumber.toFixed(maxDecimals);
            } else {
                nextValueStr = String(nextValueNumber);
            }

            // controlled
            if (value !== undefined) {
                onChange?.(nextValueNumber, {
                    target: {
                        value: nextValueStr,
                    },
                } as unknown as React.SyntheticEvent<HTMLInputElement>);
                // uncontrolled
            } else {
                setInput(nextValueStr);
            }
        };

        const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
            // run the keydown event handler if it exists
            props.onKeyDown?.(e);

            if (!props.stepper) {
                return;
            }

            const stepSkip = Math.abs(props.stepSkip ?? 1);

            if (e.key === Key.UP) {
                step(stepSkip);
            }
            if (e.key === Key.DOWN) {
                step(stepSkip * -1);
            }
        };

        const handleOnChange = useCallback(
            (v: string, e?: React.SyntheticEvent<HTMLInputElement>) => {
                const parsed = props.integerOnly ? parseInt(v) : parseFloat(v);
                // uncontrolled component
                if (value === undefined) {
                    setInput(v);
                    onChange?.(parsed, e);
                    return;
                }
                // In controlled mode, we need to take over the input updates whenever the value is not a valid number
                // This way onchange is only called with valid number updates and not when user is still entering a valid number

                // if the value ends with a period, don't call onChange as it's not yet a valid number
                if (v.endsWith('.')) {
                    setInput(v);
                    return;
                }
                // if the value is decimal and ends in a zero the user has also not changed the number/finished typing
                if (v.includes('.') && v.endsWith('0')) {
                    setInput(v);
                    return;
                }
                // if the user is typing a negative number, don't call onChange until they have added the number
                if (v === '-') {
                    setInput(v);
                    return;
                }
                // When the input ends with . and the user backspaces, we should update the input as the value won't have changed
                if (input.endsWith('.')) {
                    setInput(v);
                }
                onChange?.(parsed, e);
            },
            [props.integerOnly, value, onChange, input]
        );

        useEffect(() => {
            setInput(getInitialValue(value, initialValue));
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [value]);

        return (
            <div>
                <InputWrapper
                    disabled={props.disabled}
                    errorMsg={props.errorMsg}
                    stepper={props.stepper}
                    style={props.style}
                >
                    <Input
                        {...props}
                        keydownFilter={keydownFilter}
                        onChange={handleOnChange}
                        onKeyDown={onKeyDown}
                        ref={ref}
                        value={input}
                    />
                    {props.stepper && <InputStepper disabled={props.disabled} step={step} stepSkip={props.stepSkip} />}
                </InputWrapper>
            </div>
        );
    }
);
Input.displayName = 'NumericInput';

export default NumericInput;
