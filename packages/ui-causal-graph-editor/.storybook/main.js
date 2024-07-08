const path = require('path');

module.exports = {
    stories: ['../src/**/*.stories.mdx', '../src/**/*.stories.@(js|jsx|ts|tsx)'],
    addons: [
        '@storybook/addon-links',
        '@storybook/addon-essentials',
        '@storybook/addon-a11y',
        '@storybook/addon-styling',
        'storybook-dark-mode',
    ],
    core: {
        builder: 'webpack5',
    },
    typescript: {
        reactDocgen: 'react-docgen-typescript-plugin',
    },
    // This needs to mirror the TS aliases in tsconfig.json
    webpackFinal: async (config) => {
        config.resolve.alias = {
            ...config.resolve.alias,
            '@shared': path.resolve(__dirname, '../src/shared'),
            '@types': path.resolve(__dirname, '../src/types'),
        };

        return config;
    },
};
