import { useContext, useMemo } from 'react';

import {
    DisplayCtx,
    type StyledComponentProps,
    type Variable,
    injectCss,
    useComponentStyles,
    useVariable,
} from '@darajs/core';
import { useTheme } from '@darajs/styled-components';

interface TextProps extends StyledComponentProps {
    bold: boolean;
    className: string;
    formatted?: boolean;
    italic: boolean;
    text: string | Variable<string>;
    underline: boolean;
}

const StyledSpan = injectCss('span');
const StyledTag = injectCss('div');

function Text(props: TextProps): JSX.Element {
    const [style, css] = useComponentStyles(props);
    const [text] = useVariable(props.text);
    const theme = useTheme();

    // Consume display context, return appropriate text element
    const display_ctx = useContext(DisplayCtx);

    // Add a default to the text color if it's not in a button or anchor
    const color =
        ['anchor', 'button'].includes(display_ctx.component ?? '') ? props.color : props.color || theme.colors.text;

    // In case an object is passed, just stringify it to display raw rather than crashing
    const displayText = useMemo(() => (typeof text === 'string' ? text.trimEnd() : JSON.stringify(text)), [text]);

    if (['anchor', 'paragraph'].includes(display_ctx.component ?? '')) {
        return (
            <StyledSpan
                id={props.id_}
                $rawCss={css}
                className={props.className}
                style={{
                    border: props?.border ?? 'none',
                    color,
                    fontStyle: props.italic ? 'italic' : undefined,
                    fontWeight: props.bold ? 'bold' : undefined,
                    marginRight: '0.1em',
                    textAlign: props.align as any,
                    textDecoration: props.underline ? 'underline' : undefined,
                    ...style,
                }}
            >
                {displayText}
            </StyledSpan>
        );
    }

    const tag = props.formatted ? 'pre' : 'div';
    return (
        <StyledTag
            id={props.id_}
            $rawCss={css}
            as={tag}
            className={props.className}
            style={{
                color,
                margin: '0',
                textAlign: props.align as any,
                ...style,
            }}
        >
            {displayText}
        </StyledTag>
    );
}

export default Text;
