const path = require('path');

module.exports = {
    stories: ['../src/**/*.stories.mdx', '../src/**/*.stories.@(js|jsx|ts|tsx)'],
    addons: [
        '@storybook/addon-links',
        '@storybook/addon-essentials',
        '@storybook/addon-a11y',
        '@storybook/addon-styling',
        '@react-theming/storybook-addon',
        'storybook-dark-mode',
    ],
    core: {
        builder: 'webpack5',
    }
};
