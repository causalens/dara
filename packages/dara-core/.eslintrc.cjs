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
        // Disable some jest rules for the cypress tests
        {
            files: './cypress/**/*.ts',
            rules: {
                'jest/expect-expect': 'off',
                'jest/valid-expect': 'off',
            },
        },
    ],
};
