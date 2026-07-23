module.exports = {
    extends: ['@darajs/eslint-config'],
    parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: __dirname,
    },
    settings: {
        'import/resolver': {
            typescript: {
                project: './tsconfig.eslint.json',
            },
        },
    },
    overrides: [
        // Disable test-runner rules for the Cypress tests
        {
            files: './cypress/**/*.ts',
            rules: {
                '@vitest/expect-expect': 'off',
                '@vitest/valid-expect': 'off',
            },
        },
    ],
};
