module.exports = {
    extends: ['@darajs/eslint-config'],
    parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: __dirname,
    },
    rules: {
        'no-underscore-dangle': 'off',
        'max-classes-per-file': 'off',
        'no-useless-constructor': 'off',
    }
};
