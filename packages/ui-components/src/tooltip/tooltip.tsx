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
import Tippy from '@tippyjs/react/headless';
import * as React from 'react';
import { GetReferenceClientRect, Placement, followCursor as followCursorPlugin } from 'tippy.js';

import styled from '@darajs/styled-components';

interface StylingProp {
    $hidden: boolean;
    styling: 'default' | 'error';
}

const TooltipWrapper = styled.div<StylingProp>`
    position: relative;

    display: block;

    max-width: 15rem;
    padding: 0.75rem 1rem;

    word-break: break-word;

    border-radius: 0.25rem;

    transition: opacity 150ms ease-in-out;

    ${(props) => {
        if (!props.$hidden) {
            return `
            color: ${props.styling === 'default' ? props.theme.colors.grey5 : props.theme.colors.blue1};
            font-size: ${props.theme.font.size};
            border: 1px solid ${props.styling === 'default' ? props.theme.colors.grey5 : props.theme.colors.errorDown};

            background-color: ${props.styling === 'default' ? props.theme.colors.grey2 : props.theme.colors.error};
            `;
        }
    }};
`;

interface ArrowProps extends StylingProp {
    $hidden: boolean;
    placement: Placement;
}

const Arrow = styled.span<ArrowProps>`
    position: absolute;

    ${(props) => {
        switch (props.placement) {
            case 'top':
                return 'bottom: 3px; left: -3px !important;';
            case 'bottom':
                return 'top: -5px;';
            case 'left':
                return 'right: 3px;';
            case 'right':
                return 'left: -5px;';
            default:
                // Unsupported placement, hide the arrow
                return 'display: none;';
        }
    }}

    ${(props) => {
        if (props.$hidden) {
            return 'display: none;';
        }
    }}

    &::before {
        content: '';

        position: absolute;

        ${(props) => {
            switch (props.placement) {
                case 'top':
                case 'bottom':
                    return 'transform: rotate(45deg);';
                case 'left':
                    return 'transform: rotate(135deg);';
                case 'right':
                    return 'transform: rotate(-45deg);';
                default:
                    return 'display: none;';
            }
        }}

        width: 0.5rem;
        height: 0.5rem;

        background: ${(props) => {
            return props.styling === 'default' ? props.theme.colors.grey2 : props.theme.colors.error;
        }};
        ${(props) => {
            if (props.placement === 'top') {
                return `border-bottom: 1px solid ${
                    props.styling === 'default' ? props.theme.colors.grey5 : props.theme.colors.errorDown
                };
                        border-right: 1px solid ${
                            props.styling === 'default' ? props.theme.colors.grey5 : props.theme.colors.errorDown
                        };`;
            }
            return `border-top: 1px solid ${
                props.styling === 'default' ? props.theme.colors.grey5 : props.theme.colors.errorDown
            };
                        border-left: 1px solid ${
                            props.styling === 'default' ? props.theme.colors.grey5 : props.theme.colors.errorDown
                        };`;
        }}
    }
`;

export interface TooltipProps {
    /** The element to append the tooltip to, by default it gets appended to the body of the document  */
    appendTo?: Element | 'parent' | ((ref: Element) => Element);
    /** the children to attached the tooltip too */
    children?: React.ReactElement;
    /** Standard react className property */
    className?: string;
    /** The content to render in the tooltip, can be any react renderable content */
    content: React.ReactNode;
    /** Optional parameter to delay the appearance of the tooltip, defaults to 0 */
    delay?: number | [number | null, number | null];
    /** Optional parameter to determine whether the display of the tooltip is disabled or not */
    disabled?: boolean;
    /** Whether the tooltip should follow the mouse cursor; or control how it will be followed */
    followCursor?: boolean | 'horizontal' | 'vertical' | 'initial';
    /** Optional prop to use with a virtual element */
    getReferenceClientRect?: GetReferenceClientRect;
    /** Optional parameter to determine whether to hide the tooltip wrapper */
    hidden?: boolean;
    /** Optional parameter to determine if the tooltip should be shown even when the children are clicked, by default
     * it is true and hides the tooltip on clicking the children */
    hideOnClick?: boolean;
    /** Optional parameter to determine if the tooltip is interactive, i.e. it can be hovered over or clicked without
     * hiding */
    interactive?: boolean;
    /** Optional handler to define what happens when clicked outside the tooltip, to be used with controlled mode */
    onClickOutside?: (instance: any, event: Event) => void;
    /** Optional parameter to determine where to place the tooltip in the top or bottom of component */
    placement?: 'top' | 'bottom' | 'auto' | 'left' | 'right';
    /**
     * Standard react styling property
     */
    style?: React.CSSProperties;
    /** Optional parameter to determine the style preset, options are default and error */
    styling?: 'default' | 'error';
    /** Optional parameter that sets tooltip visibility to be in controlled mode */
    visible?: boolean;
}

/**
 * A tooltip component that can be wrapped around any other react component and attach a tooltip to it
 *
 * @param props the props for the tooltip component
 */
function Tooltip({
    appendTo = document.body,
    getReferenceClientRect,
    children,
    className,
    content,
    disabled,
    hideOnClick = true,
    interactive,
    visible,
    placement = 'auto',
    styling = 'default',
    followCursor = false,
    hidden = false,
    style,
    delay = 0,
    onClickOutside = () => false,
}: TooltipProps): JSX.Element {
    return (
        <Tippy
            appendTo={appendTo}
            arrow
            delay={delay}
            disabled={disabled}
            followCursor={followCursor}
            getReferenceClientRect={getReferenceClientRect}
            hideOnClick={visible !== undefined ? undefined : hideOnClick}
            interactive={interactive}
            onClickOutside={onClickOutside}
            placement={placement}
            plugins={[followCursorPlugin]}
            render={(attrs) => (
                <TooltipWrapper $hidden={hidden} className={className} style={style} styling={styling} {...attrs}>
                    {content}
                    <Arrow
                        $hidden={hidden}
                        data-popper-arrow=""
                        placement={attrs['data-placement']}
                        styling={styling}
                    />
                </TooltipWrapper>
            )}
            visible={visible}
            zIndex={9998}
        >
            {children}
        </Tippy>
    );
}

export default Tooltip;
