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
import { transparentize } from 'polished';
import { ButtonHTMLAttributes, ForwardedRef, forwardRef } from 'react';

import styled, { DefaultTheme, useTheme } from '@darajs/styled-components';

import Spinner from '../spinner/spinner';

interface BaseButtonProps {
    $hasAnchor: boolean;
}

export const BaseButton = styled.button<BaseButtonProps>`
    cursor: ${(props) => (props.disabled ? 'not-allowed' : 'pointer')};
    user-select: none;

    display: flex;
    align-items: center;
    justify-content: center;

    height: 2.5rem;
    padding: ${(props) => (props.$hasAnchor ? 0 : '0 1rem')};
    padding: 0 1rem;

    font-size: 1rem;
    font-weight: 600;

    border: none;
    border-radius: 0.25rem;
`;

/**
 * Gets outline style for button
 *
 * @param buttonColor outline and text color for button
 * @param disabled whether button is disabled
 * @param theme the current theme being used by the app
 */
function getOutlinedButtonStyle(buttonColor: string, disabled: boolean, theme: DefaultTheme): string {
    return `
        color: ${disabled ? theme.colors.grey2 : buttonColor};

        background-color: transparent;
        border: 1px solid
            ${disabled ? theme.colors.grey2 : buttonColor};

        :hover:not(:disabled) {
            background-color: ${
                theme.themeType === 'dark' ? transparentize(0.85, buttonColor) : transparentize(0.9, buttonColor)
            };
        }

        :active:not(:disabled) {
            background-color: ${
                theme.themeType === 'dark' ? transparentize(0.7, buttonColor) : transparentize(0.8, buttonColor)
            };
        }
    `;
}

/**
 * Gets style for default button
 *
 * @param buttonColor background color for button
 * @param hoverColor background color when hovering
 * @param clickColor background color when clicking
 * @param disabled whether button is disabled
 * @param theme the current theme being used by the app
 * @param textColor optional text color to use instead of the default
 */
function getFilledButtonStyle(
    buttonColor: string,
    hoverColor: string,
    clickColor: string,
    disabled: boolean,
    theme: DefaultTheme,
    textColor?: string
): string {
    const color = textColor ?? theme.colors.blue1;

    return `
        color: ${color};

        background-color: ${disabled ? theme.colors.grey2 : buttonColor};

        :hover:not(:disabled) {
            background-color: ${hoverColor};
        }

        :active:not(:disabled) {
            background-color: ${clickColor};
        }
    `;
}

interface StyledButtonProps {
    outline?: boolean;
}

const PrimaryButton = styled(BaseButton)<StyledButtonProps>`
    ${(props) =>
        props.outline ?
            getOutlinedButtonStyle(props.theme.colors.primary, props.disabled, props.theme)
        :   getFilledButtonStyle(
                props.theme.colors.primary,
                props.theme.colors.primaryHover,
                props.theme.colors.primaryDown,
                props.disabled,
                props.theme
            )}
`;

const SecondaryButton = styled(BaseButton)<StyledButtonProps>`
    ${(props) =>
        props.outline ?
            getOutlinedButtonStyle(props.theme.colors.secondary, props.disabled, props.theme)
        :   getFilledButtonStyle(
                props.theme.colors.secondary,
                props.theme.colors.secondaryHover,
                props.theme.colors.secondaryDown,
                props.disabled,
                props.theme
            )}
`;

const GhostButton = styled(BaseButton)<StyledButtonProps>`
    ${(props) =>
        getFilledButtonStyle(
            'transparent',
            props.theme.colors.grey2,
            props.theme.colors.grey2,
            props.disabled,
            props.theme,
            props.theme.colors.grey4
        )}
`;

const ErrorButton = styled(BaseButton)<StyledButtonProps>`
    ${(props) =>
        props.outline ?
            getOutlinedButtonStyle(props.theme.colors.error, props.disabled, props.theme)
        :   getFilledButtonStyle(
                props.theme.colors.error,
                props.theme.colors.errorHover,
                props.theme.colors.errorDown,
                props.disabled,
                props.theme
            )}
`;

const PlainButton = styled(BaseButton)<StyledButtonProps>`
    ${(props) =>
        props.outline ?
            getOutlinedButtonStyle(props.theme.colors.grey6, props.disabled, props.theme)
        :   getFilledButtonStyle(
                'transparent',
                props.theme.colors.grey1,
                props.theme.colors.grey2,
                props.disabled,
                props.theme,
                props.theme.colors.grey6
            )}
`;

const AnchorWrapper = styled.a`
    display: flex;
    align-items: center;
    justify-content: center;

    width: 100%;
    height: 100%;
    padding: 0 1rem;

    color: inherit;

    :hover,
    :active {
        color: inherit;
        text-decoration: none;
    }
`;

const StyledLoading = styled(Spinner)`
    padding: 1rem 2rem;
`;

type Styling = 'primary' | 'secondary' | 'error' | 'ghost' | 'plain';

/** Map of styling -> Button subclass */
const stylingMap = {
    error: ErrorButton,
    ghost: GhostButton,
    plain: PlainButton,
    primary: PrimaryButton,
    secondary: SecondaryButton,
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    autoFocus?: boolean;
    /** The label of the button, can be any react node */
    children: React.ReactNode;
    /** Standard react className property */
    className?: string;
    /** Optional property to disable the button */
    disabled?: boolean;
    /** Optional property to set filename to download; should be used together with href for downloads */
    download?: string;
    /** Optional href to navigate to, will swap the button element for an anchor */
    href?: string;
    /** Component id */
    id?: string;
    /** Optional flag to show a loading state - replace the text of the button with a spinner */
    loading?: boolean;
    /** Optional onClick handler, will be called when the button is pressed */
    onClick?: (e?: React.SyntheticEvent<HTMLButtonElement>) => void | Promise<void>;
    /** If true the button will have the outline look, otherwise by default it takes the filled style */
    outline?: boolean;
    /** Native react style property, can be used to fine tune the button appearance */
    style?: React.CSSProperties;
    /** The style of the button, accepts: primary, secondary or error. Defaults to primary */
    styling?: Styling;
}

/**
 * A simple button component, accepts a styling prop to switch between the available styles: primary, secondary,
 * error, success, ghost.
 *
 * @param {ButtonProps} props - the component props
 */
function Button(
    {
        autoFocus,
        children,
        className,
        disabled,
        download,
        href,
        loading,
        id,
        onClick,
        outline = false,
        style,
        styling = 'primary',
        type = 'button',
        ...props
    }: ButtonProps,
    ref: ForwardedRef<HTMLButtonElement>
): JSX.Element {
    const currentTheme = useTheme();
    const Component = stylingMap[styling];
    const content =
        loading ? <StyledLoading color={outline ? currentTheme.colors.grey2 : currentTheme.colors.blue1} /> : children;
    const wrappedContent =
        href ?
            <AnchorWrapper download={download} href={href}>
                {content}
            </AnchorWrapper>
        :   content;

    return (
        <Component
            $hasAnchor={!!href}
            autoFocus={autoFocus}
            className={className}
            disabled={disabled || loading}
            id={id}
            onClick={onClick}
            outline={outline}
            style={style}
            type={type}
            {...props}
            ref={ref}
        >
            {wrappedContent}
        </Component>
    );
}

export default forwardRef(Button);
