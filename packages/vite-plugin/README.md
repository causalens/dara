# @darajs/vite-plugin

Dara owns dependency preparation and Python application discovery. This package loads the app-root frontend project, generates direct imports, runs Vite and TypeScript, and publishes compiled artifacts.

Use `dara dev` to create missing project files and start development, `dara lock` to prepare without serving, `dara build` for a frozen production build, and `dara start` to serve that output without Node or pnpm. `dara check --json` reports shared diagnostics without repairing project files.

```ts
import dara from '@darajs/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({ plugins: [dara()] });
```

Dara includes React support and owns the entry, asset base, output and development endpoints. Other Vite plugins and aliases remain application configuration. Use `dara({ inputs: ['theme.json'], directories: ['generated'], environment: ['VITE_BRAND'] })` to declare additional inputs read by custom build plugins. The project TypeScript configuration extends `@darajs/vite-plugin/tsconfig.json`.

Node >=22.12 and pnpm 12 are required to prepare, check, develop or build. The Python and plugin versions must match. Generated artifacts include a private `.dara-build.json` marker that Python checks before serving; do not edit it or expose it as a static file.

For older applications, use the [dara-2-migration skill](https://github.com/causalens/dara/tree/master/skills/dara-2-migration) to update source declarations, setup, configuration references and scripts. Once the application loads, `dara lock` and `dara dev` copy understood legacy dependency settings into `package.json` and remove the converted `dara.config.json`. Unknown settings and dependency conflicts require manual resolution. Frozen development reports required conversion without applying it; backend-only debugging skips frontend preparation. Review `git diff`, then run `dara check` and `dara build`.

The plugin itself uses TypeScript 7 with strict checking and NodeNext modules. `pnpm --filter @darajs/vite-plugin build` emits Node ESM and declarations into `dist`; `pnpm --filter @darajs/vite-plugin test` compiles and runs the tests against that output. The exported `tsconfig.json` is the separate application preset.
