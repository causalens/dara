import React from 'react';
import { themes as sbThemes } from '@storybook/theming';
import { withThemeFromJSXProvider } from '@storybook/addon-styling';

import { ThemeProvider, darkTheme, theme } from '@darajs/styled-components';

import { DocsContainer } from './components/docs-container';

// Apply global styles, copied from CLDP Core, mostly to use same fonts
import './assets/index.css';

/**
 * Wraps stories with ThemeProvider and applies background color
 */
const providerFn = ({ theme, children }) => {
    return (
        <ThemeProvider theme={theme}>
            <div style={{ width: '100%', height: '100%', backgroundColor: theme.colors.background }}>
                {children}
            </div>
        </ThemeProvider>
    );
};

export const parameters = {
    /**
     * Sets addon/action to detect listeners which have the regex format, i.e. `onClick`
     */
    actions: { argTypesRegex: '^on[A-Z].*' },
    /**
     * Sets up color picker and datepicker for props matching the regexes
     */
    controls: {
        matchers: {
            color: /(background|color)$/i,
            date: /Date$/,
        },
    },
    /**
     * Sort stories/components alphabetically
     */
    options: {
        storySort: {
            method: 'alphabetical',
            locales: 'en-UK',
        },
    },
    /**
     * Setup light/dark storybook theme
     */
    darkMode: {
        current: 'dark',
        dark: sbThemes.dark,
        light: sbThemes.light,
    },
    /**
     * Use custom documentation container
     */
    docs: {
        container: DocsContainer,
    },
    layout: 'fullscreen',
};

export const decorators = [
    withThemeFromJSXProvider({
        themes: {
            light: theme,
            dark: darkTheme,
        },
        defaultTheme: 'light',
        Provider: providerFn,
    }),
];
