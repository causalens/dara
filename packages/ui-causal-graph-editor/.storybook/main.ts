import { URL, fileURLToPath } from 'node:url';
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
            '@types': fileURLToPath(new URL('../src/types.tsx', import.meta.url)),
            '@shared': fileURLToPath(new URL('../src/shared', import.meta.url)),
        };

        return config;
    },
};

export default config;
