module.exports = {
    env: {
        browser: true,
        es2021: true,
    },
    extends: [
        'plugin:react/recommended',
        'airbnb',
        'airbnb/hooks',
        'plugin:jest/recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:@typescript-eslint/recommended-requiring-type-checking',
        'plugin:import/typescript',
        // disables conflicting formatting rules but doesn't run prettier itself
        'prettier',
    ],
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
    },
    plugins: ['react', '@typescript-eslint', 'react-hooks'],
    rules: {
        '@typescript-eslint/explicit-function-return-type': [
            'error',
            {
                allowExpressions: true,
                allowHigherOrderFunctions: true,
            },
        ],
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-floating-promises': 'off',
        '@typescript-eslint/no-misused-promises': 'off',

        '@typescript-eslint/no-shadow': ['error'],
        /** The no-unsafe rule disallow operations on `any` types */
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-enum-comparison': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',

        '@typescript-eslint/no-unused-expressions': ['error', { allowTernary: true }],
        '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
        '@typescript-eslint/no-use-before-define': ['error'],
        '@typescript-eslint/prefer-includes': 'error',
        /** This requires strictNulChecks which we're not using at the moment */
        '@typescript-eslint/prefer-nullish-coalescing': 'off',
        '@typescript-eslint/switch-exhaustiveness-check': 'error',

        '@typescript-eslint/unbound-method': 'off',

        // disable as all backend interaction points would need explicit disable comments
        camelcase: 'off',

        'consistent-return': 'off',

        // always require curly braces
        curly: ['error', 'all'],
        // We often use switch with i.e. reducer so default doesn't make sense
        'default-case': 'off',

        'import/extensions': [
            'error',
            'ignorePackages',
            {
                ts: 'never',
                tsx: 'never',
            },
        ],

        'import/no-extraneous-dependencies': [
            'error',
            // Allow devDependencies to be imported in test files
            { devDependencies: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx', '**/*.stories.tsx'] },
        ],

        'import/no-named-default': 'off',
        'import/prefer-default-export': 'off',
        'import/order': 'off',
        'sort-imports': 'off',
        'jsx-a11y/anchor-is-valid': ['error', { components: [] }],
        'no-continue': 'off',
        'no-inner-declarations': 'off',
        'no-param-reassign': ['error', { props: false }],

        'no-plusplus': 'off',
        // Copied from airbnb config - removed ForOf restriction due to generator inefficiencies when polyfilling as we're not concerned with polyfilling back to ES5 and further
        'no-restricted-syntax': [
            'error',
            {
                message:
                    'for..in loops iterate over the entire prototype chain, which is virtually never what you want. Use Object.{keys,values,entries}, and iterate over the resulting array.',
                selector: 'ForInStatement',
            },
            {
                message:
                    'Labels are a form of GOTO; using them makes code confusing and hard to maintain and understand.',
                selector: 'LabeledStatement',
            },
            {
                message:
                    '`with` is disallowed in strict mode because it makes code impossible to predict and optimize.',
                selector: 'WithStatement',
            },
        ],
        'no-return-assign': 'error',
        'no-shadow': 'off',
        'no-underscore-dangle': 'off',
        'no-unused-expressions': 'off',
        'no-use-before-define': 'off',

        radix: ['error', 'as-needed'],

        'react/destructuring-assignment': 'off',
        'react/jsx-filename-extension': ['error', { extensions: ['.jsx', '.tsx'] }],
        'react/jsx-key': ['error', { checkFragmentShorthand: true }],
        'react/jsx-no-bind': 'off',
        'react/jsx-props-no-spreading': 'off',
        'react/jsx-uses-react': 'off',
        'react/no-array-index-key': 'off',
        'react/prop-types': 'off',
        'react/react-in-jsx-scope': 'off',
        'react/require-default-props': 'off',

        'require-await': 'off',
        /** Previously added by prettier plugin */
        'arrow-body-style': [
            'off',
            'as-needed',
            {
                requireReturnForObjectLiteral: false,
            },
        ],
    },
    settings: {
        'import/internal-regex': '^@darajs/',
        'import/parsers': {
            '@typescript-eslint/parser': ['.ts', '.tsx', '.d.ts'],
        },
        'import/resolver': {
            typescript: {},
        },
        jest: {
            version: 27, // default to 27 so ESLint doesn't try to infer the version - Jest isn't always installed; can be easily overriden
        },
        react: {
            version: 'detect', // Tells eslint-plugin-react to automatically detect the version of React to use
        },
    },
};
