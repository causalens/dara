# Published component packages

Apply the component and setup rules in [custom-javascript.md](custom-javascript.md) before preparing exports.

## Python and npm contracts

Every Python component/action declaration points to a public npm subpath with a default-export implementation. Preserve serialized Python identities. The Python distribution's installed version determines the npm requirement, so publish compatible Python and npm versions together.

A module registered through `config.add_module_dependency('my_python_package', '@example/widgets')` must export `./setup`. Place package initialization there, separate from component barrels.

Python wheels contain Python and genuine static assets. Remove UMD build/copy steps and generated `_assets/auto_js/` payloads. Retain the `dara_assets` entry point for real assets using `AssetManifest(base_path=..., static_assets=[StaticAsset(source='common', target='.')])`. Paths are relative to `base_path`; verify existing `/static/<python-module>/` URLs.

## Source and publication exports

A workspace checkout may expose source through `dara-source`, while the packed package exposes compiled output:

```json
{
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

Repeat this mapping for every public implementation and `./setup`. Keep source imports relative within the package. Wildcard source exports use a dedicated source directory. Externalize React and its runtime subpaths from library bundles, and emit declarations.

For a package that is also an app, use `vite.config.ts` / `tsconfig.json` for the app and `vite.lib.config.ts` / `tsconfig.lib.json` for publication. Keep app `dist/` and library `dist-lib/` outputs separate. Normal development consumes workspace source directly; production builds reachable workspace dependencies in pnpm order. Use `dara build --no-deps-build` only when the repository already builds them.

## Verify the actual package

Build and `pnpm pack` the library: pnpm applies `publishConfig.exports` to the packed manifest. Inspect its archive and install it in a clean consumer. Check that every Python `js_source` subpath and registered `./setup` resolves to shipped compiled files, even when the consumer enables `dara-source`. Type-check imports against shipped declarations, then render the affected components and invoke actions through the packed package. Verify the Python wheel contains its registered assets and no generated UMD payloads.
