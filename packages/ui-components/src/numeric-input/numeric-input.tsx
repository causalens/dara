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
import { KeyboardEvent, useCallback, useEffect, useMemo, useState } from 'react';

import styled from '@darajs/styled-components';

import { CONTROL_KEYS, Key } from '../constants';
import Input, { ErrorMessage } from '../input/input';
import { InteractiveComponentProps } from '../types';
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

export interface NumericInputProps extends InteractiveComponentProps<number> {
    /** An optional prop to focus the input upon mounting it */
    autoFocus?: boolean;
    /** An optional parameter to restrict the field to just integers */
    integerOnly?: boolean;
    /** An optional property to set the maximum accepted value */
    maxValue?: number;
    /** An optional property to set the minimum accepted value */
    minValue?: number;
    /** An optional onBlur handler for listening to input blur events */
    onBlur?: (e: React.SyntheticEvent<HTMLInputElement>) => void | Promise<void>;
    /** An optional onChange handler for listening to changes in the input */
    onChange?: (value: number, e?: React.SyntheticEvent<HTMLInputElement>) => void | Promise<void>;
    /** An optional event listener for complete events (enter presses) */
    onComplete?: () => void | Promise<void>;
    /** An optional event listener for keydown events */
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void | Promise<void>;
    /** An optional placeholder that will be used when the input is empty, defaults to '' */
    placeholder?: string;
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
    (props: NumericInputProps, ref: React.ForwardedRef<HTMLInputElement>): JSX.Element => {
        const keydownFilter = useMemo(() => numericFilter(props.integerOnly), [props.integerOnly]);
        const [input, setInput] = useState(getInitialValue(props.value, props.initialValue));

        const step = (value: number): void => {
            if (!input || input === '-') {
                return;
            }

            const isFloat = input.includes('.');
            const parsedValue = isFloat ? parseFloat(input) : parseInt(input);

            let nextValueNumber = parsedValue + value;
            let nextValueStr = String(nextValueNumber);
            if (isFloat) {
                const decimals = input.split('.')[1];
                if (decimals) {
                    nextValueStr = (parsedValue + value / 10 ** decimals.length).toFixed(decimals.length);
                    nextValueNumber = parseFloat(nextValueStr);
                }
            }

            // controlled
            if (props.value !== undefined) {
                props.onChange?.(nextValueNumber, {
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

        const onChange = useCallback(
            (value: string, e?: React.SyntheticEvent<HTMLInputElement>) => {
                const parsed = props.integerOnly ? parseInt(value) : parseFloat(value);
                // uncontrolled component
                if (props.value === undefined) {
                    setInput(value);
                    props.onChange?.(parsed, e);
                    return;
                }
                // if the value ends with a period, don't call onChange as it's not yet a valid number
                if (value.endsWith('.')) {
                    setInput(value);
                    return;
                }
                // if the value is decimal and ends in a zero the user has also not changed the number/finished typing
                if (value.includes('.') && value.endsWith('0')) {
                    setInput(value);
                    return;
                }
                // if the user is typing a negative number, don't call onChange until they have added the number
                if (value === '-') {
                    setInput(value);
                    return;
                }
                props.onChange?.(parsed, e);
            },
            // eslint-disable-next-line react-hooks/exhaustive-deps
            [props.integerOnly, props.value, props.onChange]
        );

        useEffect(() => {
            setInput(getInitialValue(props.value, props.initialValue));
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [props.value]);

        return (
            <div>
                <InputWrapper
                    disabled={props.disabled}
                    errorMsg={props.errorMsg}
                    stepper={props.stepper}
                    style={props.style}
                >
                    <Input
                        autoFocus={props.autoFocus}
                        className={props.className}
                        disabled={props.disabled}
                        keydownFilter={keydownFilter}
                        maxValue={props.maxValue}
                        minValue={props.minValue}
                        onBlur={props.onBlur}
                        onChange={onChange}
                        onComplete={props.onComplete}
                        onKeyDown={onKeyDown}
                        placeholder={props.placeholder}
                        ref={ref}
                        value={input}
                    />
                    {props.stepper && <InputStepper disabled={props.disabled} step={step} stepSkip={props.stepSkip} />}
                </InputWrapper>
                {props.errorMsg && <ErrorMessage>{props.errorMsg}</ErrorMessage>}
            </div>
        );
    }
);
Input.displayName = 'NumericInput';

export default NumericInput;
