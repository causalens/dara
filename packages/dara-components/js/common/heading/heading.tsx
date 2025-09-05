import { type StyledComponentProps, type Variable, injectCss, useComponentStyles, useVariable } from '@darajs/core';
import { useTheme } from '@darajs/styled-components';

interface HeadingProps extends StyledComponentProps {
    className: string;
    heading: string | Variable<string>;
    level: number;
}

const StyledTag = injectCss('h1');

const anchorName = (text: string): string => text.toLowerCase().replace(/\s+/g, '-');

function Heading(props: HeadingProps): JSX.Element {
    const theme = useTheme();
    const [style, css] = useComponentStyles(props);
    const [heading] = useVariable(props.heading);
    const tag = `h${props.level}` as keyof JSX.IntrinsicElements;
    return (
        <StyledTag
            $rawCss={css}
            as={tag}
            className={props.className}
            id={props.id_ ?? anchorName(heading)}
            style={{ color: theme.colors.text, textAlign: props.align as any, ...style }}
        >
            {heading}
        </StyledTag>
    );
}

export default Heading;
