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
};
