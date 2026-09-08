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
