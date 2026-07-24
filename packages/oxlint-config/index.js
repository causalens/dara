import { defineConfig } from 'oxlint';

const config = defineConfig({
    categories: {
        correctness: 'error',
    },
    plugins: ['eslint', 'typescript', 'unicorn', 'oxc'],
    rules: {
        curly: ['error', 'all'],
        'no-param-reassign': ['error', { props: false }],
        'no-return-assign': 'error',
        'no-shadow': 'error',
        'no-unused-expressions': ['error', { allowTernary: true }],
        'no-unused-vars': ['error', { ignoreRestSiblings: true }],
        'no-use-before-define': 'error',
        radix: ['error', 'as-needed'],
        'typescript/prefer-includes': 'error',
        'typescript/prefer-nullish-coalescing': 'error',
        'typescript/switch-exhaustiveness-check': 'error',
    },
});

/**
 * Optional rules for projects that use React and JSX.
 */
export const reactConfig = defineConfig({
    plugins: ['react', 'jsx-a11y'],
    rules: {
        'jsx-a11y/anchor-is-valid': ['error', { components: [] }],
        'react/jsx-filename-extension': ['error', { extensions: ['.jsx', '.tsx'] }],
        'react/jsx-key': ['error', { checkFragmentShorthand: true }],
    },
});

/**
 * Root-only options that enable Oxlint's tsgo-backed rules and TypeScript
 * compiler diagnostics.
 *
 * Keep these options on the consuming root config because Oxlint does not
 * support these options in nested configs.
 */
export const typeAwareOptions = Object.freeze({
    typeAware: true,
    typeCheck: true,
});

export default config;
