# Dara JS Build Redesign Proposal

Status: Draft

## Summary

Replace Dara's current generated `dist/` JS workspace, `dara.config.json`, machine-dependent Node setup, and UMD / auto-JS fallback mode with a single Dara-managed Node + pnpm-backed build pipeline.

The proposed model is:

- Dara uses one Dara-managed Node + pnpm toolchain for all apps.
- Every app checks in root `package.json`, `pnpm-lock.yaml`, and a platform-independent `dara.lock`.
- Non-ejected apps have a Dara-owned root JS manifest and lockfile. Users check them in for reproducibility, but normally update them through `dara lock`.
- Ejected apps keep the same checked-in lockfile surface, but the root JS workspace becomes user-owned and can include custom source, scripts, dependencies, and Vite config.
- Missing local lockfiles auto-bootstrap on first run; local dev validates Dara-managed state with clear remediation; CI and `dara build` use frozen installs and fail if stale.
- `dara.config.json` is replaced by `dara eject` plus a staged migration path.
- UMD / auto-JS mode is removed so custom-JS and no-custom-JS apps use the same pipeline.

## Problems Today

- Dara generates a temporary JS workspace in `dist/` instead of using a stable managed or user-owned frontend workspace.
- Local custom JS is wired in through `dara.config.json`, symlinks, and generated `package.json` files.
- Production and non-production builds follow different paths because of the UMD / auto-JS split.
- Apps do not have a first-class locked transitive JS dependency graph, so builds can vary depending on what gets resolved at build time.
- Production builds currently depend on whatever Node setup happens to exist on the machine.

## Goals

- Remove the requirement for users to install a compatible Node version globally.
- Eliminate UMD / auto-JS mode and converge on one frontend build pipeline.
- Make frontend dependency resolution reproducible through checked-in lockfiles.
- Keep the app root as the user-facing project root.
- Preserve a zero-config path for apps with no custom JS.
- Keep the JS ownership model simple: `package.json`, `pnpm-lock.yaml`, and `dara.lock` are checked in at the root; `.dara/`, `dist/`, and `node_modules/` are generated or installed state.

## Non-Goals

- Support every Node target from day one.
- Rework Dara's Python-side component/action registration APIs as part of this change.
- Automatically prune unrelated user dependencies from `package.json`.
- Support arbitrary package-manager lockfile formats in the new pipeline.
- Keep a pip-only, no-download fallback for apps without custom JS. See the trade-off below.

## Accepted Trade-off: Zero-Config, Not Zero-Download

Today `dara start` with no flags serves pre-bundled UMDs shipped inside the Python wheels. That path needs no Node, no network beyond pip, and works on any OS. Removing it means the first run of any Dara app, including one with no custom JS, will:

- download the Dara-managed Node runtime and pnpm binary into the global cache
- run `pnpm install` against the npm registry for `@darajs/*`, Vite, React and their transitive dependencies

Consequences we are accepting deliberately:

- First run is slower and requires network access to Node, pnpm and npm artifact sources. Locked-down environments now need a Node/pnpm artifact mirror and an npm registry mirror in addition to a pip mirror. `DARA_NODE_DOWNLOAD_URL` / `DARA_PNPM_DOWNLOAD_URL` cover the first, a root `.npmrc` covers the second.
- Platforms without a managed Node target lose support entirely, since there is no longer a runtime-free mode. `win-x64` is therefore included in the initial target set even though Windows is not exercised in CI.
- Python wheels shrink materially: `dara-components` currently ships roughly 7.8 MB of UMD assets and `dara-core` roughly 1.4 MB, all of which go away.

The user-facing promise becomes "zero configuration": no files to write, no tools to install. It does not become "zero download". We are not adding a prebuilt fallback bundle to soften this, because the point of the redesign is fewer code paths, not a different second path.

## Proposed Design

### 1. Pinned JS Runtime and Toolchain

Dara should be Node-first, with one Dara-managed pnpm version.

This is a deliberate shift away from the earlier Bun-oriented option. Bun still has an attractive single-binary shape, but the expected size saving is not large enough to drive the architecture by itself, and pnpm's shared store should offset much of the install-speed difference for repeat builds. The main reason to consider Bun was avoiding conflicts with whatever Node version users happen to have installed; using a Dara-managed Node runtime solves that directly while keeping Dara on the mainstream Node/Vite ecosystem.

The cost is that Dara has to manage one more artifact: pnpm. That is acceptable because it is still Dara-managed state rather than user setup. Users should not need to install or select Node or pnpm themselves for normal Dara workflows.

The key point is that Dara needs a full runtime/toolchain, not a narrower build helper. Even for the no-custom-JS path it still needs:

- a JS runtime
- a package manager
- a bundler / dev-server path

Dara should define one authoritative toolchain tuple, baked into each `dara-core` Python release:

- one exact Node version
- one exact pnpm version, tracking the latest pnpm major at release time (v11 at the time of writing; v10+ blocks dependency lifecycle scripts by default, which matters for a tool that runs installs unattended on developer machines)

Exact pins, not ranges. A range would make `dara.lock` non-reproducible because two machines could legitimately resolve different runtimes.

Dara should always resolve and run the Dara-managed toolchain from the global cache. The resolution path should be:

- cached Dara-managed Node runtime
- on-demand download into the global cache if missing

Initial managed targets can stay narrow:

- macOS arm64
- macOS x64
- Linux x64 (glibc)
- Linux arm64 (glibc)
- Windows x64 (required because there is no longer a runtime-free mode; best-effort, not covered by CI)

The global cache avoids multiple Dara environments carrying duplicate copies of the same runtime. A reasonable layout is:

- `${XDG_CACHE_HOME:-~/.cache}/dara/node/<version>/<target>/...` on Linux/macOS
- `%LOCALAPPDATA%\dara\node\<version>\<target>\...` on Windows

Dara should allow the cache root to be overridden with `DARA_TOOLCHAIN_CACHE_DIR`. This is useful for CI cache actions and for build images that preseed the Dara-managed toolchain cache, without making Dara depend on whatever `node` or `pnpm` happens to be on `PATH`.

For pnpm, Dara should always invoke a Dara-managed binary from the same cache:

- download the standalone pnpm executable for the target (`pnpm-linux-x64`, `pnpm-macos-arm64`, `pnpm-win-x64.exe`, ...) from the pnpm GitHub release into `${XDG_CACHE_HOME:-~/.cache}/dara/pnpm/<version>/<target>/`
- do not install pnpm via `npm install -g pnpm` or corepack: those need Node first and cannot be pinned to a checksum the same way
- set `PNPM_HOME` and the pnpm store dir to Dara-managed locations when running Dara JS commands, so nothing leaks into or depends on a user-level pnpm setup

All toolchain and package-manager invocations must use `subprocess.run` with argument lists and an explicit environment, never `os.system` or shell strings, so paths with spaces and user-controlled values cannot be interpreted by a shell.

That gives Dara:

- one cached copy per machine per Node version/target
- sharing across virtualenvs and multiple Dara installs
- predictable upgrades when Dara bumps the managed Node or pnpm version
- no coupling to whatever Node or pnpm happens to exist on the machine

To keep builds reproducible without causing cross-platform lockfile churn, `dara.lock` should record platform-independent tool versions, not the developer machine's resolved runtime target. For example, it can record:

- exact Node version
- exact pnpm version
- Dara version
- supported target set for that Dara release
- SHA-256 of the artifact for each supported runtime target

At runtime, Dara resolves the current platform to one of the supported targets and fetches the matching cached artifact. A macOS developer and Linux CI should be able to use the same `dara.lock` as long as they are using the same Dara-managed Node and pnpm versions.

#### Download integrity

The authority for versions and checksums is the installed `dara-core` Python package, not `dara.lock`. Checksums are captured at Dara release time from the official signed `SHASUMS256.txt` for Node and the release checksums for pnpm, and shipped as static metadata inside the wheel. `dara.lock` records a copy of them so drift is detectable, but a `dara.lock` that disagrees with the package metadata is an error to fix with `dara lock`, never a value to trust. This matters because `dara.lock` lives in the app repository: if it were authoritative, a pull request to the app could swap a checksum and pair it with a download URL override in CI configuration.

Downloads must be verified and installed atomically:

- download to a temporary file inside the cache root, verify the SHA-256, extract into a temporary directory, then rename into `<version>/<target>/` in one step
- write a completion marker after the rename; a directory without a marker is treated as absent and re-fetched
- hold a file lock on the target directory during fetch so two Dara processes starting at once (two apps, or `dara start` plus `dara dev`) do not race
- respect standard proxy and CA environment variables (`HTTPS_PROXY`, `SSL_CERT_FILE`, `REQUESTS_CA_BUNDLE`), since the environments that need mirror overrides are also the ones with TLS-intercepting proxies

The default download sources should be the public official Node and pnpm artifact locations. Dara should also expose narrow environment variable overrides for locked-down environments that mirror those artifacts internally:

- `DARA_NODE_DOWNLOAD_URL`
- `DARA_PNPM_DOWNLOAD_URL`

Each is a URL template with `{version}` and `{target}` placeholders (a single fixed URL cannot serve a shared, platform-independent `dara.lock`). These variables override where Dara downloads the expected artifact from. They do not override the expected toolchain version or checksum, and a mirror that serves an artifact with a different hash fails hard.

By default, Dara can download missing managed toolchain artifacts on demand in both local and CI environments. CI users should cache `DARA_TOOLCHAIN_CACHE_DIR` or the default Dara cache path to avoid repeated downloads. For stricter build environments, Dara should also support `DARA_DISABLE_TOOLCHAIN_DOWNLOAD=1`; when set, Dara may only use already-cached managed artifacts and must fail with clear remediation if the expected Node or pnpm artifact is missing.

Dara should not use arbitrary pre-installed Node or pnpm as the normal CI escape hatch. Accepting whatever is already on `PATH` would reintroduce the machine-dependent behavior this redesign is trying to remove. If an organization wants no public downloads in CI, the canonical path is to preseed or restore the Dara toolchain cache, optionally using the artifact URL overrides above.

### 2. Package Registry and Auth Configuration

Dara should not add a new custom registry/auth surface to replace `dara.config.json`.

Package registry routing and authentication should use the standard npm/pnpm `.npmrc` model at the app root. This keeps Dara aligned with normal JS tooling and avoids making Dara responsible for storing or templating secrets.

For example:

```ini
@my-org:registry=https://npm.pkg.github.com/
//npm.pkg.github.com/:_authToken=${NPM_TOKEN}
```

Users can check in `.npmrc` files that contain registry routes and environment-variable placeholders. Actual tokens must come from the local shell, CI secrets, or the user's home `.npmrc`; Dara should never write token values into project files.

Dara should run its managed pnpm commands from the app root so standard `.npmrc` discovery works. If install fails because a private registry token is missing or invalid, Dara should surface a clear remediation that points at the relevant `.npmrc` entry and environment variable rather than introducing a Dara-specific registry setting.

The toolchain download overrides above are intentionally separate from `.npmrc`: `.npmrc` controls JS package registries, while `DARA_NODE_DOWNLOAD_URL` and `DARA_PNPM_DOWNLOAD_URL` control only Dara's managed Node and pnpm artifact downloads.

### 3. Checked-In Root JS Lock Surface

The default experience should keep the JavaScript project surface small and predictable.

Every app should have the same checked-in frontend lock surface at the app root:

- `package.json`
- `pnpm-lock.yaml`
- `dara.lock`

This is the first-class locked transitive JS dependency graph. The simple user guidance is:

- check in root `package.json`, `pnpm-lock.yaml`, and `dara.lock`
- do not check in `.dara/`, `dist/`, or `node_modules/`
- run `dara lock` when Dara-managed frontend state needs to be refreshed

For non-ejected apps, Dara owns the Dara-managed parts of the root `package.json`, the full `pnpm-lock.yaml`, the generated entrypoint, and the default bundler config. Users should not need to run package-manager commands directly. This is the junior-friendly path:

- `dara dev` works from a Python app with no JS files
- missing lock state auto-bootstraps locally and prints the root files that must be committed
- `dara lock` refreshes `package.json`, `pnpm-lock.yaml`, and `dara.lock` explicitly
- `dara build` and CI validate frozen managed state and fail with a direct `run dara lock and commit package.json, pnpm-lock.yaml, and dara.lock` remediation when required files are missing or stale

For ejected apps, the same root `package.json` and `pnpm-lock.yaml` become the normal user-owned JS workspace. Eject is the point where Dara tells the user it will attempt a narrow merge and hand over ownership of the JS project surface:

- existing scripts, workspaces, overrides, and user dependencies are preserved
- missing Dara-owned dependencies are added
- compatible user versions are kept
- incompatible Dara-owned dependency versions fail before writing, with exact remediation
- users can then add dependencies, scripts, Vite plugins, and source files using normal JS tooling

The root manifest is still the app's JS workspace in both modes. The difference is ownership:

- managed mode: Dara owns the Dara-managed JS surface; users normally update it through `dara lock`
- ejected mode: the user owns the JS workspace; Dara validates only the small Dara-required surface
- app root: still the Python-facing project root

The Dara-owned dependency projection should stay minimal in both modes, likely limited to:

- discovered `@darajs/*` runtime dependencies
- build-tool dependencies that Dara explicitly owns for the current Python Dara version, such as `vite`, `@vitejs/plugin-react`, and related Dara-required plugins
- React constraints only if Dara must enforce them

Merge rules should stay explicit:

- if a Dara-owned dependency is missing, add it
- if the user already specifies a compatible version, keep the user value
- if the user specifies an incompatible version, fail with a precise error
- do not remove user dependencies from `package.json` automatically

Dara should only validate and constrain that narrow Dara-owned dependency surface. In ejected mode, regular user-owned dependencies should remain user-managed, so normal `pnpm add` / `pnpm remove` workflows keep working without Dara treating the whole manifest as its own. After changing JS dependencies, ejected users must run `dara lock` to reconcile Dara's view of the JS workspace before `dara build` or CI. That explicit step is acceptable for advanced users and is still simpler than the current dual-environment model.

State checks should stay explicit and actionable. In particular, Dara should detect and explain:

- missing Dara-managed dependencies
- incompatible versions of Dara-managed dependencies
- mismatches between the current Python Dara package version and Dara-owned JS dependencies
- lockfile drift between the user-owned/ejected JS lockfile and `dara.lock`, with a direct `run dara lock` remediation
- toolchain mismatch between the cached Dara-managed Node/pnpm pair and `dara.lock`

### 4. Checked-In Lock State

Each app should check in:

- `package.json`
- `pnpm-lock.yaml`
- `dara.lock`

`pnpm-lock.yaml` is the source of truth for the resolved transitive JS dependency graph. `dara.lock` should not try to duplicate pnpm's full lockfile format. Instead, it should capture Dara's own view of the frontend build state and tie that view to the package-manager lockfile.

`dara.lock` should capture Dara's own view of the frontend build state, for example:

- Dara version
- exact Node version
- exact pnpm version
- supported runtime targets with artifact checksums
- JS ownership mode, either managed or ejected
- discovered Dara JS dependency projection
- local entrypoint mode/path
- hash of the relevant `package.json` Dara-owned projection
- hash of the relevant `pnpm-lock.yaml` state
- hash of Dara's generated projection data

The lock policy should be:

- missing lockfiles locally: auto-bootstrap
- local dev: validate Dara-managed state, refresh `.dara/generated/*`, and explain exactly when root `package.json`, `pnpm-lock.yaml`, or `dara.lock` need to be rewritten
- local user-owned dependency changes outside Dara's managed surface in ejected mode: do not rewrite automatically; require `dara lock` before reproducible Dara commands such as `dara build`
- CI and `dara build`: frozen install only, fail if stale

This keeps the local first-run experience smooth without weakening reproducibility for real builds. `dara build` and CI should always run `pnpm install --frozen-lockfile` against the checked-in root `pnpm-lock.yaml` and fail if `package.json`, `pnpm-lock.yaml`, or `dara.lock` are missing or stale.

Checking these files in is what makes the pipeline reproducible. Today `@darajs/*` versions are derived from the installed Python packages, but the transitive npm graph is resolved fresh on every build with no lockfile at all. Any option that generates the JS surface on the fly from the Python environment keeps that hole open; the checked-in `pnpm-lock.yaml` with integrity hashes is the fix, and it is the only reason the JS files exist in the repository at all.

Two practical consequences follow and should be documented for users:

- Upgrading a `dara-*` Python package now requires running `dara lock` and committing the three files, in every app including ones with no custom JS. `dara dev` detects the mismatch and says exactly this; `dara build` and CI fail on it.
- Dependency bots (Dependabot, Renovate) will discover the root `package.json` and try to bump `@darajs/*` independently of Python, which produces immediate drift failures. The `create-dara-app` template should ship bot configuration that ignores the `@darajs/*` and Dara-owned build-tool entries, and the docs should say that `dara lock` is the only supported writer of those entries.

### 5. One Build Pipeline

Dara should remove the current UMD / auto-JS delivery mode and always build the app through the same JS toolchain.

That means:

- no special non-custom-JS bundle path
- no generated `dist/package.json` workspace
- no symlink-based `node_modules` sharing
- no hidden dependency install during a production build outside the app's root JS workspace

Apps with no custom JS should still use the same pipeline; the only difference is that the generated entrypoint imports Dara-discovered packages and no user-defined custom exports.

### 6. Small Dara-Owned Generated Layer

Dara will still need a small generated layer, but it should stay limited to framework internals rather than becoming another user-owned JS project.

The intended directory boundary is:

- app root: Python-facing project files plus checked-in `package.json`, `pnpm-lock.yaml`, and `dara.lock`
- `.dara/generated/*`: Dara-owned metadata and generated glue
- ejected source/config files: user-owned source and build config created at the app root by default
- `dist/`: emitted build output only

Examples of things that can live under `.dara/generated/*`:

- generated importer map
- generated entry wiring
- generated dependency projection metadata

Examples of things that should not live under `.dara/`:

- user-owned source
- user-owned `package.json`
- user-owned package-manager lockfiles
- final emitted assets
- installed dependencies
- cache directories

This keeps machine-owned internals separate from both user-owned project files and real build output, instead of repeating the current pattern where `dist/` doubles as both a synthetic workspace and an output directory.

### 7. Eject Uses a Stable Vite Plugin Boundary

Before `dara eject`, Dara should own the default bundler configuration so the no-custom-JS path stays zero-config.

`dara eject` should warn before making the JS surface user-owned. The warning should say that Dara will attempt to merge its required dependencies into the existing root `package.json`, preserve unrelated user fields where possible, and fail before writing if the merge would require an incompatible Dara-managed dependency version.

After `dara eject`, the user should own the normal JS project surface:

- the local JS entrypoint
- the application source tree
- bundler configuration such as `vite.config.ts`
- the non-Dara parts of `package.json`
- any additional bundler plugins or project-specific build customizations

Dara should avoid making users manually copy framework-specific Vite configuration into their ejected config. Instead, Dara should expose a small Vite plugin, for example `@darajs/vite-plugin`, that owns the framework integration:

- importing generated Dara metadata
- wiring the generated entry layer
- the pieces of today's `vite.config.template.ts` that are framework contract rather than user preference: the `/__dara__/dev-server-info` middleware, the `renderBuiltUrl` hook that routes asset URLs through `window.__toDaraUrl`, the `/static/` dev `base`/`origin` handling, and `publicDir: false`
- the classic JSX runtime requirement (`jsxRuntime: 'classic'`), which today is only implied by the docs telling users to import React in every file; the plugin should either configure it or fail loudly if the user's `react()` plugin disagrees
- surfacing stale lock/generated-state errors with Dara-specific remediation

The plugin should use `enforce: 'pre'` rather than relying on array position so the example config keeps working regardless of where users place `dara()`. `@darajs/vite-plugin` is versioned in lockstep with `@darajs/core` and is part of the Dara-owned dependency projection.

An ejected `vite.config.ts` should be boring and stable, for example:

```ts
import { dara } from '@darajs/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [dara(), react()],
});
```

The plugin API becomes the compatibility boundary. `.dara/generated/*` can remain Dara-owned implementation detail as long as ejected projects import it only through the plugin or through documented generated modules with an explicit stability level.

In other words:

- eject means "user owns source and build config"
- it does not mean "user owns Dara's internal Vite integration"
- the Vite plugin is the stable contract between user config and Dara-generated metadata

## Commands

| Command | Responsibilities |
| --- | --- |
| `dara lock` | Discover required Dara JS dependencies, refresh `.dara/generated/*`, update the root `package.json` Dara-owned projection, install/update JS dependencies with Dara-managed pnpm, and write `pnpm-lock.yaml` plus `dara.lock`. |
| `dara dev` | Auto-bootstrap if lockfiles are missing locally; validate the Dara-managed toolchain and dependency surface; refresh `.dara/generated/*`; and run the development server. If Dara-managed state is stale, emit clear remediation and only rewrite files when that is the intended local-healing path. |
| `dara build` | Require valid checked-in `package.json`, `pnpm-lock.yaml`, and `dara.lock`; run `pnpm install --frozen-lockfile`; and produce the app bundle through the unified pipeline. |
| `dara eject` | Warn that the root JS surface is becoming user-owned, attempt the narrow `package.json` merge, create the standard user-owned local JS entrypoint and Vite config using the Dara Vite plugin, and fail before writing on incompatible Dara-managed dependency versions. `dara setup-custom-js` can remain as a compatibility alias for a migration period. |

## Migration

Migration should be staged rather than a flag day.

### Compatibility

- If `dara.config.json` is present, Dara reads it as migration input only.
- `extra_dependencies` are merged into the root `package.json` using the normal Dara-owned dependency merge rules.
- `package_manager` is used only as migration input.
- `local_entry` is used only to find or generate the user-owned JS entrypoint.
- package registry/auth configuration is not migrated into a new Dara setting; users should represent it with a root `.npmrc` and environment-provided secrets.
- If the new files exist, Dara prefers the new model.

The migration for `package_manager` should be deterministic:

- legacy `pnpm`: keep using pnpm and write the new root `pnpm-lock.yaml` plus `dara.lock`
- legacy `npm` or `yarn`: migrate once to Dara-managed pnpm when `dara lock` is first run, with a clear message that the JS lockfile format is changing

Existing app cases should be handled as follows:

- no custom local JS: create or update the root `package.json`, root `pnpm-lock.yaml`, and `dara.lock`
- root `package.json` already exists: preserve unrelated fields and merge only the Dara-owned projection
- custom local JS already exists: run the eject flow, preserving the current source layout where practical or generating a standard entrypoint that re-exports from the old location
- app directory nested inside an existing pnpm/yarn workspace: pnpm walks up to the nearest `pnpm-workspace.yaml`, so Dara must run its managed pnpm with `--ignore-workspace` (or the equivalent config) to keep the app's `node_modules` and lockfile at the app root. Participating in the outer workspace is a non-goal.

### CLI and Environment Surface

The user-facing surface today is a set of flags on `dara start` plus environment variables read in `BuildConfig.from_env` and `rebuild_js`. The build itself is a side effect of starting the server. The redesign separates building from serving, so every existing entry point needs an explicit fate:

| Today | New model |
| --- | --- |
| `dara start` (no flags, auto-JS) | `dara start`: serves the bundle in `dist/`; if none exists locally, runs the managed build first (auto-bootstrap). Same pipeline as everything else. |
| `dara start --production` | `dara build` then `dara start`. `--production` becomes a no-op with a deprecation warning during the compatibility window, since there is only one pipeline. |
| `dara start --enable-hmr` + `dara dev` | Unchanged pairing: `dara start --enable-hmr` serves from the Vite dev server, `dara dev` runs it. Both validate the managed state instead of installing into `dist/`. |
| `dara start --docker` | `dara start` in a container where `dist/` was produced by `dara build` at image build time. `--docker` becomes an alias for "never build, fail if `dist/` is missing", which is also the behaviour when `DARA_DISABLE_TOOLCHAIN_DOWNLOAD=1` and nothing is cached. |
| `dara start --skip-jsbuild` / `SKIP_JSBUILD=TRUE` | Same meaning as `--docker`: serve what is there, never build. Fold the two into one flag. |
| `dara start --rebuild` / `DARA_JS_REBUILD=TRUE` | `dara build --force`. |
| `dara setup-custom-js` | Alias for `dara eject` during the compatibility window, then removed. |
| `dist/_build.json` build cache | Replaced by `dara.lock` plus `.dara/generated/*`; `dist/` holds emitted assets only. |
| `config.static_files_dir` | Still the emitted output directory (default `dist/`). `.dara/` is a fixed sibling of the app root, independent of this setting. |
| `dist/tsconfig.json` copied from `statics/` | Generated into `.dara/generated/` in managed mode and referenced by the plugin; `dara eject` copies it to the app root as a user-owned file. |

The `create-dara-app` template must be updated in the same release that ships `dara lock`: its `.gitignore` currently ignores `package-lock.json` and `yarn.lock` but neither `dist/` nor `.dara/`, and it needs to stop ignoring `pnpm-lock.yaml` if it ever did. The in-repo `packages/demo-app` already has a `dara.config.json` and a `js/` folder and is the dogfood target for the migration flow.

### Removed Internal Surfaces

Removing the auto-JS path also removes code that only that path consumed. None of it is documented for end users, but downstream Dara packages (`dara-components` and any other package publishing a `dara_assets` entrypoint) depend on it and must be updated in lockstep:

- `ConfigurationBuilder.template_extra_js` and `add_package_tag_processor` / `package_tag_processors`: only feed `build_autojs_template`. Removed.
- `AssetManifest.autojs_assets` and the `_assets/auto_js/` directory convention: removed; `common_assets` (for example vendored jQuery) stays because the Vite path still emits those tags.
- `BuildMode.AUTO_JS`, `_entry_autojs.template.tsx`, and the `cp -R dist/umd/. dara/core/_assets/auto_js/` step in each package's JS build script: removed.
- `BuildConfig.npm_registry` / `npm_token` and the `.npmrc` template that wrote `_authToken` in plaintext into `dist/.npmrc`: removed in favour of the user-owned root `.npmrc` described above. This also closes the case where a Docker image that copies `dist/` ships the token in a layer.

### Warn

- Legacy-only projects still work.
- Dara emits a deprecation warning when `dara.config.json` is still the active source of truth.
- The warning points users to `dara lock` / `dara eject`.

### Enforce

- `dara.config.json` no longer participates in builds.
- `dara build` requires checked-in `package.json`, `pnpm-lock.yaml`, and `dara.lock`.
- the old UMD / auto-JS path and the internal surfaces listed above are removed.
- `--production`, `--skip-jsbuild`, `DARA_JS_REBUILD`, `SKIP_JSBUILD` and `dara setup-custom-js` are removed.

The Enforce phase is a breaking change for downstream packages and for any app still on `dara.config.json`, so it should land in a major release. Compatibility and Warn can ship in minor releases before it.

## Alternative Considered: Bun

Bun remains the main alternative to the Node-first design because one binary can cover runtime, package manager, and build execution.

The proposal is still Node-first because:

- Bun is not meaningfully smaller in a way that changes the packaging decision enough to outweigh compatibility risk.
- Node lowers migration risk for the current Vite/plugin ecosystem.
- a cached Dara-managed Node + pnpm toolchain gives reproducible behavior without depending on user machine state.

If the Node-based implementation proves more awkward than expected, Bun remains viable because the same cache-and-resolution design can support a managed Bun runtime as well.

## Open Questions

- How long should the compatibility window for `dara.config.json` last?
- Should ejected source/config files live directly at the app root by default, or should `dara eject` offer a configurable source directory while keeping `package.json` and `pnpm-lock.yaml` at the root?

## Recommended First Implementation Slice

1. Add Node resolution, exact version checks, checksum verification, atomic extraction with locking, and the global runtime cache.
2. Add the Dara-managed standalone pnpm binary in the global cache with a dedicated `PNPM_HOME` and store dir; replace `os.system` calls with `subprocess.run`.
3. Add `DARA_TOOLCHAIN_CACHE_DIR`, `DARA_DISABLE_TOOLCHAIN_DOWNLOAD`, `DARA_NODE_DOWNLOAD_URL`, and `DARA_PNPM_DOWNLOAD_URL` while keeping pinned version and checksum validation.
4. Introduce platform-independent `dara.lock` with exact Node and pnpm versions plus target artifact metadata.
5. Introduce root `package.json` / `pnpm-lock.yaml` generation through `dara lock`.
6. Make missing local lockfiles auto-bootstrap on first run.
7. Add explicit Dara-managed state checks with clear remediation in `dara dev`.
8. Switch `dara build` and CI to frozen installs.
9. Add `@darajs/vite-plugin`.
10. Add `dara eject` and compatibility handling for `dara.config.json`.
11. Remove the UMD / auto-JS path once the new pipeline is validated.
