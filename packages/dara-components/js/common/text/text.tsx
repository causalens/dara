import { useContext } from 'react';

import { DisplayCtx, StyledComponentProps, Variable, injectCss, useComponentStyles, useVariable } from '@darajs/core';
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
    const color = ['anchor', 'button'].includes(display_ctx.component) ? props.color : props.color || theme.colors.text;

    if (['anchor', 'paragraph'].includes(display_ctx.component)) {
        return (
            <StyledSpan
                $rawCss={css}
                className={props.className}
                style={{
                    border: props?.border ?? 'none',
                    color,
                    fontStyle: props.italic ? 'italic' : 'normal',
                    fontWeight: props.bold ? 'bold' : 'normal',
                    marginRight: '0.1em',
                    textAlign: props.align,
                    textDecoration: props.underline ? 'underline' : '',
                    ...style,
                }}
            >
                {`${typeof text === 'string' ? text.trimEnd() : text} `}
            </StyledSpan>
        );
    }

    const tag = props.formatted ? 'pre' : 'div';
    return (
        <StyledTag
            $rawCss={css}
            as={tag}
            className={props.className}
            style={{
                color,
                margin: '0',
                textAlign: props.align,
                ...style,
            }}
        >
            {text}
        </StyledTag>
    );
}

export default Text;
