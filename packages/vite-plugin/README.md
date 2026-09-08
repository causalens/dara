# @darajs/vite-plugin

Every Dara app has a visible Vite configuration:

```ts
import dara from '@darajs/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({ plugins: [dara()] });
```

Run `dara dev` from the app root. Python prepares dependencies and supplies the registered implementations, while Vite serves modules and HMR through Python's origin. The plugin also supplies the TypeScript preset and compiler checks. `dara check --json` is read-only; `dara build` uses frozen dependency inputs and publishes compiled output; `dara start` serves it without Node or pnpm.

Node >=22.12 and pnpm 12 are required to prepare, check, develop or build. The Python and plugin versions must match. Generated artifacts include a private `.dara-build.json` marker that Python checks before serving; do not edit it or expose it as a static file.

For older applications, use the [dara-2-migration skill](https://github.com/causalens/dara/tree/master/skills/dara-2-migration) to update source declarations, setup, configuration references and scripts. Once the application loads, `dara lock` and `dara dev` copy understood legacy dependency settings into `package.json` and remove the converted `dara.config.json`. Unknown settings and dependency conflicts require manual resolution. Frozen development reports required conversion without applying it; backend-only debugging skips frontend preparation. Review `git diff`, then run `dara check` and `dara build`.

The plugin itself uses TypeScript 7 with strict checking and NodeNext modules. `pnpm --filter @darajs/vite-plugin build` emits Node ESM and declarations into `dist`; `pnpm --filter @darajs/vite-plugin test` compiles and runs the tests against that output. The exported `tsconfig.json` is the separate application preset.
## Workspaces and published libraries

Apps share their workspace's pnpm catalog and lockfile. Each app keeps its private manifests and development state under its own `node_modules/.dara/`. Preparing one app retains catalog requirements used by the others. All apps must use the same Dara version; preparation checks known app Python environments and reports conflicts with both app paths. With a shared Python environment, use that environment for every app's lock/build command.

Use explicit component subpaths and a source condition in a library checkout:

```json
{
  "name": "@example/widgets",
  "exports": {
    "./gauge": {
      "dara-source": "./js/gauge.tsx",
      "types": "./dist-lib/gauge.d.ts",
      "default": "./dist-lib/gauge.js"
    }
  },
  "publishConfig": {
    "exports": {
      "./gauge": {
        "types": "./dist-lib/gauge.d.ts",
        "default": "./dist-lib/gauge.js"
      }
    }
  },
  "files": ["dist-lib"]
}
```

Python declares `js_source = '@example/widgets/gauge'` in both the library's own app and consuming apps. The self-reference resolves through the app's exports without creating a dependency on itself. Both Vite and TypeScript enable `dara-source`; source must compile under the app's settings and should use relative internal imports. Shared framework dependencies are deduplicated.

Development never builds sibling packages. A library exposes source or runs its own build/watch command. Production builds reachable workspace dependencies in pnpm order before checking and building the app. `dara build --no-deps-build` skips dependency scripts when the repository has already prepared the necessary outputs.

An app that also publishes a library keeps `vite.config.ts` and `tsconfig.json` for Dara, and uses `vite.lib.config.ts` and optionally `tsconfig.lib.json` for its library build. Choose separate outputs, such as `dist/` and `dist-lib/`; the loader rejects overlaps.

Keep React and all of its runtime subpaths external in the library bundle (for example, `external: (id) => /^react(?:\/|$)/.test(id)`). Emit declarations separately if the bundler does not generate them. Build the library and use `pnpm pack` or `pnpm publish`. pnpm applies `publishConfig.exports` to the packaged manifest, leaving the checkout untouched. Inspect and install the actual tarball in a clean app: with `dara-source` enabled, every public import must resolve to compiled output. Published packages must not retain source-only conditions. Supply an explicit `./setup` export if Python registers a module dependency, and keep bootstrap/setup imports independent of component barrels.

## Custom build inputs

Plugins that read files or environment values beyond Vite's module graph declare them on `dara()`:

```ts
dara({
  inputs: ['build/banner.txt'],
  directories: ['build/templates'],
  environment: ['VITE_PRODUCT_VARIANT'],
});
```

These declarations participate in the private build marker and freshness checks. Static files belong in `static/` or Python's static registrations. Dara owns the app entry, HTML, output publication, runtime URLs and development endpoints; other Vite settings remain available to the app.
