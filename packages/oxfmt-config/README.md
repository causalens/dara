# @darajs/oxfmt-config

Shared Oxfmt configuration for Dara projects.

Create an `oxfmt.config.ts` in the consuming project:

```ts
export { default } from '@darajs/oxfmt-config';
```

To add project-specific options, import and spread the configuration. Arrays and nested option objects must be merged explicitly.

Oxfmt sorts import declarations into the configured groups, but currently preserves the order of named specifiers inside `{ ... }`.
