# Dara JS Build Redesign Proposal

Status: Draft

## Summary

Replace Dara's current generated `dist/` JS workspace, `dara.config.json`, machine-dependent Node setup, and UMD / auto-JS fallback mode with a single Dara-managed Node + pnpm-backed build pipeline.

The proposed model is:

- Dara uses one Dara-managed Node + pnpm toolchain for all apps.
- Non-ejected apps have no user-facing JS manifest; Dara owns the generated JS workspace and its package-manager state.
- Ejected apps get a normal user-owned JS workspace, for example `js/package.json`, `js/pnpm-lock.yaml`, and `js/vite.config.ts`.
- Every app checks in a platform-independent `dara.lock`; ejected apps also check in their JS workspace lockfile.
- Missing local lockfiles auto-bootstrap on first run; local dev validates only Dara-managed state with clear remediation; CI and `dara build` use frozen installs and fail if stale.
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
- Keep the JS ownership model simple: Dara owns non-ejected JS internals; users own ejected JS workspaces.

## Non-Goals

- Support every Node target from day one.
- Rework Dara's Python-side component/action registration APIs as part of this change.
- Automatically prune unrelated user dependencies from `package.json`.
- Merge Dara-managed dependencies into unrelated root `package.json` files.

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

### 2. Managed and Ejected JS Workspaces

The default experience should hide the JavaScript workspace completely.

For non-ejected apps, Dara should own the JS manifest, package-manager lockfile, generated entrypoint, and bundler config. Users should not need to know that a `package.json` exists, and they should not need to run package-manager commands directly. This is the junior-friendly path:

- `dara dev` works from a Python app with no JS files
- missing lock state auto-bootstraps locally
- `dara lock` refreshes Dara-managed frontend state explicitly
- `dara build` and CI validate frozen managed state

The managed workspace should be internal implementation detail, not a user-owned project. A reasonable layout is:

- `.dara/managed-js/package.json`
- `.dara/managed-js/pnpm-lock.yaml`
- `.dara/generated/*`

The files can be materialized from `dara.lock` when needed, but they should be treated as Dara-owned generated state. Users should be guided to `dara lock` rather than editing them by hand.

For ejected apps, Dara should create a normal, scoped user-owned JS workspace. The default location can be:

- `js/package.json`
- `js/pnpm-lock.yaml`
- `js/vite.config.ts`
- `js/src/index.tsx`

Ejected workspaces are the experienced-user path. Users can install dependencies, add scripts, configure workspaces, and customize Vite using normal JS tooling without Dara mutating an unrelated root manifest.

This keeps the ownership model explicit:

- managed mode: Dara owns the JS workspace
- ejected mode: the user owns the JS workspace
- app root: still the Python-facing project root

Dara should avoid rewriting unrelated root files such as:

- root `package.json`
- root package-manager lockfiles
- root workspace config
- formatting or lint config

The Dara-owned dependency projection should stay minimal in both modes, likely limited to:

- discovered `@darajs/*` runtime dependencies
- build-tool dependencies that Dara explicitly owns for the current Python Dara version, such as `vite`, `@vitejs/plugin-react`, and related Dara-required plugins
- React constraints only if Dara must enforce them

In managed mode, Dara can rewrite that projection freely because the workspace is Dara-owned. In ejected mode, merge rules should stay explicit:

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

Each app should check in `dara.lock`.

In managed mode, `dara.lock` is the only required user-visible frontend lockfile. Dara can materialize the internal `package.json` and `pnpm-lock.yaml` from it inside `.dara/managed-js/`.

In ejected mode, each app should check in:

- `dara.lock`
- the ejected workspace `package.json`
- the ejected workspace package-manager lockfile, for example `js/pnpm-lock.yaml`

`dara.lock` should capture Dara's own view of the frontend build state, for example:

- Dara version
- Node version
- pnpm version
- supported runtime targets or target artifact metadata
- JS ownership mode, either managed or ejected
- ejected workspace path when relevant
- discovered Dara JS dependency projection
- local entrypoint mode/path
- hash of Dara's generated projection data

The lock policy should be:

- missing lockfiles locally: auto-bootstrap
- local dev: validate Dara-managed state, refresh `.dara/generated/*`, and explain exactly when `dara.lock` or an ejected workspace lockfile needs to be rewritten
- local user-owned dependency changes outside Dara's managed surface in ejected mode: do not block dev
- CI and `dara build`: frozen install only, fail if stale

This keeps the local first-run experience smooth without weakening reproducibility for real builds, and it avoids making Dara the owner of unrelated user dependencies.

### 4. One Build Pipeline

Dara should remove the current UMD / auto-JS delivery mode and always build the app through the same JS toolchain.

That means:

- no special non-custom-JS bundle path
- no generated `dist/package.json` workspace
- no symlink-based `node_modules` sharing
- no hidden dependency install during a production build outside the selected managed or ejected workspace

Apps with no custom JS should still use the same pipeline; the only difference is that the generated entrypoint imports Dara-discovered packages and no user-defined custom exports.

### 5. Small Dara-Owned Generated Layer

Dara will still need a small generated layer, but it should stay limited to framework internals rather than becoming another user-owned JS project.

The intended directory boundary is:

- app root: Python-facing project files and `dara.lock`
- `.dara/managed-js/*`: Dara-owned managed workspace for non-ejected apps
- `.dara/generated/*`: Dara-owned metadata and generated glue
- `js/*` by default after eject: user-owned source, manifest, lockfile, and build config
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

This keeps machine-owned internals separate from both user-owned project files and real build output, instead of repeating the current pattern where `dist/` doubles as both a synthetic workspace and an output directory.

### 6. Eject Uses a Stable Vite Plugin Boundary

Before `dara eject`, Dara should own the default bundler configuration so the no-custom-JS path stays zero-setup.

After `dara eject`, the user should own the normal JS project surface:

- the local JS entrypoint
- the application source tree
- bundler configuration such as `vite.config.ts`
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
| `dara lock` | Discover required Dara JS dependencies, refresh `.dara/generated/*`, install/update JS dependencies with Dara-managed pnpm, and write `dara.lock`. In managed mode it also refreshes the Dara-owned internal workspace state; in ejected mode it validates and updates the ejected workspace lockfile. |
| `dara dev` | Auto-bootstrap if lockfiles are missing locally; validate the Dara-managed toolchain and dependency surface; refresh `.dara/generated/*`; and run the development server. If Dara-managed state is stale, emit clear remediation and only rewrite files when that is the intended local-healing path. |
| `dara build` | Require valid checked-in lock state for the Dara-managed surface, run `pnpm install --frozen-lockfile`, and produce the app bundle through the unified pipeline. |
| `dara eject` | Create the standard user-owned local JS workspace, entrypoint, and Vite config using the Dara Vite plugin. `dara setup-custom-js` can remain as a compatibility alias for a migration period. |

## Migration

Migration should be staged rather than a flag day.

### Compatibility

- If `dara.config.json` is present, Dara reads it as migration input only.
- `extra_dependencies` trigger eject, because they mean the user has requested direct JS dependency ownership.
- `package_manager` is used only as migration input.
- `local_entry` is used only to find or generate the user-owned JS entrypoint.
- If the new files exist, Dara prefers the new model.

The migration for `package_manager` should be deterministic:

- legacy `pnpm`: keep using pnpm and write the new ejected workspace lockfile plus `dara.lock`
- legacy `npm` or `yarn`: migrate once to Dara-managed pnpm when `dara lock` is first run, with a clear message that the JS lockfile format is changing

Existing app cases should be handled as follows:

- no custom local JS: migrate to managed mode without creating user-facing JS files
- root `package.json` already exists for unrelated tooling: leave it alone
- custom local JS already exists: eject into the standard JS workspace, preserving the current source layout where practical or generating a standard entrypoint that re-exports from the old location

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

- How long should the compatibility window for `dara.config.json` last?
- Should the ejected JS workspace default to `js/`, `frontend/`, or a configurable path?
- Should managed-mode package-manager lock data be embedded in `dara.lock`, or should `dara.lock` point to a checked-in Dara-owned lockfile under `.dara/managed-js/`?

## Recommended First Implementation Slice

1. Add Node resolution, version checks, and the global runtime cache.
2. Add a Dara-managed pnpm install in the global cache, for example via a dedicated `PNPM_HOME`.
3. Introduce platform-independent `dara.lock` with exact Node and pnpm versions plus target artifact metadata.
4. Introduce the managed-mode internal JS workspace and `dara lock` generation.
5. Make missing local lockfiles auto-bootstrap on first run.
6. Add explicit Dara-managed state checks with clear remediation in `dara dev`.
7. Switch `dara build` and CI to frozen installs.
8. Add `@darajs/vite-plugin`.
9. Add `dara eject` and compatibility handling for `dara.config.json`.
10. Remove the UMD / auto-JS path once the new pipeline is validated.
