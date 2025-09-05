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
import {
    FloatingArrow,
    FloatingPortal,
    type Placement,
    type ReferenceType,
    arrow,
    autoPlacement,
    autoUpdate,
    flip,
    offset,
    shift,
    useClick,
    useDismiss,
    useFloating,
    useFocus,
    useHover,
    useInteractions,
    useMergeRefs,
    useRole,
} from '@floating-ui/react';
import * as React from 'react';
import { type Ref } from 'react';

import styled, { useTheme } from '@darajs/styled-components';

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
    getReferenceClientRect?: () => DOMRect;
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
    /** Optional id property */
    id?: string;
}

/**
 * A tooltip component that can be wrapped around any other react component and attach a tooltip to it
 *
 * @param props the props for the tooltip component
 */
function Tooltip({
    appendTo,
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
    const [isOpen, setIsOpen] = React.useState(false);
    const arrowRef = React.useRef(null);
    const theme = useTheme();

    // Handle delay prop (can be number or array)
    const delayValue = React.useMemo(() => {
        if (typeof delay === 'number') {
            return { open: delay, close: delay };
        }
        if (Array.isArray(delay)) {
            return { open: delay[0] || 0, close: delay[1] || 0 };
        }
        return { open: 0, close: 0 };
    }, [delay]);

    const middleware = React.useMemo(() => {
        const middlewares = [
            offset(8),
            placement === 'auto' ? autoPlacement() : flip(),
            shift({ padding: 8 }),
            arrow({ element: arrowRef }),
        ];

        return middlewares;
    }, [placement]);

    const { refs, floatingStyles, context } = useFloating({
        open: visible !== undefined ? visible : isOpen,
        onOpenChange: visible !== undefined ? undefined : setIsOpen,
        // Only specify placement if it's not 'auto' - let autoPlacement middleware handle 'auto'
        placement: placement === 'auto' ? undefined : (placement as Placement),
        middleware,
        whileElementsMounted: autoUpdate,
    });

    // Set up virtual element if getReferenceClientRect is provided
    const { setReference } = refs;
    React.useEffect(() => {
        if (getReferenceClientRect) {
            setReference({
                getBoundingClientRect: getReferenceClientRect,
            } as ReferenceType);
        }
    }, [getReferenceClientRect, setReference]);

    const hover = useHover(context, {
        enabled: visible === undefined && !disabled,
        delay: delayValue,
        move: followCursor !== false,
    });

    const focus = useFocus(context, {
        enabled: visible === undefined && !disabled,
    });

    const click = useClick(context, {
        enabled: visible === undefined && !disabled && !hideOnClick,
    });

    const dismiss = useDismiss(context, {
        enabled: !disabled,
        outsidePress: (event) => {
            if (onClickOutside) {
                onClickOutside(context, event as Event);
            }
            return true;
        },
    });

    const role = useRole(context, {
        role: 'tooltip',
    });

    const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, click, dismiss, role]);

    const isVisible = visible !== undefined ? visible : isOpen;

    // Always call useMergeRefs but conditionally use the result
    const childRef =
        children && typeof children === 'object' && 'ref' in children ? (children.ref as Ref<unknown>) : null;
    const mergedRef = useMergeRefs([refs.setReference, childRef]);

    // Clone children and add reference props
    const referenceElement =
        children ?
            React.cloneElement(
                children,
                getReferenceProps({
                    ref: mergedRef,
                    ...children.props,
                })
            )
        :   null;

    // Determine portal container
    const portalContainer = React.useMemo(() => {
        if (!appendTo) {
            return document.body;
        }
        if (appendTo === 'parent') {
            return undefined;
        }
        if (typeof appendTo === 'function') {
            const appendToFn = appendTo as (ref: Element) => Element;
            return appendToFn((refs.reference.current as Element) || document.body) as HTMLElement;
        }
        return appendTo as HTMLElement;
    }, [appendTo, refs.reference]);

    const tooltipContent =
        isVisible && !disabled && !hidden && content ?
            <div
                ref={refs.setFloating}
                style={{
                    ...floatingStyles,
                    zIndex: 9998,
                    ...(interactive && { pointerEvents: 'auto' }),
                }}
                {...getFloatingProps()}
            >
                <TooltipWrapper
                    id={id}
                    $hidden={false}
                    className={className}
                    style={style}
                    styling={styling}
                    data-placement={context.placement}
                >
                    {content}
                    <FloatingArrow
                        ref={arrowRef}
                        context={context}
                        width={12}
                        height={6}
                        tipRadius={2}
                        stroke={styling === 'default' ? theme.colors.grey5 : theme.colors.errorDown}
                        strokeWidth={1}
                        fill={styling === 'default' ? theme.colors.grey2 : theme.colors.error}
                    />
                </TooltipWrapper>
            </div>
        :   null;

    return (
        <>
            {referenceElement}
            {portalContainer ?
                <FloatingPortal root={portalContainer}>{tooltipContent}</FloatingPortal>
            :   tooltipContent}
        </>
    );
}

export default Tooltip;
