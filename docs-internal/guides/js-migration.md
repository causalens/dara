# Migrating custom JavaScript to the app-root pipeline

Run `dara migrate --check` from the application's root before importing an old app with Dara 2.0. The command prints a unified diff and source-linked manual steps. It does not import application modules, install dependencies, or start servers. Its exit status is 1 when changes or unresolved cases remain, and 0 when migration is complete.

Run `dara migrate` to apply supported edits. Review the diff, resolve the reported cases, and rerun it. Successful subsets are retained; ambiguous configuration stays in `dara.config.json`. A repeated migration does not duplicate adapters, dependencies or registration calls. All inspected inputs are checked before the first write, and each destination is checked again before replacement. A concurrent edit stops subsequent writes, and an interrupted source-tree copy can be resumed. Source edits preserve line endings and executable permissions; linked destinations and overlapping source trees require manual handling.

The supported entry pattern uses explicit re-exports:

```tsx
import './global.css';
import './setup';
export { default as Gauge } from './gauge';
export { increment as Increment } from './increment';
```

A default-export implementation becomes a direct `js_source`. A proven named export gets a small default-export adapter under `js/dara-adapters/`. Adapters retain the selected source extension; the Dara TypeScript preset enables `allowImportingTsExtensions` for this purpose. Customized TypeScript configurations need that option or the preset. Python class metadata is replaced in place, runtime naming overrides remain, and explicit registrations remain with only the obsolete `local=True` removed. Existing literal `js_source` declarations also allow that registration cleanup. Ambiguous bindings, observed metadata mutations and inheritance that cannot be migrated safely require manual review. npm declarations are converted only when a locally available package manifest and barrel prove a corresponding default-export subpath.

Executable statements, dynamic imports and ambiguous exports in the old entry require review. Move initialization code into a setup module and import it from `js/index.tsx`. Keep global CSS imports there. Package barrels without proven subpaths, dynamic Python metadata and ambiguous registration targets receive specific manual instructions. This is deliberately a structural migration, not execution of the old application to guess its behavior.

A known local source directory can move as a whole to `js/`, preserving internal relative imports and styles. Conflicting destinations, external references or binary files require an explicit move. Customized Vite configurations need the Dara plugin; keep a separately published library's configuration in `vite.lib.config.ts` with a different output directory.

Legacy `extra_dependencies` become ordinary dependencies without replacing existing requirements. Conflicts are reported with both values. npm and Yarn lockfiles are retained because their resolutions cannot be converted losslessly; the first preparation creates a pnpm lockfile for review. A uniquely recognizable Python configuration gets `[tool.dara].config`, and standalone development command usages become `dara dev`. Commands containing shell operators, expansion, continuations or comments are left unchanged for manual review. Ambiguous build/deployment commands need separate `dara build` and `dara start` steps.

After migration, run:

```fish
dara dev
dara check --json
dara build
dara start
```

`dara dev` prepares missing project files and dependencies. `dara lock` does the preparation without starting development. Commit the resulting package manifest, workspace catalog, pnpm lockfile, Vite and TypeScript configuration. `dara build` then uses frozen inputs, and `dara start` serves the artifact without Node or pnpm.
