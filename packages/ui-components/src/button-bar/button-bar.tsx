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
import { useCallback, useEffect, useState } from 'react';

import styled, { DefaultTheme } from '@darajs/styled-components';

import { BaseButton } from '../button/button';
import { InteractiveComponentProps, Item } from '../types';

interface ButtonBarWrapperProps {
    disabled?: boolean;
    styling: 'primary' | 'secondary';
}

const ButtonBarWrapper = styled.div<ButtonBarWrapperProps>`
    overflow: hidden;
    display: flex;
    flex: 1 1 auto;

    height: 2.5rem;

    border: 1px solid ${(props) => (props.disabled ? props.theme.colors.grey2 : props.theme.colors?.[props.styling])};
    border-radius: 0.25rem;

    button:not(:last-child) {
        border-right: 1px solid
            ${(props) => (props.disabled ? props.theme.colors.grey2 : props.theme.colors?.[props.styling])};
    }
`;

interface PrimaryButtonProps {
    selected: boolean;
}

// Prevents the enabled prop being added to the dom element
const shouldForwardProp = (prop: any): boolean => !['selected'].includes(prop);

/**
 * Gets style for default button
 *
 * @param buttonColor background color for button
 * @param disabled whether button is disabled
 * @param theme the current theme being used by the app
 */
function getButtonStyle(buttonColor: string, disabled: boolean, selected: boolean, theme: DefaultTheme): string {
    let color = buttonColor;
    let backgroundColor = 'transparent';
    if (selected) {
        color = theme.colors.background;
        backgroundColor = buttonColor;
    }
    if (disabled) {
        color = theme.colors.grey2;
        backgroundColor = theme.colors.blue1;
    }
    if (disabled && selected) {
        color = theme.colors.blue1;
        backgroundColor = theme.colors.grey2;
    }

    return `
    flex: 1 1 auto;

    margin: 0px;

    color: ${color};

    background-color: ${backgroundColor};
    border-radius: 0px;
    height: 100%;

    ${
        !selected &&
        (theme.themeType === 'dark' ?
            `
        :hover:not(:disabled) {
            background-color: ${transparentize(0.8, buttonColor)};
        }


        :active:not(:disabled) {
            background-color: ${transparentize(0.6, buttonColor)};
        }
    `
        :   `
        :hover:not(:disabled) {
            background-color: ${transparentize(0.9, buttonColor)};
        }


        :active:not(:disabled) {
            background-color: ${transparentize(0.8, buttonColor)};
        }
    `)
    }
    `;
}

const PrimaryButton = styled(BaseButton).withConfig({ shouldForwardProp })<PrimaryButtonProps>`
    ${(props) => getButtonStyle(props.theme.colors.primary, props.disabled, props.selected, props.theme)}
`;

const SecondaryButton = styled(BaseButton).withConfig({ shouldForwardProp })<PrimaryButtonProps>`
    ${(props) => getButtonStyle(props.theme.colors.secondary, props.disabled, props.selected, props.theme)}
`;

export interface ButtonProps extends InteractiveComponentProps<Item> {
    /** Component id */
    id?: string;
    /** The items to choose from */
    items: Array<Item>;
    /** Optional onClick handler, will be called when the button is pressed */
    onSelect?: (option: Item) => void | Promise<void>;
    /** The style of the button, accepts: primary, secondary. Defaults to primary */
    styling?: 'primary' | 'secondary';
}

/**
 * A button bar component that has radio group type behavior for selecting from different options
 *
 * @param {ButtonProps} props - the component props
 */
function ButtonBar({
    className,
    disabled,
    id,
    value,
    initialValue,
    items,
    onSelect,
    style,
    styling = 'primary',
}: ButtonProps): JSX.Element {
    const [selected, setSelected] = useState<Item>(value || initialValue || items[0]);

    const ButtonComponent = styling === 'secondary' ? SecondaryButton : PrimaryButton;

    const onClick = useCallback(
        (item: Item): void => {
            onSelect?.(item);
            if (value === undefined) {
                setSelected(item);
            }
        },
        [value, onSelect]
    );

    // Update selection based on value prop changes
    useEffect(() => {
        setSelected(value || initialValue || items[0]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    return (
        <ButtonBarWrapper className={className} disabled={disabled} style={style} styling={styling}>
            {items.map((item) => (
                <ButtonComponent
                    $hasAnchor={false}
                    aria-selected={selected.value === item.value}
                    disabled={disabled}
                    id={id}
                    key={`option-${String(item.value)}`}
                    onClick={() => onClick(item)}
                    selected={selected.value === item.value}
                    type="button"
                >
                    {item.label}
                </ButtonComponent>
            ))}
        </ButtonBarWrapper>
    );
}

export default ButtonBar;
