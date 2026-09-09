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

`dara lock` and `dara dev` migrate supported legacy configuration and declarations before importing the application. An unresolved migration stops before applying source edits and reports the manual changes needed. `dara dev --frozen` reports required migration without applying it; backend-only debugging keeps its existing tool-free behavior. `dara migrate --check` remains available to inspect a diff, and `dara migrate` can explicitly apply a supported subset for review.

The Python planner calls the internal `dara-vite analyze-migration` operation for JavaScript analysis. It uses Vite's Oxc parser and module resolver and reads effective TypeScript configuration with `get-tsconfig`; it does not load application modules, Vite configuration or environment files. Analysis uses a matching installed plugin or provisions its exact release through pnpm's tool cache, without installing application dependencies. Node reports every inspected file and resolver directory so Python can reject concurrent changes before writing.

The plugin itself uses TypeScript 7 with strict checking and NodeNext modules. `pnpm --filter @darajs/vite-plugin build` emits Node ESM and declarations into `dist`; `pnpm --filter @darajs/vite-plugin test` compiles and runs the tests against that output. The exported `tsconfig.json` is the separate application preset.
