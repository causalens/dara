import Highlight, { Language, PrismTheme, defaultProps } from 'prism-react-renderer';
import duotoneDark from 'prism-react-renderer/themes/duotoneDark';
import duotoneLight from 'prism-react-renderer/themes/duotoneLight';

import { StyledComponentProps, Variable, injectCss, useComponentStyles, useVariable } from '@darajs/core';
import styled, { darkTheme, theme, useTheme } from '@darajs/styled-components';

enum CodeComponentThemes {
    DARK = 'dark',
    LIGHT = 'light',
}

interface CodeProps extends StyledComponentProps {
    className: string;
    code: string | Variable<string>;
    language: Language;
    theme?: CodeComponentThemes;
}

interface StyledPreProps {
    isLightTheme?: boolean;
}

const StyledPre = styled.pre<StyledPreProps>`
    min-width: fit-content;
    margin: 0;
    padding: 1rem;

    background-color: ${(props) => (props.isLightTheme ? theme.colors.blue1 : darkTheme.colors.blue1)} !important;
    border-radius: 0.25rem;
`;

const StyledCode = injectCss(StyledPre);

function Code(props: CodeProps): JSX.Element {
    const themeCtx = useTheme();
    const [rootStyle, css] = useComponentStyles(props);
    const [code] = useVariable(props.code);

    function getTheme(): PrismTheme {
        if (props.theme) {
            if (props.theme === CodeComponentThemes.LIGHT) {
                return duotoneLight;
            }
            return duotoneDark;
        }
        if (themeCtx.themeType === 'dark') {
            return duotoneDark;
        }
        return duotoneLight;
    }

    return (
        <Highlight {...defaultProps} code={code} language={props.language} theme={getTheme()}>
            {({ className, style, tokens, getLineProps, getTokenProps }) => (
                <StyledCode
                    $rawCss={css}
                    className={className}
                    isLightTheme={props.theme !== 'dark'}
                    style={{
                        ...rootStyle,
                        ...style,
                    }}
                >
                    {tokens.map((line, i) => (
                        <div {...getLineProps({ key: i, line })} key={i}>
                            {line.map((token, key) => (
                                <span {...getTokenProps({ key, token })} key={key} />
                            ))}
                        </div>
                    ))}
                </StyledCode>
            )}
        </Highlight>
    );
}

export default Code;
