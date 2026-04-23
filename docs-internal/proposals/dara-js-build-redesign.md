# Dara JS Build Redesign Proposal

Status: Draft

## Summary

Replace Dara's current generated `dist/` JS workspace, `dara.config.json`, machine-dependent Node setup, and UMD / auto-JS fallback mode with a single Node-backed build pipeline.

The proposed model is:

- Dara uses one pinned JS runtime/toolchain path for all apps.
- The app root owns a normal `package.json`.
- Dara adds only a minimal Dara-owned dependency projection into that manifest.
- The app checks in `package.json`, a JS lockfile, and `dara.lock`.
- Missing local lockfiles auto-bootstrap on first run; stale lockfiles require `dara lock`; CI and `dara build` use frozen installs and fail if stale.
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

Dara should be Node-first.

The key point is that Dara needs a full runtime/toolchain, not a narrower build helper. Even for the no-custom-JS path it still needs:

- a JS runtime
- a package manager
- a bundler / dev-server path

Dara should resolve Node in this order:

- explicit override such as `DARA_NODE_PATH`
- compatible system Node if present
- cached Dara-managed Node runtime
- on-demand download into the global cache

Initial managed targets can stay narrow:

- macOS arm64
- macOS x64
- Linux x64 (glibc)
- Linux arm64 (glibc)

The global cache avoids multiple Dara environments carrying duplicate copies of the same runtime. A reasonable layout is:

- `${XDG_CACHE_HOME:-~/.cache}/dara/node/<version>/<target>/...` on Linux/macOS
- the equivalent local app cache location on Windows

That gives Dara:

- one cached copy per machine per Node version/target
- sharing across virtualenvs and multiple Dara installs
- predictable upgrades when Dara bumps the managed Node version
- a fallback path that does not interfere with the user's global Node install

Dara should validate the system Node version before using it. If it is incompatible, Dara should transparently fall back to the cached managed runtime instead of failing or mutating the user's global install.

For package management, Dara can either:

- start with `npm` for the simplest implementation
- or install/manage a pinned `pnpm` inside the same isolated Node runtime for better install performance

That package-manager choice should not change the rest of the design.

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
- build-tool dependencies if Dara continues to own Vite config
- React constraints only if Dara must enforce them

Merge rules should stay simple:

- if a Dara-owned dependency is missing, add it
- if the user already specifies a compatible version, keep the user value
- if the user specifies an incompatible version, fail with a precise error
- do not remove dependencies from `package.json` automatically

### 3. Checked-In Lock State

Each app should check in:

- `package.json`
- a JS lockfile such as `pnpm-lock.yaml` or `package-lock.json`
- `dara.lock`

`dara.lock` should capture Dara's own view of the frontend build state, for example:

- Dara version
- Node version and target
- package-manager version if Dara manages it
- discovered Dara JS dependency projection
- local entrypoint mode/path
- hash of Dara's generated projection data

The lock policy should be:

- missing lockfiles locally: auto-bootstrap
- existing but stale lockfiles locally: require explicit `dara lock`
- CI and `dara build`: frozen install only, fail if stale

This keeps the local first-run experience smooth without weakening reproducibility for real builds.

### 4. One Build Pipeline

Dara should remove the current UMD / auto-JS delivery mode and always build the app through the same JS toolchain.

That means:

- no special non-custom-JS bundle path
- no generated `dist/package.json` workspace
- no symlink-based `node_modules` sharing
- no hidden dependency install during a production build outside the real app workspace

Apps with no custom JS should still use the same pipeline; the only difference is that the generated entrypoint imports Dara-discovered packages and no user-defined custom exports.

### 5. Small Dara-Owned Generated Layer

Dara will still need a generated layer for importer maps, generated entrypoints, and possibly bundler configuration.

That should live in a clearly Dara-owned internal folder, for example:

- `.dara/generated/importers.ts`
- `.dara/generated/entry.tsx`
- `.dara/generated/vite.config.ts` if Dara continues to own bundler configuration

This keeps machine-owned files separate from user-owned project files while avoiding the current synthetic `dist/` workspace model.

## Commands

| Command | Responsibilities |
| --- | --- |
| `dara lock` | Discover required Dara JS dependencies, merge the Dara-owned projection into `package.json`, refresh `.dara/generated/*`, install/update JS dependencies, and write the JS lockfile plus `dara.lock`. |
| `dara dev` | Auto-bootstrap if lockfiles are missing locally; otherwise validate staleness, refresh `.dara/generated/*`, and run the development server. |
| `dara build` | Require valid checked-in lock state, run a frozen install, and produce the app bundle through the unified pipeline. |
| `dara eject` | Create the standard user-owned local JS entrypoint and minimal scaffolding for custom JS. `dara setup-custom-js` can remain as a compatibility alias for a migration period. |

## Migration

Migration should be staged rather than a flag day.

### Compatibility

- If `dara.config.json` is present, Dara reads it as migration input only.
- `extra_dependencies` are merged into the root `package.json` using the normal merge rules.
- `package_manager` is ignored.
- `local_entry` is used only to find or generate the user-owned JS entrypoint.
- If the new files exist, Dara prefers the new model.

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
- compatible system Node can be reused directly when present.
- incompatible user installs can be bypassed cleanly by falling back to Dara's cached managed runtime.

If the Node-based implementation proves more awkward than expected, Bun remains viable because the same cache-and-resolution design can support a managed Bun runtime as well.

## Open Questions

- Should Dara standardize on `npm` first, or manage a pinned `pnpm` alongside the cached Node runtime?
- How much bundler configuration should Dara own versus expose through `dara eject`?
- How stable should `.dara/generated/*` be as a surface area?
- How long should the compatibility window for `dara.config.json` last?

## Recommended First Implementation Slice

1. Add Node resolution, version checks, and the global runtime cache.
2. Choose the initial package-manager strategy (`npm` first is the lowest-risk path; pinned `pnpm` is the obvious follow-up if install speed matters).
3. Introduce `dara.lock`.
4. Introduce `dara lock` with the minimal root `package.json` merge.
5. Make missing local lockfiles auto-bootstrap on first run.
6. Switch `dara build` and CI to frozen installs.
7. Add `dara eject` and compatibility handling for `dara.config.json`.
8. Remove the UMD / auto-JS path once the new pipeline is validated.
