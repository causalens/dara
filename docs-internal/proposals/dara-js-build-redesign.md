# Dara JS Build Redesign Proposal

Status: Draft

## Summary

Replace Dara's current generated `dist/` JS workspace, `dara.config.json`, machine-dependent Node setup, and UMD / auto-JS fallback mode with a single Dara-managed Node + pnpm-backed build pipeline.

The proposed model is:

- Dara uses one Dara-managed Node + pnpm toolchain for all apps.
- Every app checks in `package.json`, `pnpm-lock.yaml`, and a platform-independent `dara.lock`.
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
- Preserve a zero-setup path for apps with no custom JS.
- Keep the JS ownership model simple: `package.json`, `pnpm-lock.yaml`, and `dara.lock` are checked in; `.dara/`, `dist/`, and `node_modules/` are generated or installed state.

## Non-Goals

- Support every Node target from day one.
- Rework Dara's Python-side component/action registration APIs as part of this change.
- Automatically prune unrelated user dependencies from `package.json`.
- Support arbitrary package-manager lockfile formats in the new pipeline.

## Proposed Design

### 1. Pinned JS Runtime and Toolchain

Dara should be Node-first, with one Dara-managed pnpm version.

The key point is that Dara needs a full runtime/toolchain, not a narrower build helper. Even for the no-custom-JS path it still needs:

- a JS runtime
- a package manager
- a bundler / dev-server path

Dara should define one authoritative toolchain tuple:

- a supported Node range for the current Dara Python package version
- one pinned pnpm version

Dara should always resolve and run the Dara-managed toolchain from the global cache. The resolution path should be:

- cached Dara-managed Node runtime
- on-demand download into the global cache if missing

Initial managed targets can stay narrow:

- macOS arm64
- macOS x64
- Linux x64 (glibc)
- Linux arm64 (glibc)

The global cache avoids multiple Dara environments carrying duplicate copies of the same runtime. A reasonable layout is:

- `${XDG_CACHE_HOME:-~/.cache}/dara/node/<version>/<target>/...` on Linux/macOS
- the equivalent local app cache location on Windows

For pnpm, Dara should always invoke a Dara-managed install from the same cache. A simple implementation is:

- install pnpm into `${XDG_CACHE_HOME:-~/.cache}/dara/pnpm/<version>/...`
- set `PNPM_HOME` to that Dara-managed location when running Dara JS commands

That gives Dara:

- one cached copy per machine per Node version/target
- sharing across virtualenvs and multiple Dara installs
- predictable upgrades when Dara bumps the managed Node or pnpm version
- no coupling to whatever Node or pnpm happens to exist on the machine

To keep builds reproducible without causing cross-platform lockfile churn, `dara.lock` should record platform-independent tool versions, not the developer machine's resolved runtime target. For example, it can record:

- Node version
- pnpm version
- Dara version
- supported target set for that Dara release
- optional checksums or source URLs for each supported runtime target

At runtime, Dara resolves the current platform to one of the supported targets and fetches the matching cached artifact. A macOS developer and Linux CI should be able to use the same `dara.lock` as long as they are using the same Dara-managed Node and pnpm versions.

### 2. Checked-In Root JS Lock Surface

The default experience should keep the JavaScript project surface small and predictable.

Every app should have the same checked-in frontend lock surface at the app root:

- `package.json`
- `pnpm-lock.yaml`
- `dara.lock`

This is the first-class locked transitive JS dependency graph. The simple user guidance is:

- check in `package.json`, `pnpm-lock.yaml`, and `dara.lock`
- do not check in `.dara/`, `dist/`, or `node_modules/`
- run `dara lock` when Dara-managed frontend state needs to be refreshed

For non-ejected apps, Dara owns the Dara-managed parts of the root `package.json`, the full `pnpm-lock.yaml`, the generated entrypoint, and the default bundler config. Users should not need to run package-manager commands directly. This is the junior-friendly path:

- `dara dev` works from a Python app with no JS files
- missing lock state auto-bootstraps locally
- `dara lock` refreshes `package.json`, `pnpm-lock.yaml`, and `dara.lock` explicitly
- `dara build` and CI validate frozen managed state

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

Dara should only validate and constrain that narrow Dara-owned dependency surface. In ejected mode, regular user-owned dependencies should remain user-managed, so normal `pnpm add` / `pnpm remove` workflows keep working without Dara treating the whole manifest as its own.

State checks should stay explicit and actionable. In particular, Dara should detect and explain:

- missing Dara-managed dependencies
- incompatible versions of Dara-managed dependencies
- mismatches between the current Python Dara package version and Dara-owned JS dependencies
- lockfile drift for the Dara-managed dependency projection
- toolchain mismatch between the cached Dara-managed Node/pnpm pair and `dara.lock`

### 3. Checked-In Lock State

Each app should check in:

- `package.json`
- `pnpm-lock.yaml`
- `dara.lock`

`pnpm-lock.yaml` is the source of truth for the resolved transitive JS dependency graph. `dara.lock` should not try to duplicate pnpm's full lockfile format. Instead, it should capture Dara's own view of the frontend build state and tie that view to the package-manager lockfile.

`dara.lock` should capture Dara's own view of the frontend build state, for example:

- Dara version
- Node version
- pnpm version
- supported runtime targets or target artifact metadata
- JS ownership mode, either managed or ejected
- discovered Dara JS dependency projection
- local entrypoint mode/path
- hash of the relevant `package.json` Dara-owned projection
- hash of the relevant `pnpm-lock.yaml` state
- hash of Dara's generated projection data

The lock policy should be:

- missing lockfiles locally: auto-bootstrap
- local dev: validate Dara-managed state, refresh `.dara/generated/*`, and explain exactly when `package.json`, `pnpm-lock.yaml`, or `dara.lock` need to be rewritten
- local user-owned dependency changes outside Dara's managed surface in ejected mode: do not block dev
- CI and `dara build`: frozen install only, fail if stale

This keeps the local first-run experience smooth without weakening reproducibility for real builds. `dara build` and CI should always run `pnpm install --frozen-lockfile` against the checked-in root `pnpm-lock.yaml` and fail if `package.json`, `pnpm-lock.yaml`, or `dara.lock` are missing or stale.

### 4. One Build Pipeline

Dara should remove the current UMD / auto-JS delivery mode and always build the app through the same JS toolchain.

That means:

- no special non-custom-JS bundle path
- no generated `dist/package.json` workspace
- no symlink-based `node_modules` sharing
- no hidden dependency install during a production build outside the app's root JS workspace

Apps with no custom JS should still use the same pipeline; the only difference is that the generated entrypoint imports Dara-discovered packages and no user-defined custom exports.

### 5. Small Dara-Owned Generated Layer

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

### 6. Eject Uses a Stable Vite Plugin Boundary

Before `dara eject`, Dara should own the default bundler configuration so the no-custom-JS path stays zero-setup.

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
- enforcing required aliases or plugin ordering
- surfacing stale lock/generated-state errors with Dara-specific remediation

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
- If the new files exist, Dara prefers the new model.

The migration for `package_manager` should be deterministic:

- legacy `pnpm`: keep using pnpm and write the new root `pnpm-lock.yaml` plus `dara.lock`
- legacy `npm` or `yarn`: migrate once to Dara-managed pnpm when `dara lock` is first run, with a clear message that the JS lockfile format is changing

Existing app cases should be handled as follows:

- no custom local JS: create or update the root `package.json`, root `pnpm-lock.yaml`, and `dara.lock`
- root `package.json` already exists: preserve unrelated fields and merge only the Dara-owned projection
- custom local JS already exists: run the eject flow, preserving the current source layout where practical or generating a standard entrypoint that re-exports from the old location

### Warn

- Legacy-only projects still work.
- Dara emits a deprecation warning when `dara.config.json` is still the active source of truth.
- The warning points users to `dara lock` / `dara eject`.

### Enforce

- `dara.config.json` no longer participates in builds.
- `dara build` requires checked-in `package.json`, `pnpm-lock.yaml`, and `dara.lock`.
- the old UMD / auto-JS path is removed.

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

1. Add Node resolution, version checks, and the global runtime cache.
2. Add a Dara-managed pnpm install in the global cache, for example via a dedicated `PNPM_HOME`.
3. Introduce platform-independent `dara.lock` with exact Node and pnpm versions plus target artifact metadata.
4. Introduce root `package.json` / `pnpm-lock.yaml` generation through `dara lock`.
5. Make missing local lockfiles auto-bootstrap on first run.
6. Add explicit Dara-managed state checks with clear remediation in `dara dev`.
7. Switch `dara build` and CI to frozen installs.
8. Add `@darajs/vite-plugin`.
9. Add `dara eject` and compatibility handling for `dara.config.json`.
10. Remove the UMD / auto-JS path once the new pipeline is validated.
