# Dara JS Build Redesign Proposal

Status: Draft

## Summary

Replace Dara's current generated `dist/` JS workspace, `dara.config.json`, machine-dependent Node setup, and UMD / auto-JS fallback mode with a single Dara-managed Node + pnpm-backed build pipeline.

The proposed model is:

- Dara uses one Dara-managed Node + pnpm toolchain for all apps.
- The app root owns a normal `package.json`.
- Dara adds only a minimal Dara-owned dependency projection into that manifest.
- The app checks in `package.json`, `pnpm-lock.yaml`, and `dara.lock`.
- Missing local lockfiles auto-bootstrap on first run; local dev validates only Dara-managed state with clear remediation; CI and `dara build` use frozen installs and fail if stale.
- `dara.config.json` is replaced by `dara eject` plus a staged migration path.
- UMD / auto-JS mode is removed so custom-JS and no-custom-JS apps use the same pipeline.

## Problems Today

- Dara generates a temporary JS workspace in `dist/` instead of using the app root as the real frontend workspace.
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
- Keep the `package.json` ownership model simple enough that existing tooling keeps working.

## Non-Goals

- Support every Node target from day one.
- Rework Dara's Python-side component/action registration APIs as part of this change.
- Automatically prune unrelated user dependencies from `package.json`.
- Introduce a nested JS workspace such as `js/package.json`.

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

To keep builds reproducible, `dara lock`, `dara dev`, and `dara build` should all invoke the exact Dara-managed Node and pnpm versions recorded in `dara.lock`.

### 2. Root `package.json` Is User-Owned

The real frontend workspace should live at the app root.

Dara should treat the root `package.json` as user-owned and only merge in a small Dara-owned dependency projection. Dara should avoid rewriting unrelated fields such as:

- `name`
- `scripts`
- `workspaces`
- `overrides`
- formatting or lint config
- unrelated dependencies

The intended feel is that the app remains a regular project and existing tooling can continue to use the root manifest.

The Dara-owned dependency projection should stay minimal, likely limited to:

- discovered `@darajs/*` runtime dependencies
- build-tool dependencies that Dara explicitly owns for the current Python Dara version, such as `vite`, `@vitejs/plugin-react`, and related Dara-required plugins
- React constraints only if Dara must enforce them

Merge rules should stay simple:

- if a Dara-owned dependency is missing, add it
- if the user already specifies a compatible version, keep the user value
- if the user specifies an incompatible version, fail with a precise error
- do not remove dependencies from `package.json` automatically

Dara should only validate and constrain that narrow Dara-owned dependency surface. Regular user-owned dependencies should remain user-managed, so normal `pnpm add` / `pnpm remove` workflows keep working without Dara treating the whole manifest as its own.

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

`dara.lock` should capture Dara's own view of the frontend build state, for example:

- Dara version
- Node version and target
- pnpm version
- discovered Dara JS dependency projection
- local entrypoint mode/path
- hash of Dara's generated projection data

The lock policy should be:

- missing lockfiles locally: auto-bootstrap
- local dev: validate Dara-managed state, refresh `.dara/generated/*`, and explain exactly when `dara.lock` / `pnpm-lock.yaml` need to be rewritten
- local user-owned dependency changes outside Dara's managed surface: do not block dev
- CI and `dara build`: frozen install only, fail if stale

This keeps the local first-run experience smooth without weakening reproducibility for real builds, and it avoids making Dara the owner of unrelated user dependencies.

### 4. One Build Pipeline

Dara should remove the current UMD / auto-JS delivery mode and always build the app through the same JS toolchain.

That means:

- no special non-custom-JS bundle path
- no generated `dist/package.json` workspace
- no symlink-based `node_modules` sharing
- no hidden dependency install during a production build outside the real app workspace

Apps with no custom JS should still use the same pipeline; the only difference is that the generated entrypoint imports Dara-discovered packages and no user-defined custom exports.

### 5. Small Dara-Owned Generated Layer

Dara will still need a small generated layer, but it should stay limited to framework internals rather than becoming a second hidden JS workspace.

The intended directory boundary is:

- app root: user-owned project files such as `package.json`, lockfile, source, `node_modules`, and ejected build config
- `.dara/generated/*`: Dara-owned metadata and generated glue
- `dist/`: emitted build output only

Examples of things that can live under `.dara/generated/*`:

- generated importer map
- generated entry wiring
- generated dependency projection metadata

Examples of things that should not live under `.dara/`:

- `node_modules`
- the real project `package.json`
- the primary lockfile
- final emitted assets

This keeps machine-owned internals separate from both user-owned project files and real build output, instead of repeating the current pattern where `dist/` doubles as both a synthetic workspace and an output directory.

### 6. Eject Changes Ownership of Build Config

Before `dara eject`, Dara can own the default bundler configuration so the no-custom-JS path stays zero-setup.

After `dara eject`, the user should own:

- the local JS entrypoint
- the application source tree
- bundler configuration such as `vite.config.ts`
- any additional bundler plugins or project-specific build customizations

After eject, Dara should still own only the framework-generated glue and metadata under `.dara/generated/*`.

In other words:

- eject means "user owns source and build config"
- it does not mean Dara stops generating framework metadata

## Commands

| Command | Responsibilities |
| --- | --- |
| `dara lock` | Discover required Dara JS dependencies, merge the Dara-owned projection into `package.json`, refresh `.dara/generated/*`, install/update JS dependencies with Dara-managed pnpm, and write `pnpm-lock.yaml` plus `dara.lock`. |
| `dara dev` | Auto-bootstrap if lockfiles are missing locally; validate the Dara-managed toolchain and dependency surface; refresh `.dara/generated/*`; and run the development server. If Dara-managed state is stale, emit clear remediation and only rewrite files when that is the intended local-healing path. |
| `dara build` | Require valid checked-in lock state for the Dara-managed surface, run `pnpm install --frozen-lockfile`, and produce the app bundle through the unified pipeline. |
| `dara eject` | Create the standard user-owned local JS entrypoint and eject the default bundler configuration so the user can add plugins and other build customization. `dara setup-custom-js` can remain as a compatibility alias for a migration period. |

## Migration

Migration should be staged rather than a flag day.

### Compatibility

- If `dara.config.json` is present, Dara reads it as migration input only.
- `extra_dependencies` are merged into the root `package.json` using the normal merge rules.
- `package_manager` is used only as migration input.
- `local_entry` is used only to find or generate the user-owned JS entrypoint.
- If the new files exist, Dara prefers the new model.

The migration for `package_manager` should be deterministic:

- legacy `pnpm`: keep using pnpm and write the new `pnpm-lock.yaml` / `dara.lock`
- legacy `npm` or `yarn`: migrate once to Dara-managed pnpm when `dara lock` is first run, with a clear message that the JS lockfile format is changing

Existing app cases should be handled as follows:

- root `package.json` already exists: merge into it
- no root `package.json`: create a minimal one
- custom local JS already exists: preserve the current source layout where practical, or generate a standard entrypoint that re-exports from the old location

### Warn

- Legacy-only projects still work.
- Dara emits a deprecation warning when `dara.config.json` is still the active source of truth.
- The warning points users to `dara lock` / `dara eject`.

### Enforce

- `dara.config.json` no longer participates in builds.
- `dara build` requires checked-in lockfiles.
- the old UMD / auto-JS path is removed.

## Alternative Considered: Bun

Bun remains the main alternative to the Node-first design because one binary can cover runtime, package manager, and build execution.

The proposal is still Node-first because:

- Bun is not meaningfully smaller in a way that changes the packaging decision enough to outweigh compatibility risk.
- Node lowers migration risk for the current Vite/plugin ecosystem.
- a cached Dara-managed Node + pnpm toolchain gives reproducible behavior without depending on user machine state.

If the Node-based implementation proves more awkward than expected, Bun remains viable because the same cache-and-resolution design can support a managed Bun runtime as well.

## Open Questions

- How stable should `.dara/generated/*` be as a surface area?
- How long should the compatibility window for `dara.config.json` last?

## Recommended First Implementation Slice

1. Add Node resolution, version checks, and the global runtime cache.
2. Add a Dara-managed pnpm install in the global cache, for example via a dedicated `PNPM_HOME`.
3. Introduce `dara.lock` with exact resolved Node and pnpm versions.
4. Introduce `dara lock` with the minimal root `package.json` merge and `pnpm-lock.yaml` generation.
5. Make missing local lockfiles auto-bootstrap on first run.
6. Add explicit Dara-managed state checks with clear remediation in `dara dev`.
7. Switch `dara build` and CI to frozen installs.
8. Add `dara eject` and compatibility handling for `dara.config.json`.
9. Remove the UMD / auto-JS path once the new pipeline is validated.
