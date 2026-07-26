# @darajs/oxlint-config

Shared Oxlint configuration for Dara projects.

Create an `oxlint.config.ts` in the consuming project:

```ts
import daraConfig, { typeAwareOptions } from '@darajs/oxlint-config';
import { defineConfig } from 'oxlint';

export default defineConfig({
    extends: [daraConfig],
    options: typeAwareOptions,
});
```

`typeAwareOptions` enables both type-aware lint rules and TypeScript compiler
diagnostics, allowing Oxlint to replace separate lint and `tsc --noEmit`
commands. These options must be set by the consuming root config and require
`oxlint-tsgolint`. Oxlint currently marks compiler diagnostics via `typeCheck`
as experimental.

React projects can opt into the built-in React and JSX accessibility rules:

```ts
import daraConfig, { reactConfig, typeAwareOptions } from '@darajs/oxlint-config';
import { defineConfig } from 'oxlint';

export default defineConfig({
    extends: [daraConfig, reactConfig],
    options: typeAwareOptions,
});
```

Vitest projects can opt into Oxlint's built-in Vitest rules:

```ts
import daraConfig, { typeAwareOptions, vitestConfig } from '@darajs/oxlint-config';
import { defineConfig } from 'oxlint';

export default defineConfig({
    extends: [daraConfig, vitestConfig],
    options: typeAwareOptions,
});
```
