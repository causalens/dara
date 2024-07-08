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
import { ForwardedRef, forwardRef } from 'react';

import styled from '@darajs/styled-components';

import { Key } from '../constants';
import { InteractiveComponentProps } from '../types';

interface PrimaryInputProps {
    isErrored: boolean;
}

const PrimaryInput = styled.input<PrimaryInputProps>`
    display: flex;
    align-items: center;

    width: 100%;
    height: 100%;
    padding: 0 1rem;

    font-size: 1rem;
    color: ${(props) => (props.disabled ? props.theme.colors.grey2 : props.theme.colors.text)};

    background-color: ${(props) => props.theme.colors.grey1};
    border: 1px solid ${(props) => (props.isErrored ? props.theme.colors.error : props.theme.colors.grey1)};
    border-radius: 0.25rem;
    outline: 0;

    :active:not(:disabled),
    :focus:not(:disabled) {
        border: 1px solid ${(props) => (props.isErrored ? props.theme.colors.error : props.theme.colors.grey3)};
    }

    :hover:not(:disabled) {
        background-color: ${(props) => props.theme.colors.grey2};
    }

    :disabled {
        cursor: not-allowed;
    }

    ::placeholder {
        font-style: italic;
    }
`;

const InputWrapper = styled.div`
    width: 22ch;
    max-width: 100%;
    height: 2.5rem;
`;

export const ErrorMessage = styled.span`
    margin-left: 1rem;
    font-size: 0.75rem;
    color: ${(props) => props.theme.colors.error};
`;

export interface InputProps extends InteractiveComponentProps<string> {
    /** An optional prop to focus the input upon mounting it */
    autoFocus?: boolean;
    /** An optional keydown event filter, that can filter out invalid chars from an input. Should return true to let
     * the char through */
    keydownFilter?: (e: React.KeyboardEvent<HTMLInputElement>) => boolean;
    /** An optional maximum length */
    maxLength?: number;
    /** An optional value to put in the input to check for maximum value */
    maxValue?: any;
    /** An optional value to put in the input to check for minimum value */
    minValue?: any;
    /** An optional onBlur handler for listening to input blur events */
    onBlur?: (e: React.SyntheticEvent<HTMLInputElement>) => void | Promise<void>;
    /** An optional onChange handler for listening to changes in the input */
    onChange?: (value: string, e?: React.SyntheticEvent<HTMLInputElement>) => void | Promise<void>;
    /** An optional onClick handler for listening to input click events */
    onClick?: (e: React.SyntheticEvent<HTMLInputElement>) => void | Promise<void>;
    /** An optional event listener for complete events (enter presses) */
    onComplete?: () => void | Promise<void>;
    /** An optional handler for listening to key down events */
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void | Promise<void>;
    /** An optional placeholder that will be used when the input is empty, defaults to '' */
    placeholder?: string;
    /** Input type attribute */
    type?: string;
}

/**
 * A simple text input component, accepts an onChange handler to listen for changes.
 *
 * Note: this needs to be a const forwardRef rather than a separate function wrapped
 * in a forwardRef in export statement as this does not work with Storybook
 *
 * @param props - the component props
 * @param ref - forward ref that's attached to underlying input element
 */
const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ type = 'text', ...props }: InputProps, ref: ForwardedRef<HTMLInputElement>) => {
        const onChange = (e: React.SyntheticEvent<HTMLInputElement>): void => {
            const target = e.target as HTMLInputElement;
            if (props.onChange) {
                props.onChange(target.value, e);
            }
        };

        const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
            if (props.onKeyDown) {
                props.onKeyDown(e);
            }

            if (props.keydownFilter && !props.keydownFilter(e)) {
                e.preventDefault();
            }
            if (e.key === Key.ENTER && props.onComplete) {
                props.onComplete();
            }
        };

        // Add all optional items here to be used by the primary input
        const addOptionalItems = (): any => {
            const result: any = {};
            if (props.minValue) {
                result.minValue = props.minValue;
            }
            if (props.maxValue) {
                result.maxValue = props.minValue;
            }

            return result;
        };

        return (
            <InputWrapper className={props.className} style={props.style}>
                <PrimaryInput
                    autoFocus={props.autoFocus}
                    defaultValue={props.initialValue}
                    disabled={props.disabled}
                    isErrored={!!props.errorMsg}
                    maxLength={props.maxLength}
                    onBlur={props.onBlur}
                    onChange={onChange}
                    onClick={props.onClick}
                    onKeyDown={onKeyDown}
                    placeholder={props.placeholder}
                    ref={ref}
                    type={type}
                    value={props.value}
                    {...addOptionalItems()}
                />
                {props.errorMsg && <ErrorMessage>{props.errorMsg} </ErrorMessage>}
            </InputWrapper>
        );
    }
);
Input.displayName = 'Input';

export default Input;
