# Dara JS Build Redesign Proposal

Status: Draft

## Summary

Replace Dara's current generated `dist/` JS workspace, `dara.config.json`, Node requirement, and UMD fallback mode with a single Bun-backed build pipeline.

The new model is:

- Dara ships a pinned embedded Bun binary for a small supported target set.
- The app root owns a normal `package.json`.
- Dara adds only a minimal set of Dara-owned dependencies into that manifest.
- Dara writes and consumes checked-in `bun.lock` and `dara.lock`.
- Dara uses one build path for both "no custom JS" and "custom JS" apps.
- Dara auto-bootstraps missing lockfiles locally, then requires frozen lockfiles for builds.

This should remove the current hidden install/build behavior, avoid unpinned transitive JS dependencies, and make the app frontend setup feel like a regular project.

## Problems Today

The current system has a few awkward properties:

- Dara generates a temporary JS workspace in `dist/` rather than treating the app root as the real frontend workspace.
- Local custom JS is wired in through `dara.config.json`, symlinks, and generated `package.json` files.
- Production and non-production app builds follow different paths because of the UMD / auto-JS mode split.
- Apps effectively do not lock transitive JS dependencies in a first-class way, so build output can vary depending on what gets resolved at build time.
- Running production builds requires Node to be installed on the machine even for apps that do not have custom JS.

## Goals

- Remove the Node prerequisite for normal Dara usage.
- Eliminate UMD / auto-JS mode and converge on one frontend build pipeline.
- Make frontend dependency resolution reproducible through checked-in lockfiles.
- Keep the app root as the user-facing project root.
- Preserve a zero-setup path for apps with no custom JS.
- Keep the `package.json` ownership model simple enough that existing tooling keeps working.

## Non-Goals

- Support every Bun target from day one.
- Rework Dara's Python-side component/action registration APIs as part of this change.
- Automatically prune unrelated user dependencies from `package.json`.
- Introduce a nested JS workspace such as `js/package.json`.

## Proposed Design

### 1. Embedded Bun Toolchain

Dara should ship a pinned Bun binary for a small set of supported targets, initially:

- macOS arm64
- macOS x64
- Linux x64 (glibc)
- Linux arm64 (glibc)

On unsupported targets, Dara should fail early with a clear message and allow an explicit override such as `DARA_BUN_PATH=/path/to/bun`.

This Bun binary is used for:

- dependency installation
- lockfile generation
- build execution
- development server execution

The main reason to ship the full binary rather than a narrower helper is that once Dara supports a user-owned `package.json` and custom JS, it needs a real package manager + runtime + bundler anyway.

### 1a. Global Toolchain Cache

To avoid multiple Dara environments each carrying their own separate copy of the same Bun runtime, Dara should resolve the toolchain through a global per-version cache.

Suggested resolution order:

- explicit override such as `DARA_BUN_PATH`
- global cached pinned Bun for the required version and target
- bundled Bun from the current Dara install, if present
- on-demand download into the global cache

Suggested cache location:

- `${XDG_CACHE_HOME:-~/.cache}/dara/bun/<version>/<target>/bun` on Linux/macOS
- the equivalent local app cache location on Windows

This gives Dara:

- one cached copy per machine per Bun version/target
- sharing across multiple virtualenvs or Dara installs
- predictable upgrades when Dara bumps its pinned Bun version
- optional support for either bundled or downloaded initial acquisition without changing the steady-state runtime path

The cache manager should:

- download atomically via a temp path + rename
- verify checksum before activation
- set executable permissions
- coordinate concurrent fetches with a simple file lock

### 1b. Bun vs Node

The proposal currently leans toward Bun, but there is still a real toolchain choice to make.

Arguments for Bun:

- one self-contained binary that covers package management, runtime, and build execution
- native lockfile support that fits the `bun.lock` + `dara.lock` model cleanly
- likely smaller overall runtime footprint than vendoring a full Node distribution
- simpler user story than requiring Node plus a separate package manager

Arguments for Node:

- higher ecosystem compatibility and lower migration risk for existing tooling/plugins
- fewer surprises if Dara keeps using Vite and broader Node-oriented build tooling
- easier debugging for users already familiar with the standard Node ecosystem

A reasonable implementation strategy is:

- keep the proposal Bun-first
- explicitly treat Node as the fallback alternative if Bun compatibility proves too costly during implementation spikes
- keep the cache/distribution design generic enough that Dara could cache a pinned Node distribution instead of Bun if the decision changes

### 2. Root `package.json` Is User-Owned

The app root should contain the real `package.json`.

Dara should treat that file as user-owned and only merge in a small Dara-owned set of dependencies. Dara should avoid rewriting unrelated fields such as:

- `name`
- `scripts`
- `workspaces`
- `overrides`
- formatting or lint config
- unrelated dependencies

The intended feel is that the app remains a regular project and existing tooling can continue to use the root manifest.

### 3. Minimal Dara-Owned Dependency Merge

`dara lock` should project a minimal set of required dependencies into `package.json`, for example:

- discovered `@darajs/*` runtime dependencies
- a small set of build dependencies if Dara still relies on Vite
- any directly required React constraints if Dara must enforce them

Merge policy:

- If a Dara-owned dependency is missing, add it.
- If the user already specifies a compatible version, keep the user value.
- If the user specifies an incompatible version, fail with a precise error instead of silently rewriting.
- Do not remove dependencies from `package.json` automatically.
- Optional cleanup can be handled later by an explicit prune command if needed.

### 4. Checked-In `bun.lock` and `dara.lock`

The app root should contain:

- `package.json`
- `bun.lock`
- `dara.lock`

`bun.lock` remains the JS dependency lockfile.

`dara.lock` captures Dara's own view of the build state, for example:

- Dara version
- Bun version
- Bun target
- discovered Dara JS dependency projection
- local entrypoint mode/path
- a hash of Dara's generated projection data

The important distinction is that `bun.lock` locks the JS dependency graph, while `dara.lock` locks Dara's interpretation of how the app frontend should be assembled.

### 5. One Build Pipeline, No UMD Mode

Dara should remove the current UMD / auto-JS delivery mode and always build the app through the same JS toolchain.

That means:

- no special non-custom-JS bundle path
- no generated `dist/package.json` workspace
- no symlink-based `node_modules` sharing
- no hidden dependency install during a production build outside the real app workspace

Apps with no custom JS should still use the same pipeline; the only difference is that the generated entrypoint imports Dara-discovered packages and no user-defined custom exports.

### 6. Small Dara-Generated Internal Layer

Dara will still need a generated layer for things such as importer maps and generated entrypoints.

That should live in a clearly Dara-owned internal folder, for example:

- `.dara/generated/importers.ts`
- `.dara/generated/entry.tsx`
- `.dara/generated/vite.config.ts` if Dara continues to own bundler configuration

This keeps machine-owned files separate from user-owned project files while avoiding the current generated `dist/` workspace model.

## Command Behavior

### `dara lock`

Responsibilities:

- discover required Dara JS dependencies from the Python app configuration
- merge Dara-owned dependencies into `package.json`
- generate or refresh `.dara/generated/*`
- run the embedded Bun install
- write `bun.lock`
- write `dara.lock`

### `dara dev`

Responsibilities:

- if `bun.lock` / `dara.lock` are missing locally, run the bootstrap flow automatically
- otherwise validate that the lock state is still current
- refresh `.dara/generated/*`
- run the embedded Bun development flow

### `dara build`

Responsibilities:

- require an existing valid `bun.lock` and `dara.lock`
- fail fast if the Dara dependency projection is stale
- run Bun in frozen-lockfile mode
- produce the app bundle through the unified pipeline

This is the main enforcement point for reproducibility.

### `dara eject`

`dara eject` should replace the role currently played by `dara setup-custom-js`.

Responsibilities:

- create the standard user-owned local JS entrypoint if missing
- scaffold any minimal source files needed for custom JS
- avoid creating a separate package workspace

`dara setup-custom-js` can remain as a compatibility alias for a migration period.

## No-Custom-JS Experience

For users with no custom JS, the intended experience is:

1. Install Dara.
2. Run the app.
3. On first local run, Dara auto-generates `package.json` if needed, installs via the embedded Bun runtime, and writes `bun.lock` + `dara.lock`.
4. The user checks those files in.
5. Future builds use frozen lockfiles.

This keeps the zero-setup path while still making the resulting dependency graph explicit and reproducible.

## Custom JS Experience

For users with custom JS, the intended experience is:

- the project still looks like a normal root-owned JS project
- custom code lives in the user-owned source entrypoint
- extra dependencies are normal `package.json` dependencies
- there is no `dara.config.json`
- Dara still owns only the generated projection layer and the minimal dependency projection

## Migration Plan

Migration should be staged rather than a flag day.

### Phase 1: Compatibility

- If `dara.config.json` is present, Dara reads it as migration input.
- `extra_dependencies` are merged into root `package.json`.
- `package_manager` is ignored; Bun replaces it.
- `local_entry` is used only to find or generate the user-owned JS entrypoint.
- `dara setup-custom-js` maps to `dara eject`.
- If the new files exist, Dara prefers the new model.

### Phase 2: Warn

- Legacy-only projects still work.
- Dara emits a deprecation warning when `dara.config.json` is still the active source of truth.
- The warning points users to `dara lock` / `dara eject`.

### Phase 3: Enforce

- `dara.config.json` no longer participates in builds.
- `dara build` requires valid checked-in lockfiles.
- The old UMD/auto-JS path is removed.

## Migration Details for Existing Apps

For existing apps with root `package.json`:

- merge `extra_dependencies` into the root manifest using the minimal merge policy
- keep unrelated user config untouched
- generate `bun.lock` and `dara.lock`
- leave `dara.config.json` in place only for the compatibility window

For existing apps without root `package.json`:

- create a minimal root manifest
- project Dara-owned dependencies into it
- write `bun.lock` and `dara.lock`

For existing apps with custom local JS:

- preserve the current source layout where practical
- if necessary, generate a standard entrypoint that re-exports from the old local entry
- avoid forcing users to move all JS immediately during migration

## Open Questions

- What exact dependency allowlist should Dara be allowed to project into `package.json`?
- Is Bun sufficiently compatible for Dara's existing Vite-based build flow, or does the lower migration risk of Node outweigh the single-binary advantage?
- Does Dara continue to own bundler configuration, or should `dara eject` optionally expose more of it?
- How much of `.dara/generated/*` should be considered stable vs internal implementation detail?
- How long should the compatibility period for `dara.config.json` last?
- Should `dara lock` support an explicit prune mode for stale Dara-owned dependencies later?

## Recommended First Implementation Slice

1. Add Bun binary resolution and supported-target detection.
2. Introduce `dara.lock`.
3. Introduce `dara lock` with minimal root `package.json` merge.
4. Make missing local lockfiles auto-bootstrap on first run.
5. Switch `dara build` to frozen lockfiles.
6. Add `dara eject` and compatibility handling for `dara.config.json`.
7. Remove the UMD / auto-JS path once the new pipeline is validated.
