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
    rules: {
        'import/order': [
            'error',
            {
                alphabetize: { order: 'asc' },
                groups: [['builtin', 'external'], 'internal', ['parent', 'sibling', 'index']],
                'newlines-between': 'always',
                pathGroups: [
                    {
                        pattern: '@/**',
                        group: 'internal',
                    },
                    {
                        group: 'internal',
                        pattern: '@darajs/**',
                        position: 'before',
                    },
                ],
            },
        ],
    },
};
