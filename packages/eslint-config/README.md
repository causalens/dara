# `@darajs/eslint-config`

Dara `ESLint` configuration

## Installation

To use the config you need to run the install command:

```bash
pnpm install -D @darajs/eslint-config
```

## Usage

Include a `tsconfig.eslint.json` file in your project root. It needs to have an `include` key to cover files that should be linted. This is required for `TypeScript`-specific lint rules to use the type information. As an example:

```json
{
    "extends": "./tsconfig.json",
    "include": ["./src/", "./tests/"],
    "exclude": [],
    "compilerOptions": {
        "rootDir": "."
    }
}
```

Include a `.eslintrc.js` file in your project with:

```javascript
module.exports = {
    extends: ['@darajs/eslint-config'],
    parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: __dirname,
    },
};
```
