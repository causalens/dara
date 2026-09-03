import { defineConfig } from 'oxfmt';

export default defineConfig({
    printWidth: 120,
    semi: true,
    singleQuote: true,
    sortImports: {
        customGroups: [
            {
                elementNamePattern: ['@darajs/**'],
                groupName: 'darajs',
            },
            {
                elementNamePattern: ['@/**'],
                groupName: 'app-alias',
            },
            {
                elementNamePattern: ['@shared/**'],
                groupName: 'shared-alias',
            },
            {
                elementNamePattern: ['@types'],
                groupName: 'types-alias',
            },
        ],
        groups: [
            ['builtin', 'external', 'internal', 'subpath'],
            'darajs',
            'app-alias',
            'shared-alias',
            'types-alias',
            ['parent', 'sibling', 'index', 'style'],
            'unknown',
        ],
        newlinesBetween: true,
        sortSideEffects: false,
    },
    sortPackageJson: false,
    tabWidth: 4,
    trailingComma: 'es5',
    overrides: [
        {
            files: ['*.json'],
            options: {
                tabWidth: 2,
            },
        },
    ],
});
