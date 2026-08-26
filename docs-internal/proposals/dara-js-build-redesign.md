# Dara JS build redesign

Status: Draft

## Summary

Replace the generated `dist/` JS workspace, `dara.config.json`, the dependence on whatever Node is installed, and the UMD / auto-JS mode with one build pipeline that runs on a Dara-managed Node and pnpm.

The model:

- Dara downloads and caches one Node and one pnpm version and uses them for every app.
- Every app checks in `package.json`, `pnpm-lock.yaml` and a platform-independent `dara.lock` at its root.
- In an app without custom JS, Dara owns those files and users refresh them with `dara lock`.
- In an ejected app the same files become the user's JS project, with their own source, scripts, dependencies and Vite config.
- Missing lockfiles are created on first local run. `dara build` and CI install with a frozen lockfile and fail if anything is stale.
- `dara eject` replaces `dara.config.json`, with a staged migration.
- UMD / auto-JS mode goes away. Apps with and without custom JS build the same way.
- The app root stays the project root. `.dara/`, `dist/` and `node_modules/` are generated or installed and never checked in.

## Problems today

- Dara writes a throwaway JS workspace into `dist/` instead of using a stable one that either Dara or the user owns.
- Custom JS is wired in with `dara.config.json`, symlinks and a generated `package.json`.
- Production and non-production builds take different paths because of the UMD / auto-JS split.
- There is no lockfile for the transitive npm graph, so two builds of the same commit can resolve different packages.
- Production builds use whatever Node happens to be on the machine.

## Non-goals

- Every Node target on day one.
- Changes to the Python component and action registration APIs.
- Pruning unrelated user dependencies from `package.json`.
- Lockfile formats other than pnpm's.
- A pip-only, no-download fallback for apps without custom JS. See the trade-off below.

## Accepted trade-off: zero config, not zero download

Today `dara start` with no flags serves UMD bundles shipped inside the Python wheels. No Node, no network beyond pip, any OS. Removing that path means the first run of any Dara app, including one with no custom JS, downloads the managed Node and pnpm into the global cache and runs `pnpm install` for `@darajs/*`, Vite, React and their dependencies.

We are accepting this knowingly:

- First run is slower and needs network access to Node, pnpm and npm artifact sources. A locked-down environment now needs a Node/pnpm mirror and an npm registry mirror on top of a pip mirror. `DARA_NODE_DOWNLOAD_URL` and `DARA_PNPM_DOWNLOAD_URL` cover the first, a root `.npmrc` covers the second.
- A platform without a managed Node target loses support outright, because there is no runtime-free mode anymore. That is why `win-x64` is in the initial target list even though CI does not run on Windows.
- Wheels shrink. `dara-components` ships about 7.8 MB of UMD and vendored assets today, `dara-core` about 1.4 MB. Both go away.

The promise to users is "zero configuration": no files to write, no tools to install. It is not "zero download". We are not adding a prebuilt fallback bundle to soften this, because the point is fewer code paths, not a different second path.

## Design

### 1. Managed Node and pnpm

Each `dara-core` release bakes in one exact Node version and one exact pnpm version. pnpm tracks the latest major at release time, v11 as of writing. pnpm 10 and later block dependency lifecycle scripts by default, which matters for a tool that runs installs unattended on developer machines. Exact pins, not ranges. A range would let two machines resolve different runtimes from the same `dara.lock`.

Dara resolves the toolchain from the global cache and downloads it on demand if missing. Initial targets:

- macOS arm64
- macOS x64
- Linux x64 (glibc)
- Linux arm64 (glibc)
- Windows x64, best effort and not covered by CI

Cache layout:

- `${XDG_CACHE_HOME:-~/.cache}/dara/node/<version>/<target>/` on Linux and macOS
- `%LOCALAPPDATA%\dara\node\<version>\<target>\` on Windows

pnpm comes from the same cache. Dara downloads the standalone executable for the target (`pnpm-linux-x64`, `pnpm-macos-arm64`, `pnpm-win-x64.exe`) from the pnpm GitHub release into `.../dara/pnpm/<version>/<target>/`. Not `npm install -g pnpm`, not corepack. Both need Node first and neither can be pinned to a checksum the same way. Dara sets `PNPM_HOME` and the pnpm store directory to its own locations when it runs pnpm, so nothing depends on or leaks into a user-level pnpm setup.

Every toolchain and package-manager call uses `subprocess.run` with an argument list and an explicit environment. No `os.system`, no shell strings.

`dara.lock` records the pinned versions and the supported target set, not the resolved target of the machine that wrote it, so a macOS developer and Linux CI share one file without churn. At runtime Dara maps the current platform to a target and fetches that artifact. Section 3 lists everything `dara.lock` holds.

#### Download integrity

The installed `dara-core` package is the authority for versions and checksums, not `dara.lock`. Checksums are captured at Dara release time from Node's signed `SHASUMS256.txt` and pnpm's release checksums, and shipped as static metadata in the wheel. `dara.lock` keeps a copy so drift is visible, but a `dara.lock` that disagrees with the package is an error to fix with `dara lock`, never a value to trust. `dara.lock` lives in the app repository. If it were authoritative, a pull request to the app could swap a checksum and pair it with a download URL override in CI.

Downloads are verified and installed atomically. Download to a temporary file inside the cache root, verify the SHA-256, extract into a temporary directory, rename into `<version>/<target>/` in one step, then write a completion marker. A directory without a marker counts as absent and is fetched again. A file lock on the target directory stops two Dara processes (two apps, or `dara start` next to `dara dev`) from racing. Standard proxy and CA variables are honoured (`HTTPS_PROXY`, `SSL_CERT_FILE`, `REQUESTS_CA_BUNDLE`). The environments that need mirrors are the same ones with TLS-intercepting proxies.

#### Environment variables

- `DARA_TOOLCHAIN_CACHE_DIR` overrides the cache root. CI caches this path, or the default one, between runs. Build images can preseed it.
- `DARA_NODE_DOWNLOAD_URL` and `DARA_PNPM_DOWNLOAD_URL` are URL templates with `{version}` and `{target}` placeholders for environments that mirror the official artifacts. They change where Dara downloads from and nothing else. Version and checksum stay as pinned, and a mirror serving a different hash fails the build.
- `DARA_DISABLE_TOOLCHAIN_DOWNLOAD=1` restricts Dara to already-cached artifacts and fails with instructions if one is missing.

A pre-installed Node or pnpm on `PATH` is not an escape hatch, in CI or anywhere. Accepting it brings back the machine-dependent behaviour this redesign removes. An organisation that wants no public downloads in CI preseeds or restores the toolchain cache, using the URL overrides if needed.

### 2. Package registry and auth

Dara does not add a registry or auth setting to replace `dara.config.json`. Registry routing and authentication use the standard `.npmrc` at the app root:

```ini
@my-org:registry=https://npm.pkg.github.com/
//npm.pkg.github.com/:_authToken=${NPM_TOKEN}
```

Users check in `.npmrc` files with registry routes and environment-variable placeholders. Tokens come from the shell, CI secrets or the user's home `.npmrc`. Dara never writes a token into a project file. Dara runs pnpm from the app root so `.npmrc` discovery works, and when an install fails on a missing or invalid token the error names the `.npmrc` entry and the environment variable involved.

`@darajs/ai` and `@darajs/enterprise` live on a private registry, so any app using them needs registry auth for local development. Today auto-JS mode reads bundles from the wheels and needs none, so this is new. It is also a standard npm setup that organisations already have for other JS work, a `@darajs:registry=...` route and credential in the user-level `~/.npmrc` provisioned by whatever manages developer credentials. Dara's pnpm reads the user-level `.npmrc` like any other pnpm. The `create-dara-app` template ships the registry route line, never a token, so only the credential is left to the environment.

### 3. Checked-in files

Every app checks in three files at its root:

- `package.json`
- `pnpm-lock.yaml`
- `dara.lock`

and does not check in `.dara/`, `dist/` or `node_modules/`.

`pnpm-lock.yaml` is the resolved transitive dependency graph. `dara.lock` does not duplicate it. It records Dara's view of the build and ties it to the pnpm lockfile: Dara version, exact Node and pnpm versions, supported targets with checksums, ownership mode (managed or ejected), the discovered Dara dependency set, the local entrypoint path, and hashes of the Dara-owned part of `package.json`, of the relevant `pnpm-lock.yaml` state and of the generated files.

Checking these in is what makes the pipeline reproducible. Today `@darajs/*` versions come from the installed Python packages, but the transitive npm graph is resolved fresh on every build with no lockfile. Generating the JS files from the Python environment on the fly would keep that hole open. The checked-in `pnpm-lock.yaml` with integrity hashes is the fix, and it is the only reason these files exist in the repository at all.

Two consequences need documenting for users. Upgrading a `dara-*` Python package now means running `dara lock` and committing the three files, in every app including ones with no custom JS. `dara dev` detects the mismatch and says so. `dara build` and CI fail on it. And dependency bots will find the root `package.json` and try to bump `@darajs/*` on their own, which produces immediate drift failures. The `create-dara-app` template ships Dependabot and Renovate configuration that ignores `@darajs/*` and the Dara-owned build tools, and the docs say `dara lock` is the only supported writer of those entries.

In an app that has not ejected, Dara owns the Dara-managed entries in `package.json`, the whole `pnpm-lock.yaml`, the generated entrypoint and the bundler config. Users never run pnpm themselves. `dara dev` works from a Python app with no JS files, `dara lock` refreshes the three files, and the failure message from `dara build` is literally `run dara lock and commit package.json, pnpm-lock.yaml, and dara.lock`.

Whatever the mode, Dara detects and explains: missing Dara-managed dependencies, incompatible versions, a Python `dara-*` version that disagrees with the JS dependencies, drift between `pnpm-lock.yaml` and `dara.lock`, and a cached Node/pnpm that disagrees with `dara.lock`. Every one of these names the command that fixes it.

### 4. One pipeline and the generated layer

Every app builds through the same toolchain. An app with no custom JS differs in one way: its generated entrypoint imports the discovered Dara packages and nothing else.

Dara still needs a small generated layer, but it stays framework internals and does not become another user-owned project:

- App root: Python project files plus the three checked-in files.
- `.dara/generated/*`: Dara-owned metadata and glue, such as the importer map, the entry wiring and the dependency projection.
- Ejected source and config: user-owned, at the app root by default.
- `dist/`: emitted build output, nothing else.

`.dara/` never holds user source, a user `package.json`, lockfiles, emitted assets, installed dependencies or caches. That separation is the point. Today `dist/` is a synthetic workspace and an output directory at the same time.

### 5. Eject and the Vite plugin

Before eject, Dara owns the bundler config so the no-custom-JS path needs none.

`dara eject` warns before handing over. The warning says Dara will merge its required dependencies into the existing `package.json`, keep unrelated fields, and stop before writing if the merge would need an incompatible Dara-managed version. After eject the user owns the entrypoint, the source tree, `vite.config.ts`, the non-Dara parts of `package.json`, and any extra plugins or build customisation. `pnpm add` / `pnpm remove` work as usual. After changing JS dependencies the user runs `dara lock` so `dara.lock` matches again before `dara build` or CI. One explicit step, and still simpler than today's two-environment setup.

The Dara-owned entries in `package.json` stay small:

- discovered `@darajs/*` runtime dependencies
- build tools Dara pins for the current Python version: `vite`, `@vitejs/plugin-react`, `@darajs/vite-plugin`
- React constraints only if Dara has to enforce them

Merge rules, used by eject and by `dara lock` afterwards:

- A missing Dara-owned dependency is added. `@darajs/*` runtime packages go to `dependencies`, build tools to `devDependencies`, so a manifest that is also a published library does not gain bundler tooling as a runtime dependency.
- A user value that is compatible with Dara's version is kept.
- A `workspace:`, `link:` or `file:` specifier on a Dara-owned dependency is compatible by definition. Dara checks the resolved package's version after install instead of the specifier.
- An incompatible user version fails with a precise error before anything is written.
- User dependencies are never removed.

#### The plugin

Users should not copy framework-specific Vite config into their own file. A small plugin, `@darajs/vite-plugin`, owns the framework integration:

- importing the generated metadata and wiring the generated entry
- the parts of today's `vite.config.template.ts` that are framework contract rather than preference: the `/__dara__/dev-server-info` middleware, the `renderBuiltUrl` hook that routes asset URLs through `window.__toDaraUrl`, the `/static/` dev `base` and `origin` handling, and `publicDir: false`
- the classic JSX runtime (`jsxRuntime: 'classic'`). Today the docs imply it by telling users to import React in every file. The plugin either configures it or fails loudly when the user's `react()` plugin disagrees.
- stale lock and generated-state errors with the Dara command that fixes them

The plugin uses `enforce: 'pre'` so the example config works regardless of where `dara()` sits in the array. It is versioned in lockstep with `@darajs/core` and is one of the Dara-owned entries.

An ejected `vite.config.ts` looks like this and should stay looking like this:

```ts
import { dara } from '@darajs/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [dara(), react()],
});
```

The plugin API is the compatibility boundary. `.dara/generated/*` stays an implementation detail as long as ejected projects reach it only through the plugin or through generated modules with a documented stability level. Eject means the user owns source and build config. It does not mean the user owns Dara's Vite integration.

#### Apps that are also published libraries

Some apps publish their custom JS as an npm package so a sibling Dara app can use the same components by `js_module`. Think of a monorepo where one package is both a Dara app and a published `@scope/ui` library. Its root already has a `package.json` with `files`, `main` and `types`, a `vite.config.ts` for the library build, and a `tsconfig.json` with `outDir: ./dist`. The defaults above collide with that in three places, so eject must not assume it owns those names:

- The Dara Vite config filename is configurable, for example `dara.vite.config.ts`, and `dara eject` refuses to overwrite an existing `vite.config.ts`.
- `static_files_dir` should not be `dist/` when `dist/` is the library output. Dara warns when the configured output directory is also referenced by `files` or `main` in `package.json`, and the docs recommend a separate directory for this layout.
- A sibling app in the same monorepo depends on the library with `workspace:*`, not a registry version that changes on every release.

Once auto-JS is gone these packages drop their UMD build, their `dara_assets` entrypoint and the `cp dist/umd -> _assets/auto_js` step. They ship ESM and types.

### 6. Workspace mode for monorepos

An app inside an existing pnpm workspace (a `pnpm-workspace.yaml` in a parent directory) joins that workspace. Isolating it with `--ignore-workspace` would give one manifest two lockfiles and silently drop the workspace's `pnpm-workspace.yaml` settings, such as `minimumReleaseAge`, `allowBuilds` and `blockExoticSubdeps`. Those are supply-chain controls the monorepo owner set on purpose.

Dara finds the workspace by walking up from the app root and then:

- treats the workspace root `pnpm-lock.yaml` as the lockfile of record and writes no app-level one
- runs pnpm from the app root with the workspace's own configuration, still with `--frozen-lockfile` in `dara build`
- hashes only the app's `importers:` entry of the root lockfile into `dara.lock`, so changes to unrelated workspace packages do not invalidate it
- keeps `.dara/` and the emitted output at the app root and lets pnpm place `node_modules` as the workspace dictates
- supports `workspace:*` between the app and sibling packages without a publish before the build

Dara's default pnpm configuration excludes `@darajs/*` from `minimumReleaseAge`, otherwise a same-day Dara release cannot install. A workspace that sets its own value wins.

If the workspace root `package.json` declares `packageManager: pnpm@<version>`, Dara uses that version instead of its own pin. It downloads that standalone pnpm into the Dara toolchain cache, verifies it against the `+sha512.<hash>` suffix when present, and warns when the field has no hash. Dara runs pnpm with `manage-package-manager-versions=false` so pnpm does not download a second copy of itself outside the Dara cache. Outside a workspace, or without the field, Dara's own pin applies.

## Commands

All four accept `--config <module:config>`. They import the app config to discover the package map, and apps with namespaced packages cannot rely on auto-discovery.

| Command | What it does |
| --- | --- |
| `dara lock` | Discover the required Dara JS dependencies, refresh `.dara/generated/*`, apply the merge rules to `package.json`, install with the managed pnpm, write `pnpm-lock.yaml` and `dara.lock`. |
| `dara dev` | Create missing lockfiles locally and print which files to commit. Validate toolchain and dependencies, refresh `.dara/generated/*`, run the dev server. Never rewrites the checked-in files except on that first local bootstrap. |
| `dara build --output <dir>` | Require valid `package.json`, `pnpm-lock.yaml` and `dara.lock`. Collect static folders and package static assets. `pnpm install --frozen-lockfile`. Run Vite. Leave a self-contained output directory with no `node_modules` and no credentials in it. Used by CI and by the release action. |
| `dara eject` | Section 5. `dara setup-custom-js` stays as an alias for a migration period. |

## Migration

Staged, not a flag day. Compatibility and Warn ship in minor releases. Enforce breaks downstream packages and any app still on `dara.config.json`, so it lands in a major.

### Compatibility

- If `dara.config.json` is present, Dara reads it as migration input only, and prefers the new files when they exist.
- `extra_dependencies` merge into `package.json` under the merge rules.
- `package_manager`: legacy `pnpm` keeps pnpm and gets the new `pnpm-lock.yaml` plus `dara.lock`. Legacy `npm` or `yarn` moves to the managed pnpm the first time `dara lock` runs, with a message that the lockfile format is changing.
- `local_entry` is used only to find or generate the entrypoint.

Existing app shapes:

- No custom JS: create `package.json`, `pnpm-lock.yaml` and `dara.lock`.
- A `package.json` already at the root: merge rules.
- Custom JS already present: run the eject flow, keeping the current source layout where practical or generating an entrypoint that re-exports from the old location.
- Inside a pnpm workspace: section 6.
- Custom JS also published as a library: section 5.

### Warn

- Legacy-only projects still work.
- Dara warns when `dara.config.json` is still the source of truth and points at `dara lock` / `dara eject`.

### Enforce

- `dara.config.json` no longer participates in builds.
- `dara build` requires the three checked-in files.
- The UMD / auto-JS path and the deprecated internals listed below are removed.
- `--production`, `--skip-jsbuild`, `DARA_JS_REBUILD`, `SKIP_JSBUILD` and `dara setup-custom-js` are removed.

## What changes where

### CLI and environment

Today the user-facing interface is a set of flags on `dara start` plus environment variables read in `BuildConfig.from_env` and `rebuild_js`, and the build happens as a side effect of starting the server. The redesign separates building from serving, so each existing entry point needs a stated fate.

| Today | New model |
| --- | --- |
| `dara start` (no flags, auto-JS) | `dara start` serves the bundle in `dist/`. If there is none locally, it runs the managed build first. Same pipeline as everything else. |
| `dara start --production` | `dara build` then `dara start`. `--production` is a no-op with a deprecation warning during the compatibility window. There is only one pipeline. |
| `DARA_PRODUCTION_MODE`, `DARA_HMR_MODE`, `DARA_DOCKER_MODE`, `SKIP_JSBUILD` set by the flags | Still set by the deprecated flags during the compatibility window. Downstream apps read them directly, for example to switch `static_files_dir` on `DARA_PRODUCTION_MODE` and serve assets packaged in a wheel. Programmatic callers such as `dara_cli.main([...])` get warnings, not errors. |
| `dara start --enable-hmr` + `dara dev` | Same pairing. `dara start --enable-hmr` serves from the Vite dev server, `dara dev` runs it. Both validate managed state instead of installing into `dist/`. |
| `dara start --docker` | `dara start` in a container whose `dist/` came from `dara build` at image build time. `--docker` means "never build, fail if `dist/` is missing", which is also the behaviour under `DARA_DISABLE_TOOLCHAIN_DOWNLOAD=1` with an empty cache. |
| `dara start --skip-jsbuild` / `SKIP_JSBUILD=TRUE` | Same as `--docker`. Serve what is there, never build. The two fold into one flag. |
| `dara start --rebuild` / `DARA_JS_REBUILD=TRUE` | `dara build --force`. |
| `dara setup-custom-js` | Alias for `dara eject` during the compatibility window, then removed. |
| `dist/_build.json` | Replaced by `dara.lock` and `.dara/generated/*`. `dist/` holds emitted assets only. |
| `config.static_files_dir` | Still the output directory, default `dist/`. `.dara/` is a fixed sibling of the app root and does not follow this setting. |
| `dist/tsconfig.json` copied from `statics/` | Generated into `.dara/generated/` in managed mode and referenced by the plugin. `dara eject` copies it to the app root as a user-owned file. |

The `create-dara-app` template changes in the same release that ships `dara lock`. Its `.gitignore` ignores `package-lock.json` and `yarn.lock` but neither `dist/` nor `.dara/`. The in-repo `packages/demo-app` has a `dara.config.json` and a `js/` folder and is where the migration flow gets tested first.

### Production builds and the release action

Every production deployment goes through `dara-release-action`, which never calls `dara start`. It runs three `dara-enterprise` commands: `cache-build-config` imports the app config and writes a `BuildCache` JSON, `collect-static` copies static folders, and `package` copies package assets, writes registry credentials into `<output>/.npmrc`, runs `bundle_js(copy_js=True)` and strips `node_modules`. The action copies the output into the image as `/var/app/dist` and starts the app with `dara start --docker`.

Those commands are thin wrappers over the internals this redesign removes (`BuildCache`, `BuildConfig`, `BuildMode`, `JsConfig.from_file`, `bundle_js`, `migrate_package_assets`), and nothing about them needs to live in `dara-enterprise`. `dara build` in core does the same work, so:

- `dara-enterprise cache-build-config`, `collect-static` and `package` become deprecated aliases that print the equivalent `dara build` call, then go away.
- `dara-release-action` calls `dara build`. It no longer needs `node` on the runner or the `~/.npm` cache mount. It caches `DARA_TOOLCHAIN_CACHE_DIR` and the pnpm store instead.
- Registry auth reaches the build as environment variables read by the checked-in `.npmrc` placeholders. The action stops writing `.npmrc` files, and its bundle check looks for literal credential values instead of the `.npmrc` filename.
- The action's `dara-config-file` input, which staged a release-specific `dara.config.json` with `{{ version }}` substituted so a repository could pin its own published JS package to the release version, has no replacement. Rewriting a dependency version at release time cannot coexist with a frozen lockfile, and the monorepo case it served is covered by `workspace:*` (section 6).

So `dara-enterprise` and `dara-release-action` ship in lockstep with the Enforce phase, alongside `dara-components`.

### Deprecated internals

Removing the auto-JS path orphans code that only it used. None of it is documented for end users, but downstream Dara packages (`dara-components` and anything else with a `dara_assets` entrypoint) depend on it. It follows the same staging as the rest. Keep the fields so existing packages and apps still load, make them no-ops that warn when set, remove them at Enforce once downstream packages have shipped updates.

| Surface | Compatibility / Warn | Enforce |
| --- | --- | --- |
| `ConfigurationBuilder.template_extra_js`, `add_package_tag_processor` / `package_tag_processors` | Kept. Only `build_autojs_template` reads them, so they have no effect once auto-JS is gone. Setting them warns. | Removed. |
| `AssetManifest` (`autojs_assets`, `common_assets`, `tag_order`, `depends_on`, topo sort) and the `_assets/auto_js/` convention | Fields stay optional and the auto-JS parts are ignored. Packages may keep shipping the UMD files. `common_assets` still get copied to `/static/<pkg>/` so the runtime URL loaders in `dara-components` keep working. | `autojs_assets`, `tag_order`, `depends_on` and the tag-emitting code go. Downstream packages drop the `cp -R dist/umd/. dara/core/_assets/auto_js/` step and stop shipping UMDs. The static-file half is replaced by the package static assets mechanism below. |
| `BuildMode.AUTO_JS`, `_entry_autojs.template.tsx` | Kept while legacy-only projects still run on the old pipeline. | Removed. |
| `BuildConfig.npm_registry` / `npm_token` and the `.npmrc` template that wrote `_authToken` in plaintext into `dist/.npmrc` | Kept for the old pipeline. The new one never reads them and never writes tokens into project files. Setting them on the new pipeline warns and points at a root `.npmrc`. | Removed. This also closes the case where a Docker image that copies `dist/` ships the token in a layer. |

### Package static assets and vendored libraries

The `dara_assets` manifest exists because auto-JS mode could not bundle anything. Every third-party library had to be a `<script>` tag or a file fetched by URL at runtime. Most of the machinery (`tag_order`, `depends_on`, topo sort, `build_common_tags`, `build_autojs_template`) only orders script tags for a page without a bundler, and it goes with the auto-JS path.

What does not go on its own is the set of vendored libraries in `dara-components/_assets/common/`: BokehJS at the version of the installed Python `bokeh`, Pixi with its plugins, and Plotly. `plotting/bokeh/bokeh.tsx` and `plotting/plotly/plotly.tsx` load them by URL from `/static/dara.components/...`. That was a workaround for bundling problems with Pixi and Bokeh in the old setup, not a preference. Together with the UMDs they make up most of the 7.8 MB in the `dara-components` wheel.

The plan:

1. Try to bundle Bokeh, Pixi and Plotly as ordinary npm dependencies behind dynamic `import()`, so they become code-split chunks from the same build as everything else. For Bokeh, `dara lock` writes `@bokeh/bokehjs` at the installed Python `bokeh` version into `package.json`, using the same version derivation as `@darajs/*`. Test against the demo app's Bokeh, Plotly and causal graph pages. The outcome is uncertain and the redesign does not depend on it.

   Start by upgrading rather than retrying the same versions. The old bundling problems were hit on old releases. Bokeh is pinned to exactly `3.1.1` on both sides (2023), upstream is several minors ahead and has reworked its JS packaging since. Pixi may be a non-issue already. `pixi.js` 8.5 is a normal bundled dependency of `ui-causal-graph-editor`, not an external, and nothing in `dara-components/js` references the vendored `pixi*.js` files, so those look like leftovers that can be deleted without any bundling work. The vendored `plotly.js` 2.28 is behind as well.
2. Either way, replace `AssetManifest` with a minimal way for a package to contribute files to `/static/<pkg>/`: an entrypoint returning a directory or file list to copy into `static_files_dir` at build time, with no tag emission or ordering. This is what `Configuration.static_folders` already gives apps, declared by a package instead. It stays as a permanent escape hatch for anything that cannot be bundled.
3. Depending on step 1: if bundling works, `dara-components` stops shipping the vendored files and Dara's own packages do not use the static mechanism. If it does not, the vendored files move onto the static mechanism unchanged and the existing URL loaders keep working.

#### Lazy loading heavy components

Bundling Bokeh behind `import()` is one instance of something worth doing across the board. The generated entry already splits by package: `importers` maps each Python module to `() => import("@darajs/...")`, so a package's chunk is fetched the first time one of its components renders. Inside a package there is no splitting at all. `@darajs/components` re-exports everything from one `index.tsx`, so rendering a `Button` downloads the causal graph editor, the plotting wrappers and the code editor with it. Same for `@darajs/ai` and `@darajs/enterprise`.

The fix is cheap and needs no app-side work. A library exports its heavy components as `React.lazy(() => import('./causal-graph'))` at the boundary where the heavy dependency starts. Rollup follows dynamic imports through ESM dependencies, so the app's Vite build emits those as separate chunks with no extra config. `DynamicComponent` already wraps every rendered component in `Suspense` with the app's configured fallback (`shared/dynamic-component/dynamic-component.tsx`), and resolves the component as a plain export from the module, so a lazy export is indistinguishable from a normal one until it renders. The user's `fallback=` and `suspend_render` settings apply to the chunk fetch for free.

This only becomes possible with the redesign. Under UMD a library-level `import()` is inlined into the single bundle, which is why the runtime URL loaders exist. ESM-only libraries after the auto-JS removal keep `import()` intact through to the app build.

Start with the heaviest: the causal graph editor (Pixi), the plotting components (Plotly, Bokeh), the code and markdown editors, and the AI chat components. Two things to keep in mind. Actions are resolved from the same modules as plain functions, not through `Suspense`, so a heavy dependency inside an action is split with an `await import()` in the action body rather than `React.lazy`. And the package entry chunk is still fetched up front by the module preload, which is fine once it is mostly re-exports of lazy wrappers.

One loose end. `dara-core` ships `jquery.min.js` as a common asset and emits a `<script>` tag for it in `index.html`. Nothing in Dara's JS references it. It has been there since the initial commit and is believed to be an implicit BokehJS dependency. Whether current BokehJS still needs it gets checked in the spike, by loading a Bokeh figure and a `DataTable` with the tag removed, before the tag is dropped.

## Alternative considered: Bun

Bun was the earlier option. One binary covers runtime, package manager and bundler, and the main appeal was never clashing with whatever Node a user has installed.

We stay on Node because a Dara-managed Node solves the clash just as well, the size saving from Bun is not big enough to decide the architecture, pnpm's shared store recovers most of the install-speed gap on repeat builds, and the current Vite and plugin ecosystem keeps working without changes. The cost is one extra artifact to manage, pnpm, and that is Dara-managed state rather than user setup. If the Node implementation turns out more awkward than expected, the same cache-and-resolve design can manage a Bun runtime instead.

## Open questions

- How long should `dara.config.json` keep working?
- Should ejected source and config live at the app root by default, or should `dara eject` take a source directory while `package.json` and `pnpm-lock.yaml` stay at the root? The app-as-library case in section 5 argues for at least the Vite config filename and the output directory being configurable.
- Can Bokeh, Pixi and Plotly be bundled behind dynamic imports, or do they stay as vendored files on the package static assets mechanism?
- Does BokehJS still need the jQuery `<script>` tag?

## First implementation slice

1. Node resolution, exact version checks, checksum verification, atomic extraction with locking, and the global cache.
2. The standalone pnpm binary in the global cache with its own `PNPM_HOME` and store. Replace `os.system` with `subprocess.run`.
3. `DARA_TOOLCHAIN_CACHE_DIR`, `DARA_DISABLE_TOOLCHAIN_DOWNLOAD`, `DARA_NODE_DOWNLOAD_URL` and `DARA_PNPM_DOWNLOAD_URL`, keeping pinned version and checksum validation.
4. Platform-independent `dara.lock` with exact Node and pnpm versions and target artifact metadata.
5. `package.json` / `pnpm-lock.yaml` generation through `dara lock`.
6. Create missing lockfiles on first local run.
7. State checks in `dara dev` that name the fix.
8. Frozen installs in `dara build` and CI. Workspace mode. `dara build` as the production build entrypoint, `dara-enterprise` build commands deprecated, `dara-release-action` pointed at `dara build`.
9. `@darajs/vite-plugin`.
10. `dara eject` and `dara.config.json` compatibility.
11. The package static assets mechanism, the Bokeh/Pixi/Plotly bundling spike, and the jQuery check. Then `React.lazy` boundaries around the heaviest components in `@darajs/components`, `@darajs/ai` and `@darajs/enterprise`.
12. Remove the UMD / auto-JS path and the deprecated `AssetManifest` fields once the new pipeline is proven.
