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
import { type ForwardedRef, forwardRef } from 'react';

import styled from '@darajs/styled-components';
import { useIME } from '@darajs/ui-utils';

import { Key } from '../constants';
import { type InteractiveComponentProps } from '../types';

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

export interface InputProps
    extends InteractiveComponentProps<string>,
        // `value` and `onChange` have a different signature compared to the standard input element
        Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
    /** An optional keydown event filter, that can filter out invalid chars from an input. Should return true to let
     * the char through */
    keydownFilter?: (e: React.KeyboardEvent<HTMLInputElement>) => boolean;
    /** An optional value to put in the input to check for maximum value */
    maxValue?: any;
    /** An optional value to put in the input to check for minimum value */
    minValue?: any;
    /** An optional onChange handler for listening to changes in the input */
    onChange?: (value: string, e?: React.SyntheticEvent<HTMLInputElement>) => void | Promise<void>;
    /** An optional event listener for complete events (enter presses) */
    onComplete?: () => void | Promise<void>;
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
    (
        {
            type = 'text',
            onChange,
            onKeyDown,
            keydownFilter,
            onComplete,
            maxValue,
            minValue,
            errorMsg,
            className,
            style,
            initialValue,
            ...rest
        }: InputProps,
        ref: ForwardedRef<HTMLInputElement>
    ) => {
        const handleChange = (e: React.SyntheticEvent<HTMLInputElement>): void => {
            const target = e.target as HTMLInputElement;
            if (onChange) {
                onChange(target.value, e);
            }
        };

        const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
            if (onKeyDown) {
                onKeyDown(e);
            }

            if (keydownFilter && !keydownFilter(e)) {
                e.preventDefault();
            }
            if (e.key === Key.ENTER && onComplete) {
                onComplete();
            }
        };

        const handlers = useIME({
            onKeyDown: handleKeyDown,
            onKeyUp: rest.onKeyUp,
            onCompositionStart: rest.onCompositionStart,
            onCompositionEnd: rest.onCompositionEnd,
        });

        const spreadProps = { ...rest, ...handlers };

        return (
            <InputWrapper className={className} style={style}>
                <PrimaryInput
                    {...spreadProps}
                    defaultValue={initialValue}
                    isErrored={!!errorMsg}
                    onChange={handleChange}
                    ref={ref}
                    type={type}
                    min={minValue}
                    max={maxValue}
                />
                {errorMsg && <ErrorMessage>{errorMsg}</ErrorMessage>}
            </InputWrapper>
        );
    }
);
Input.displayName = 'Input';

export default Input;
