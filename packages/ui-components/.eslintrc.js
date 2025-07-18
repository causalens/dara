module.exports = {
    extends: ['@darajs/eslint-config', 'plugin:storybook/recommended'],
    parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: __dirname,
    },
};
