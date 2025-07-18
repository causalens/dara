module.exports = {
    extends: ['@darajs/eslint-config', 'plugin:storybook/recommended'],
    parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: __dirname,
    },
    rules: {
        'no-underscore-dangle': 'off',
        'max-classes-per-file': 'off',
        'no-useless-constructor': 'off',
        '@typescript-eslint/consistent-type-imports': 'error'
    }
};
