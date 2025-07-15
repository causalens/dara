import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
    stories: ['../src/**/*.stories.@(js|jsx|ts|tsx|mdx)'],
    addons: [],
    framework: {
        name: '@storybook/react-vite',
        options: {},
    },
    viteFinal: async (config) => {
        // Ensure we can resolve the same modules as the main app
        config.resolve = config.resolve || {};
        config.resolve.alias = {
            ...config.resolve.alias,
            // Add any aliases from your main vite config if needed
        };

        return config;
    },
};

export default config;

