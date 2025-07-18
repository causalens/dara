import type { Preview } from '@storybook/react-vite';

import { ThemeProvider, theme } from '@darajs/styled-components';

import './index.css';

const preview: Preview = {
    parameters: {
        actions: { argTypesRegex: '^on.*' },
        controls: {
            matchers: {
                color: /(background|color)$/i,
                date: /Date$/,
            },
        },
    },
    decorators: [
        (Story) => (
            <ThemeProvider theme={theme}>
                <Story />
            </ThemeProvider>
        ),
    ],
};

export default preview;
