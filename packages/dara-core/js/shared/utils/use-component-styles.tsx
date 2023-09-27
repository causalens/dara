/* eslint-disable react-hooks/exhaustive-deps */

import { useContext, useMemo } from 'react';
import * as React from 'react';

import { useDeepCompare } from '@darajs/ui-utils';

import { default as DisplayCtx, DisplayCtxValue } from '@/shared/context/display-context';
import { StyledComponentProps } from '@/types';

interface FlexProps {
    flexBasis?: string;
    flexGrow?: string;
    flexShrink?: string;
}

/**
 * Type containing CSSProperties which extends to those that are missing React's defined list
 */
interface CustomCSSProperties extends React.CSSProperties {
    gap?: string;
}

/**
 * Sets the flex property of a component based on props passed to it
 *
 * @param props the props passed to the component
 * @param displayCtx the display context of the component, contains the parent layout context
 * @param useDisplayContext whether or not to consider width/height in conjunction with displayCtx for some components such as Modal, these do not care for the context of their parent
 */
function flexStyles(props: StyledComponentProps, displayCtx: DisplayCtxValue, useDisplayContext: boolean): FlexProps {
    let flexBasis = props.basis;
    let flexShrink = props.shrink;
    let flexGrow = props.grow;

    if (useDisplayContext) {
        // In a horizontal Stack setting the width should also set the flex-basis
        if (props.width && displayCtx.direction === 'horizontal') {
            flexBasis ??= props.width;
            flexShrink ??= '0';
            flexGrow ??= '0';
        }
        // In a vertical Stack setting the height should also set the flex-basis
        if (props.height && displayCtx.direction === 'vertical') {
            flexBasis ??= props.height;
            flexShrink ??= '0';
            flexGrow ??= '0';
        }
    }
    // If hug is set, then the flex-basis should be set to content
    // Otherwise we check if the parent is a component that has hug set to true, and its children should inherit
    if (props.hug || (props.hug !== false && displayCtx.hug)) {
        flexBasis ??= 'content';
        flexShrink ??= '1';
        flexGrow ??= '0';
    }
    return { flexBasis, flexGrow, flexShrink };
}

/**
 * Parse a raw_css property into styles and css
 *
 * @param rawCss raw css property to parse
 */
export function parseRawCss(rawCss: string | CustomCSSProperties): [rawStyles: CustomCSSProperties, rawCss: string] {
    const isRawObject = typeof rawCss === 'object' && rawCss !== null && rawCss !== undefined;

    const componentCss = !isRawObject && typeof rawCss === 'string' ? rawCss : '';
    const styles = isRawObject ? rawCss : {};

    return [styles, componentCss];
}

/**
 * Styling utility hook which takes in base styling props and raw_css
 * Outputs `style` and `css` properties to inject into the top-level component
 *
 * @param props props to get styles from
 * @param useDisplayContext whether or not to use the display context, for some components such as Modal, these do not care for the context of their parent
 */
export default function useComponentStyles(
    props: StyledComponentProps,
    useDisplayContext = true
): [CustomCSSProperties, string] {
    const [rawStyles, rawCss] = parseRawCss(props.raw_css);
    const displayCtx = useContext(DisplayCtx);
    const flexProps = flexStyles(props, displayCtx, useDisplayContext);
    const styles = useMemo(() => {
        const stylesObj = {
            backgroundColor: props.background,
            border: props.border,
            borderRadius: props.border_radius,
            color: props.color,
            fontFamily: props.font,
            fontSize: props.font_size,
            fontStyle: props.italic ? 'italic' : 'normal',
            fontWeight: props.bold ? 'bold' : 'normal',
            gap: props.gap,
            height: props.height,
            margin: props.margin,
            maxHeight: props.max_height,
            maxWidth: props.max_width,
            minHeight: props.min_height,
            minWidth: props.min_width,
            overflow: props.overflow,
            padding: props.padding,
            position: props.position,
            textDecoration: props.underline ? 'underline' : 'none',
            width: props.width,
            ...flexProps,
            ...rawStyles,
            ...(props.style ?? {}),
        };

        // Filter out null/undefined values so they don't end up accidentally overriding other style properties
        return Object.fromEntries(Object.entries(stylesObj).filter(([, v]) => v !== null && v !== undefined));
    }, [useDeepCompare(props)]);

    return [styles, rawCss];
}
