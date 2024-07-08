module.exports = {
    extends: ['@darajs/eslint-config'],
    parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: __dirname,
    },
};
