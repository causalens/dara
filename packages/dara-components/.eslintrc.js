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
