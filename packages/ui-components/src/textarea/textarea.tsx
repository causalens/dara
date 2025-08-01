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
import { useIME } from '@darajs/ui-utils';

import { Key } from '../constants';
import { type InteractiveComponentProps } from '../types';

const ErrorMessage = styled.span`
    display: flex;
    flex-direction: column;

    padding-left: 1rem;

    font-size: 0.75rem;
    color: ${(props) => props.theme.colors.error};
`;

interface PrimaryTextAreaProps {
    isErrored: boolean;
}

const PrimaryTextArea = styled.textarea<PrimaryTextAreaProps>`
    display: flex;
    flex: 1 1 auto;
    align-items: center;

    width: 100%;
    height: 100%;
    min-height: 3.4rem;
    padding: 1rem;

    font-size: 1rem;
    color: ${(props) => (props.disabled ? props.theme.colors.grey2 : props.theme.colors.text)};

    background-color: ${(props) => props.theme.colors.grey1};
    border: 1px solid ${(props) => (props.isErrored ? props.theme.colors.error : props.theme.colors.grey1)};
    border-radius: 0.25rem;
    outline: 0;

    :hover:not(:disabled) {
        border: 1px solid ${(props) => (props.isErrored ? props.theme.colors.error : props.theme.colors.grey2)};
    }

    :focus:not(:disabled) {
        border: 1px solid ${(props) => (props.isErrored ? props.theme.colors.error : props.theme.colors.grey3)};
    }

    :active:not(:disabled) {
        border: 1px solid ${(props) => (props.isErrored ? props.theme.colors.error : props.theme.colors.grey3)};
    }

    :disabled {
        cursor: not-allowed;
    }

    ::placeholder {
        font-style: italic;
    }
`;

export interface TextAreaProps extends InteractiveComponentProps<string> {
    /** An optional prop to focus the textarea upon mounting it */
    autoFocus?: boolean;
    /** An optional keydown event filter, that can filter out invalid chars from an textarea. Should return true to let
     * the char through */
    keydownFilter?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => boolean;
    /** An optional onBlur handler for listening to textarea blur events */
    onBlur?: (e: React.SyntheticEvent<HTMLTextAreaElement>) => void | Promise<void>;
    /** An optional onChange handler for listening to changes in the textarea */
    onChange?: (value: string, e?: React.SyntheticEvent<HTMLTextAreaElement>) => void | Promise<void>;
    /** An optional onClick handler for listening to input click events */
    onClick?: (e: React.SyntheticEvent<HTMLTextAreaElement>) => void | Promise<void>;
    /** An optional event listener for complete events (enter presses) */
    onComplete?: () => void | Promise<void>;
    /** An optional placeholder that will be used when the textarea is empty, defaults to '' */
    placeholder?: string;
    /** An optional property which sets whether the textarea is resizable, and if so, in which directions */
    resize?: 'none' | 'both' | 'horizontal' | 'vertical' | 'block' | 'inline';
    /** The maximum height the textarea will grow to, if not set it will not grow as more text is entered, this expected as an rem value */
    maxHeight?: number;
}

/**
 * A simple text area component, accepts an onChange handler to listen for changes.
 *
 * @param props - the component props
 */
function TextArea({
    autoFocus,
    className,
    disabled,
    errorMsg,
    initialValue,
    keydownFilter,
    maxHeight,
    onBlur,
    onChange,
    onClick,
    onComplete,
    placeholder,
    style,
    value,
    resize,
}: TextAreaProps): JSX.Element {
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);

    React.useLayoutEffect(() => {
        if (maxHeight && textareaRef.current) {
            const computedStyle = window.getComputedStyle(textareaRef.current);
            const minHeight = parseFloat(computedStyle.minHeight);
            const maxHeightInPx = parseFloat(computedStyle.maxHeight);

            // Reset the height to the initial minimum height in px
            textareaRef.current.style.height = `${minHeight}px`;

            // Calculate the new height based on scrollHeight
            const newHeight = textareaRef.current.scrollHeight;

            if (minHeight < newHeight) {
                const adjustedHeight = Math.min(newHeight, maxHeightInPx);
                // Set the textarea height to the new calculated height
                textareaRef.current.style.height = `${adjustedHeight}px`;

                // Toggle overflow-y based on whether maxHeight is reached, this is to guarantee overflow does not show before it is needed
                if (adjustedHeight >= maxHeightInPx) {
                    textareaRef.current.style.overflowY = 'auto';
                } else {
                    textareaRef.current.style.overflowY = 'hidden';
                }
            } else {
                textareaRef.current.style.overflowY = 'hidden';
            }
        }
    }, [maxHeight, value]);

    const onChangeText = (e: React.SyntheticEvent<HTMLTextAreaElement>): void => {
        const target = e.target as HTMLInputElement;
        if (onChange) {
            onChange(target.value, e);
        }
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
        if (keydownFilter && !keydownFilter(e)) {
            e.preventDefault();
        }
        if (e.key === Key.ENTER && e.shiftKey && onComplete) {
            return;
        }
        if (e.key === Key.ENTER && onComplete) {
            onComplete();
        }
    };

    const inputHandlers = useIME({
        onKeyDown,
    });

    return (
        <div className={className} style={style}>
            <PrimaryTextArea
                ref={textareaRef}
                autoFocus={autoFocus}
                defaultValue={initialValue}
                disabled={disabled}
                isErrored={!!errorMsg}
                onBlur={onBlur}
                onChange={onChangeText}
                onClick={onClick}
                {...inputHandlers}
                placeholder={placeholder}
                style={{ resize, maxHeight: maxHeight ? `${maxHeight}rem` : 'none' }}
                value={value}
            />
            {errorMsg && <ErrorMessage>{errorMsg}</ErrorMessage>}
        </div>
    );
}

export default TextArea;
