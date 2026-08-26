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

Because `@darajs/ai` and `@darajs/enterprise` are published to a private registry, every app using them needs registry auth for local development under the new model, where today auto-JS mode reads pre-bundled assets from the wheels and needs none. Internally this is already covered: developers have `@darajs:registry=...` in their user-level `~/.npmrc` and the internal `cli` tool manages the token, and Dara's managed pnpm honours the user-level `.npmrc` like any other pnpm. The `create-dara-app` template should still ship the registry route line (never a token) so that only the credential is left to the environment.

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

- if a Dara-owned dependency is missing, add it: runtime packages (`@darajs/*`) go to `dependencies`, build tools (`vite`, `@vitejs/plugin-react`, `@darajs/vite-plugin`) go to `devDependencies`, so a manifest that is also published as a library does not pick up bundler tooling as a runtime dependency
- if the user already specifies a compatible version, keep the user value
- if the user specifies a `workspace:`, `link:` or `file:` specifier for a Dara-owned dependency, treat it as compatible by definition and keep it; Dara validates the resolved package's version after install instead of the specifier
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

#### Apps that are also published libraries

Some Dara apps publish their custom JS as an npm package so that other Dara apps can consume the same components by `js_module` (in the system-s monorepo, `packages/dara-system-s` is both the app and `@darajs/system-s`, consumed by the benchmarks UI). In that layout the app root already has a `package.json` with `files`/`main`/`types` for the library, a `vite.config.ts` for the library build, and a `tsconfig.json` with `outDir: ./dist`. The defaults above collide with it in three places, so eject must not assume it owns those names:

- the Dara Vite config filename is configurable (for example `dara.vite.config.ts`) and `dara eject` refuses to overwrite an existing `vite.config.ts` rather than clobbering it
- `static_files_dir` should not be `dist/` when `dist/` is the library's build output; Dara warns when the configured output dir is also referenced by `package.json` `files`/`main`, and the docs recommend a separate output dir for this pattern
- consuming the library from a sibling app in the same monorepo should use `workspace:*` (see the merge rules and workspace mode), not a registry version that changes on every release

Once auto-JS is gone, such packages no longer need a UMD build, the `dara_assets` entrypoint, or the `cp dist/umd -> _assets/auto_js` step; they ship ESM plus types and nothing else.

### 8. Workspace Mode for Monorepos

An app that lives inside an existing pnpm workspace (a `pnpm-workspace.yaml` in a parent directory) must slot into that workspace rather than fight it. Isolating the app with `--ignore-workspace` would produce two lockfiles for one manifest and silently drop the repository's `pnpm-workspace.yaml` settings such as `minimumReleaseAge`, `allowBuilds` and `blockExoticSubdeps`, which are exactly the supply-chain controls a monorepo owner set on purpose.

Dara detects the workspace by walking up from the app root and then runs in workspace mode:

- the lockfile of record is the workspace root `pnpm-lock.yaml`; there is no app-level `pnpm-lock.yaml`
- `dara lock` and `dara build` invoke pnpm from the app root with the workspace's own configuration, so repository-level settings apply unchanged; `dara build` still uses `--frozen-lockfile`
- `dara.lock` hashes only the app's `importers:` entry in the root lockfile, so unrelated workspace packages changing does not invalidate it
- `.dara/` and the emitted output stay at the app root; `node_modules` lands wherever pnpm's workspace configuration puts it
- `workspace:*` references between the app and sibling packages are supported natively and do not require a publish before a build

Dara ships a default for `minimumReleaseAge` that excludes `@darajs/*`, otherwise a same-day Dara release is blocked from installing; a workspace that sets its own value overrides it.

If the workspace root `package.json` declares `packageManager: pnpm@<version>`, Dara uses that version rather than its own pin: it downloads the requested standalone pnpm binary into the Dara toolchain cache, verifying against the `+sha512.<hash>` integrity suffix when the field includes one and warning when it does not. Dara runs pnpm with `manage-package-manager-versions=false` so pnpm never downloads a second copy of itself outside the Dara cache. Outside a workspace, or when the field is absent, Dara's pinned pnpm is used.

## Commands

| Command | Responsibilities |
| --- | --- |
| `dara lock` | Discover required Dara JS dependencies, refresh `.dara/generated/*`, update the root `package.json` Dara-owned projection, install/update JS dependencies with Dara-managed pnpm, and write `pnpm-lock.yaml` plus `dara.lock`. |
| `dara dev` | Auto-bootstrap if lockfiles are missing locally; validate the Dara-managed toolchain and dependency surface; refresh `.dara/generated/*`; and run the development server. If Dara-managed state is stale, emit clear remediation and only rewrite files when that is the intended local-healing path. |
| `dara build` | Require valid checked-in `package.json`, `pnpm-lock.yaml`, and `dara.lock`; collect static folders and package static assets; run `pnpm install --frozen-lockfile`; and produce a self-contained output directory through the unified pipeline. Replaces the `dara-enterprise cache-build-config` / `collect-static` / `package` sequence used by the release action. |
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
- app directory nested inside an existing pnpm workspace: handled by workspace mode (section 8); the root `pnpm-lock.yaml` is the lockfile of record and no app-level lockfile is written
- app whose custom JS is also a published npm library: handled as described in section 7; eject does not overwrite the existing `vite.config.ts` and the docs recommend a `static_files_dir` other than the library's `dist/`

### CLI and Environment Surface

The user-facing surface today is a set of flags on `dara start` plus environment variables read in `BuildConfig.from_env` and `rebuild_js`. The build itself is a side effect of starting the server. The redesign separates building from serving, so every existing entry point needs an explicit fate:

| Today | New model |
| --- | --- |
| `dara start` (no flags, auto-JS) | `dara start`: serves the bundle in `dist/`; if none exists locally, runs the managed build first (auto-bootstrap). Same pipeline as everything else. |
| `dara start --production` | `dara build` then `dara start`. `--production` becomes a no-op with a deprecation warning during the compatibility window, since there is only one pipeline. |
| `DARA_PRODUCTION_MODE`, `DARA_HMR_MODE`, `DARA_DOCKER_MODE`, `SKIP_JSBUILD` env vars set by the flags | Still set by the deprecated flags during the compatibility window. Downstream code reads them directly (system-s switches `static_files_dir` on `DARA_PRODUCTION_MODE`), and programmatic callers such as `dara_cli.main([...])` must get warnings, not errors. |
| `--config <module:config>` | Accepted by every new command (`dara lock`, `dara build`, `dara dev`, `dara eject`): they all import the app config to discover the package map, and apps with namespaced packages cannot rely on config auto-discovery. |
| `dara start --enable-hmr` + `dara dev` | Unchanged pairing: `dara start --enable-hmr` serves from the Vite dev server, `dara dev` runs it. Both validate the managed state instead of installing into `dist/`. |
| `dara start --docker` | `dara start` in a container where `dist/` was produced by `dara build` at image build time. `--docker` becomes an alias for "never build, fail if `dist/` is missing", which is also the behaviour when `DARA_DISABLE_TOOLCHAIN_DOWNLOAD=1` and nothing is cached. |
| `dara start --skip-jsbuild` / `SKIP_JSBUILD=TRUE` | Same meaning as `--docker`: serve what is there, never build. Fold the two into one flag. |
| `dara start --rebuild` / `DARA_JS_REBUILD=TRUE` | `dara build --force`. |
| `dara setup-custom-js` | Alias for `dara eject` during the compatibility window, then removed. |
| `dist/_build.json` build cache | Replaced by `dara.lock` plus `.dara/generated/*`; `dist/` holds emitted assets only. |
| `config.static_files_dir` | Still the emitted output directory (default `dist/`). `.dara/` is a fixed sibling of the app root, independent of this setting. |
| `dist/tsconfig.json` copied from `statics/` | Generated into `.dara/generated/` in managed mode and referenced by the plugin; `dara eject` copies it to the app root as a user-owned file. |

The `create-dara-app` template must be updated in the same release that ships `dara lock`: its `.gitignore` currently ignores `package-lock.json` and `yarn.lock` but neither `dist/` nor `.dara/`, and it needs to stop ignoring `pnpm-lock.yaml` if it ever did. The in-repo `packages/demo-app` already has a `dara.config.json` and a `js/` folder and is the dogfood target for the migration flow.

### Production Build Commands and the Release Action

Every production deployment goes through `dara-release-action`, which does not call `dara start`. It calls three `dara-enterprise` commands in sequence: `cache-build-config` (imports the app config, writes a `BuildCache` JSON), `collect-static` (copies static folders), and `package` (copies package assets, writes registry credentials into `<output>/.npmrc`, runs `bundle_js(copy_js=True)`, strips `node_modules`). The action then copies the output into the image as `/var/app/dist` and starts the app with `dara start --docker`. The action also supports staging a release-specific `dara.config.json` with `{{ version }}` substitution, which some repos use to pin their own published JS package to the release version.

Those commands are thin wrappers over the internals this redesign removes (`BuildCache`, `BuildConfig`, `BuildMode`, `JsConfig.from_file`, `bundle_js`, `migrate_package_assets`), and there is no longer a reason for them to live in `dara-enterprise`. The plan is to move the production build into `dara-core` as `dara build`, which already has to do the same work:

- `dara build --config <module:config> --output <dir>` imports the config, discovers the package map, validates `dara.lock`, collects static folders and package static assets, runs the frozen install, runs Vite, and leaves a self-contained output directory with no `node_modules` and no credentials in it
- `dara-enterprise cache-build-config` / `collect-static` / `package` become deprecated aliases that print the equivalent `dara build` invocation during the compatibility window, then are removed
- `dara-release-action` calls `dara build` instead of the three `dara-enterprise` commands; it needs neither `node` on the runner nor the `~/.npm` cache mount, and instead caches `DARA_TOOLCHAIN_CACHE_DIR` and the pnpm store
- registry auth is passed to the build as environment variables consumed by the checked-in `.npmrc` placeholders; the action stops writing `.npmrc` files and its bundle check looks for literal credential values rather than for the `.npmrc` filename
- the `dara-config-file` / `{{ version }}` staging has no equivalent and is dropped: rewriting a dependency version at release time is incompatible with a frozen lockfile, and the monorepo case it served is covered by `workspace:*` (section 8)

This makes `dara-enterprise` and `dara-release-action` two more consumers that ship in lockstep with the Enforce phase, alongside `dara-components`.

### Deprecated Internal Surfaces

Removing the auto-JS path orphans code that only that path consumed. None of it is documented for end users, but downstream Dara packages (`dara-components` and any other package publishing a `dara_assets` entrypoint) depend on it. It follows the same Compatibility / Warn / Enforce staging as everything else: keep the fields so existing packages and apps keep loading, turn them into no-ops that emit a deprecation warning when set, and remove them at Enforce once downstream packages have shipped updates.

| Surface | Compatibility / Warn | Enforce |
| --- | --- | --- |
| `ConfigurationBuilder.template_extra_js`, `add_package_tag_processor` / `package_tag_processors` | Kept. Only consumed by `build_autojs_template`, so once the auto-JS path is gone they have no effect; setting them logs a deprecation warning. | Removed. |
| `AssetManifest` (`autojs_assets`, `common_assets`, `tag_order`, `depends_on`, topo sort) and the `_assets/auto_js/` directory convention | Fields stay optional and the auto-JS parts are ignored; packages may keep shipping the UMD files. `common_assets` keeps being copied to `/static/<pkg>/` so the runtime URL loaders in `dara-components` keep working. | `autojs_assets`, `tag_order`, `depends_on` and the tag-emitting code removed; downstream packages drop the `cp -R dist/umd/. dara/core/_assets/auto_js/` step from their JS build scripts and stop shipping the UMDs. The static-file half is replaced by the package static assets mechanism below. |
| `BuildMode.AUTO_JS`, `_entry_autojs.template.tsx` | Kept as long as legacy-only projects are still served by the old pipeline (see Warn). | Removed. |
| `BuildConfig.npm_registry` / `npm_token` and the `.npmrc` template that wrote `_authToken` in plaintext into `dist/.npmrc` | Kept for the old pipeline; the new pipeline never reads them and never writes tokens into project files. Setting them while on the new pipeline warns and points at a root `.npmrc`. | Removed. This also closes the case where a Docker image that copies `dist/` ships the token in a layer. |

### Package Static Assets and Vendored Libraries

The `dara_assets` manifest system exists because auto-JS mode could not bundle anything: every third-party library had to be a `<script>` tag or a file loaded by URL at runtime. Most of the machinery (`tag_order`, `depends_on`, topo sort, `build_common_tags`, `build_autojs_template`) only sequences script tags for a bundler-less page and goes away with the auto-JS path.

What does not go away automatically is the set of vendored libraries in `dara-components/_assets/common/`: BokehJS (versioned to match the installed Python `bokeh`), Pixi and its plugins, and Plotly. They are loaded by URL from `/static/dara.components/...` at runtime (`plotting/bokeh/bokeh.tsx`, `plotting/plotly/plotly.tsx`) because bundling Pixi and Bokeh caused problems in the previous setup, not because URL loading was the preferred design. Together with the UMDs they account for most of the ~7.8 MB of assets in the `dara-components` wheel.

The plan is:

1. Attempt to bundle Bokeh, Pixi and Plotly as normal npm dependencies behind dynamic `import()` in the new Vite pipeline, so they become code-split chunks emitted by the same build as everything else. For Bokeh this means `dara lock` projects `@bokeh/bokehjs` at the installed Python `bokeh` version into `package.json`, using the same version-derivation used for `@darajs/*`. Test the result against the demo app's Bokeh, Plotly and causal graph pages. This is a spike with an uncertain outcome; the redesign does not depend on it succeeding.

   The earlier bundling problems were hit on old versions, so the spike should start by upgrading rather than retrying the same versions. Bokeh is pinned to exactly `3.1.1` (Python and `@bokeh/bokehjs`, released 2023) while upstream is several minors ahead and has reworked its JS packaging since. Pixi is a different case: `pixi.js` 8.5 is already a regular bundled dependency of `ui-causal-graph-editor` (not an external), and no loader in `dara-components/js` references the vendored `pixi*.js` files, so those are likely leftovers from an earlier setup and can probably be deleted without any bundling work. Plotly's vendored copy (`plotly.js` 2.28) is behind the `plotly` Python pin's contemporaries as well.
2. Regardless of the outcome, replace `AssetManifest` with a minimal mechanism for a package to contribute files to `/static/<pkg>/`: an entrypoint that returns a directory (or list of files) to copy into `static_files_dir` at build time, with no tag emission or ordering. This is the same capability `Configuration.static_folders` already gives apps, declared by a package instead. It stays as a permanent escape hatch for anything that genuinely cannot be bundled.
3. Depending on 1): if bundling works, `dara-components` stops shipping the vendored files and the static mechanism is unused by Dara's own packages; if it does not, the vendored files move over to the static mechanism unchanged and the existing URL loaders keep working.

Separately, `dara-core` ships `jquery.min.js` as a common asset and emits a `<script>` tag for it in `index.html`. Nothing in the Dara JS references it; it has been there since the initial commit and is believed to be an implicit dependency of BokehJS. Whether current BokehJS still needs it must be verified as part of the spike (load a Bokeh figure and a `DataTable` with the tag removed) before the tag is dropped.

### Warn

- Legacy-only projects still work.
- Dara emits a deprecation warning when `dara.config.json` is still the active source of truth.
- The warning points users to `dara lock` / `dara eject`.

### Enforce

- `dara.config.json` no longer participates in builds.
- `dara build` requires checked-in `package.json`, `pnpm-lock.yaml`, and `dara.lock`.
- the old UMD / auto-JS path and the deprecated internal surfaces listed above are removed.
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
- Should ejected source/config files live directly at the app root by default, or should `dara eject` offer a configurable source directory while keeping `package.json` and `pnpm-lock.yaml` at the root? The app-as-library case in section 7 argues for at least the Vite config filename and the output directory being configurable.
- Can Bokeh, Pixi and Plotly be bundled as npm dependencies behind dynamic imports in the new pipeline, or do they stay as vendored files served via the package static assets mechanism?
- Is the jQuery `<script>` tag still required by BokehJS, or can it be dropped?

## Recommended First Implementation Slice

1. Add Node resolution, exact version checks, checksum verification, atomic extraction with locking, and the global runtime cache.
2. Add the Dara-managed standalone pnpm binary in the global cache with a dedicated `PNPM_HOME` and store dir; replace `os.system` calls with `subprocess.run`.
3. Add `DARA_TOOLCHAIN_CACHE_DIR`, `DARA_DISABLE_TOOLCHAIN_DOWNLOAD`, `DARA_NODE_DOWNLOAD_URL`, and `DARA_PNPM_DOWNLOAD_URL` while keeping pinned version and checksum validation.
4. Introduce platform-independent `dara.lock` with exact Node and pnpm versions plus target artifact metadata.
5. Introduce root `package.json` / `pnpm-lock.yaml` generation through `dara lock`.
6. Make missing local lockfiles auto-bootstrap on first run.
7. Add explicit Dara-managed state checks with clear remediation in `dara dev`.
8. Switch `dara build` and CI to frozen installs; add workspace mode; make `dara build` the production build entrypoint, deprecate the `dara-enterprise` build commands, and point `dara-release-action` at it.
9. Add `@darajs/vite-plugin`.
10. Add `dara eject` and compatibility handling for `dara.config.json`.
11. Add the package static assets mechanism and spike bundling Bokeh/Pixi/Plotly via dynamic imports; verify whether the jQuery tag is still needed.
12. Remove the UMD / auto-JS path and the deprecated `AssetManifest` fields once the new pipeline is validated.
