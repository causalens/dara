import { useMemo } from 'react';

import { type DefaultTheme, ThemeProvider as StyledThemeProvider, default as styled } from '@darajs/styled-components';

import { injectCss, useComponentStyles } from '@/shared';
import DynamicComponent from '@/shared/dynamic-component/dynamic-component';
import { useVariable } from '@/shared/interactivity';
import resolveTheme from '@/shared/utils/resolve-theme';
import type { ComponentInstance, StyledComponentProps, Variable } from '@/types';

interface ThemeProviderProps extends StyledComponentProps {
    theme: Variable<'light' | 'dark' | DefaultTheme> | 'light' | 'dark' | DefaultTheme;
    base_theme?: Variable<'light' | 'dark'> | 'light' | 'dark';
    children: ComponentInstance[];
}

const StyledDiv = injectCss(styled.div`
    /* empty */
`);

function ThemeProvider(props: ThemeProviderProps): JSX.Element {
    const [style, css] = useComponentStyles(props);
    const [mainTheme] = useVariable(props.theme);
    const [baseTheme] = useVariable(props.base_theme);
    const theme = useMemo(() => resolveTheme(mainTheme, baseTheme), [baseTheme, mainTheme]);

    return (
        <StyledThemeProvider theme={theme}>
            <StyledDiv style={{ fontSize: theme.font.size, ...style }} $rawCss={css}>
                {props.children.map((c) => (
                    <DynamicComponent component={c} key={c.uid} />
                ))}
            </StyledDiv>
        </StyledThemeProvider>
    );
}

export default ThemeProvider;
