// For a detailed explanation regarding each configuration property, visit:
// https://jestjs.io/docs/en/configuration.html
var ignoredModules = [
    'nanoid',
    'react-markdown',
    'devlop',
    'hast-util-to-jsx-runtime',
    'comma-separated-tokens',
    'estree-util-is-identifier-name',
    'hast-util-whitespace',
    'property-information',
    'unist-util-position',
    'space-separated-tokens',
    'vfile-message',
    'unist-util-stringify-position',
    'html-url-attributes',
    'remark-parse',
    'mdast-util-from-markdown',
    'mdast-util-to-string',
    'mdast-util-to-hast',
    'micromark',
    'decode-named-character-reference',
    'remark-rehype',
    'trim-lines',
    'unist-util-visit',
    'unist-util-is',
    'unified',
    'bail',
    'is-plain-obj',
    'trough',
    'vfile',
    'remark-gf',
    'mdast-util-gf',
    'ccount',
    'mdast-util-find-and-replace',
    'escape-string-regexp',
    'markdown-table',
    'mdast-util-to-markdown',
    'zwitch',
    'longest-streak',
    'jest-runtime',
    'mdast-util-phrasing',
];

module.exports = {
    // Automatically clear mock calls and instances between every test
    clearMocks: true,
    // The directory where Jest should output its coverage files
    coverageDirectory: 'coverage',
    // A map from regular expressions to module names or to arrays of module names that allow to stub out resources with a single module
    moduleNameMapper: {
        '\\.(css|less)$': '<rootDir>/node_modules/jest-css-modules',
        // see https://github.com/ai/nanoid/issues/363
        '^nanoid(/(.*)|$)': 'nanoid$1',
    },
    setupFilesAfterEnv: ['<rootDir>/src/jest-setup.ts'],
    testEnvironment: 'jest-environment-jsdom',
    // The glob patterns Jest uses to detect test files
    testMatch: ['**/__tests__/**/*.+(ts|tsx|js)', '**/?(*.)+(spec|test).+(ts|tsx|js)'],
    // A map from regular expressions to paths to transformers
    transform: {
        '\\.[jt]sx?$': 'babel-jest',
    },
    transformIgnorePatterns: [`node_modules/(?!(.pnpm/)?(${ignoredModules.join('|')})).*`],
};
