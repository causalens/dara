# Migrating custom JavaScript to the app-root pipeline

Run `dara lock` from the application's root to migrate an existing app and prepare its frontend without starting a server. `dara dev` performs the same migration before starting development. Both commands inspect legacy files before importing the application. After a supported migration is applied, normal preparation imports the configuration and may install dependencies.

If any case needs manual changes, the command exits nonzero with source locations and instructions before applying migration edits. Make the listed changes and rerun `dara lock` or `dara dev`. The automatic workflow does not apply a supported subset while other cases remain unresolved.

When migration is needed, the command announces it before writing, then reports the number of changed files and any follow-up notes. Runs with no migration changes stay quiet. Once preparation succeeds, inspect `git diff` and commit the source changes and dependency files. There is no standalone migration or migration-preview command. `dara check --json` checks an already prepared project; it does not preview migration. `dara dev --frozen` reports required migration without applying it or invoking the JavaScript analyzer. `dara dev --backend-only` skips migration and frontend preparation.

Repeated migration does not duplicate adapters, dependencies or registration calls. All inspected inputs are checked before the first write, and each destination is checked again before replacement. A concurrent edit stops subsequent writes; earlier completed writes can remain after a conflict or interruption. Review the changes and rerun the command to resume. Source edits preserve line endings and executable permissions; linked destinations and overlapping source trees require manual handling.

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

After reviewing the changes from `dara lock`, validate and build:

```fish
dara check --json
dara build
```

Use `dara dev` to develop the app, or `dara start` to serve the compiled output.

`dara lock` and `dara dev` prepare missing project files and dependencies after migration. Commit the resulting package manifest, workspace catalog, pnpm lockfile, Vite and TypeScript configuration. `dara build` then uses frozen inputs, and `dara start` serves the artifact without Node or pnpm.
