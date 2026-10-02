---
title: Project diagnostics
---

`dara dev`, `dara lock`, `dara build`, `dara start` and `dara check` report frontend problems as diagnostics. Each diagnostic has a stable `code`, a `message` describing this occurrence and a `fix` naming the action that repairs it. Codes are never reused for a different problem, so scripts and coding agents can match on them.

## Checking a project

`dara check` reports every problem it can find without changing files or installing dependencies. Independent checks all run: a missing Node, a missing pnpm and an application that fails to import are reported together. A check is skipped only when one it depends on failed; for example, the Vite plugin is not run while the toolchain is missing or the lockfile disagrees with `package.json`.

`dara check --json` prints the diagnostics as a JSON list. Passing checks have an empty `fix`, and the command exits with status 1 when any diagnostic has a fix:

```json
[
  {
    "code": "toolchain.pnpm",
    "message": "pnpm >=12 <13 is required on PATH (found 10.2.0)",
    "fix": "install pnpm >=12 <13"
  },
  {
    "code": "dependency.drift",
    "message": "Project declarations and lockfile disagree",
    "fix": "run dara lock and commit the result"
  }
]
```

The other commands stop at the first diagnostic, because they cannot continue past it. During `dara dev`, the diagnostic is also shown on the page served in place of the frontend.

## Codes

The fix in a diagnostic is specific to its occurrence; the fixes below are the usual repair.

### Toolchain

| Code                | Meaning                                                                  | Usual fix                                                                         |
| ------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `toolchain.node`    | Node on `PATH` is missing or outside the supported range.                | Install Node in the reported range, for example with the app's `mise.toml`.       |
| `toolchain.pnpm`    | pnpm on `PATH` is missing or outside the supported range.                | Install pnpm in the reported range, for example with the app's `mise.toml`.       |
| `toolchain.engines` | `package.json` `engines` exclude the range Dara requires.                | Edit `engines` so it allows Dara's range.                                         |
| `toolchain.runtime` | The Node running the plugin is older than Dara supports.                 | Install a supported Node, including the one pnpm provisions through `devEngines`. |
| `toolchain.ready`   | Passing check: reports the toolchain and plugin runtime versions in use. | None.                                                                             |

### Project and configuration

| Code               | Meaning                                                                    | Usual fix                                                     |
| ------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `project.config`   | `[tool.dara].config` or `--config` does not name a `ConfigurationBuilder`. | Edit `pyproject.toml` or the `--config` value.                |
| `project.import`   | Importing the application failed.                                          | Fix the reported Python error.                                |
| `project.file`     | A project file such as `package.json` cannot be read or parsed.            | Edit the reported file, or fix its permissions.               |
| `project.missing`  | A generated project file is missing during a frozen operation.             | Run `dara lock` and commit the created file.                  |
| `project.ready`    | Passing check: the frontend project is consistent.                         | None.                                                         |
| `command.flags`    | Command options cannot be combined.                                        | Run the command with one of the conflicting options.          |
| `command.unknown`  | Python asked the plugin for an operation it does not know.                 | Run `dara lock` so `@darajs/vite-plugin` matches Dara.        |
| `manifest.schema`  | The plugin cannot read the manifest Python wrote.                          | Upgrade the Dara Python and JS packages to matching versions. |
| `manifest.version` | Python Dara and `@darajs/vite-plugin` versions differ.                     | Run `dara lock`.                                              |

### Dependencies

| Code                   | Meaning                                                                                 | Usual fix                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `dependency.drift`     | `package.json`, the `dara` catalog and `pnpm-lock.yaml` disagree.                       | Run `dara lock` and commit the result.                                             |
| `dependency.lockfile`  | pnpm could not verify the lockfile.                                                     | Resolve the reported pnpm error.                                                   |
| `dependency.install`   | `pnpm install` failed, or pnpm could not read its installation policy.                  | Fix the pnpm output, such as the registry route or `.npmrc` placeholders.          |
| `dependency.catalog`   | The `dara` catalog in `pnpm-workspace.yaml` is missing or has a different version.      | Run `dara lock`.                                                                   |
| `dependency.reference` | A Dara-owned dependency is not declared as `catalog:dara` in the expected section.      | Run `dara lock`, or move the reported entry in `package.json`.                     |
| `dependency.missing`   | A required package is not installed.                                                    | Run `dara lock`.                                                                   |
| `dependency.version`   | An installed package has the wrong version, or a Python version has no npm equivalent.  | Run `dara lock`; for Python versions, install a release, pre-release or dev build. |
| `dependency.mapping`   | An npm package maps to more than one Python package, or to no installed Python package. | Declare each npm package from a single installed Python package.                   |
| `dependency.target`    | A local dependency reference points outside the workspace.                              | Point the reference inside the workspace.                                          |

### Workspaces

| Code                    | Meaning                                                                   | Usual fix                                                        |
| ----------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `workspace.member`      | The app is not a declared member of its pnpm workspace.                   | Add its directory to `packages` in `pnpm-workspace.yaml`.        |
| `workspace.members`     | pnpm could not report workspace membership.                               | Fix `pnpm-workspace.yaml` or the package declarations.           |
| `workspace.requirement` | Two apps in the workspace record conflicting Python package requirements. | Align the Python environments, then run `dara lock` in each app. |
| `workspace.version`     | Apps or packages in the workspace use different Dara or package versions. | Align the versions, then run `dara lock` in each app.            |
| `workspace.environment` | A recorded Python environment is unusable.                                | Activate the intended environment and run `dara lock`.           |
| `workspace.manifest`    | A workspace package's `package.json` is invalid.                          | Edit the reported `package.json`.                                |
| `workspace.missing`     | A workspace dependency is not installed or not built.                     | Run `dara lock`; build the package or add `dara-source` exports. |
| `workspace.name`        | A workspace dependency resolves to a package with a different name.       | Correct the dependency name or target.                           |
| `workspace.stale`       | An installed workspace package differs from its declaration.              | Run `dara lock`.                                                 |
| `workspace.target`      | A linked package resolves outside the workspace or to the wrong package.  | Keep linked packages inside the workspace, then run `dara lock`. |
| `workspace.output`      | A library build output overlaps the app output.                           | Choose separate output directories.                              |

### Component and action sources

| Code                | Meaning                                                                       | Usual fix                                                              |
| ------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `source.invalid`    | A `js_source` is malformed, or a local source resolves outside `js/`.         | Edit the `js_source`.                                                  |
| `source.unresolved` | A `js_source` cannot be resolved.                                             | Edit the `js_source`, or build the workspace package that provides it. |
| `source.duplicate`  | One registered name has several implementations.                              | Register each name once.                                               |
| `source.self`       | An import of the app's own package does not resolve to a file inside the app. | Edit the `exports` in `package.json`.                                  |

### Vite and TypeScript

| Code                  | Meaning                                                                                               | Usual fix                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `vite.config`         | `vite.config.ts` is missing or cannot be loaded.                                                      | Run `dara lock`, or fix the reported error.                             |
| `vite.plugin`         | `vite.config.ts` does not include exactly one `dara()` plugin.                                        | Edit `vite.config.ts`.                                                  |
| `vite.react`          | A second React plugin is configured; `dara()` already includes one.                                   | Remove the extra React plugin.                                          |
| `vite.options`        | The options passed to `dara()` are invalid.                                                           | Edit the `dara()` options.                                              |
| `vite.root`           | Vite's `root` is not the app root.                                                                    | Edit `vite.config.ts`.                                                  |
| `vite.base`           | `vite.config.ts` sets `base`; Dara owns base URLs.                                                    | Remove `base` and pass `--base-url` to the Dara command.                |
| `vite.server`         | `vite.config.ts` sets a server option Dara owns, such as the port, `server.ws` or `server.fs.strict`. | Remove it; only `server.hmr.overlay` and composable options can be set. |
| `vite.public`         | `vite.config.ts` sets `publicDir`.                                                                    | Use `static/` or `add_static_folder` instead.                           |
| `vite.entry`          | `vite.config.ts` sets a build entry, library mode or `appType`.                                       | Use `vite.lib.config.ts` for a separate library build.                  |
| `vite.output`         | `build.outDir` disagrees with Dara's output, or `build.manifest` is enabled.                          | Remove the option; pass `--output` to `dara build`.                     |
| `vite.resolve`        | `vite.config.ts` sets `resolve.preserveSymlinks`.                                                     | Remove it; Dara loads linked packages by their real path.               |
| `vite.override`       | A plugin changed a development option after Dara configured it.                                       | Remove the plugin, or configure it to leave the option to Dara.         |
| `vite.environment`    | Vite did not create its client environment.                                                           | Edit `vite.config.ts`.                                                  |
| `typescript.config`   | `tsconfig.json` is missing or invalid.                                                                | Run `dara lock`, or edit `tsconfig.json`.                               |
| `typescript.runner`   | The TypeScript compiler could not run.                                                                | Run `dara lock`.                                                        |
| `typescript.shutdown` | The TypeScript compiler did not stop.                                                                 | Stop the compiler process before restarting development.                |

### Builds

| Code             | Meaning                                                                             | Usual fix                                                              |
| ---------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `build.stale`    | `dara start` found a build whose inputs have changed since it was built.            | Run `dara build`.                                                      |
| `build.marker`   | The build marker `.dara-build.json` is missing, invalid or inconsistent.            | Run `dara build`.                                                      |
| `build.changed`  | An input changed while the build was running; the previous output is intact.        | Run `dara build` again.                                                |
| `build.input`    | A build input is outside the app or workspace, or a plugin read an undeclared file. | Declare the input with `dara({ inputs: [...] })` inside the workspace. |
| `build.output`   | The output directory is unsafe or overlaps a build input.                           | Choose a separate output directory.                                    |
| `build.entry`    | Vite produced no Dara application entry.                                            | Run `dara build`; check plugins that rewrite the bundle.               |
| `build.command`  | A dependency build script failed.                                                   | Fix the reported errors, then run `dara build`.                        |
| `build.publish`  | Publishing the new output failed; the previous output was preserved.                | Run `dara build`.                                                      |
| `build.recovery` | Publishing and restoring both failed, or an earlier interrupted build needs review. | Restore the reported backup, then run `dara build`.                    |

### Static assets

| Code              | Meaning                                                                       | Usual fix                         |
| ----------------- | ----------------------------------------------------------------------------- | --------------------------------- |
| `asset.source`    | A registered static folder or package asset is missing or escapes its root.   | Edit the static registration.     |
| `asset.target`    | A static target path or package namespace is invalid.                         | Edit the static registration.     |
| `asset.collision` | Two assets target the same path, or an asset collides with Dara's own output. | Rename or move one of the assets. |

### Development

| Code               | Meaning                                                      | Usual fix                                              |
| ------------------ | ------------------------------------------------------------ | ------------------------------------------------------ |
| `frontend.prepare` | Preparing the frontend failed on a file or permission error. | Fix the reported error; `dara dev` retries on changes. |
| `frontend.runner`  | The plugin failed without a diagnostic of its own.           | Fix the reported error, then run `dara lock`.          |
| `frontend.exited`  | The Vite process exited.                                     | Fix the reported configuration error.                  |
| `frontend.owner`   | Another `dara dev` process already owns this app's frontend. | Stop the other `dara dev` process.                     |
| `frontend.waiting` | A frontend request arrived before preparation finished.      | Wait for `dara dev` to finish preparing.               |
| `backend.exited`   | The Python server exited during `dara dev`.                  | Fix the reported Python error and rerun `dara dev`.    |

### Migration

| Code                 | Meaning                                                                              | Usual fix                                             |
| -------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| `migration.required` | A legacy `dara.config.json` must be converted before preparation.                    | Run `dara lock`.                                      |
| `migration.config`   | `dara.config.json` cannot be read or has settings Dara cannot convert.               | Edit it, following the Dara 2.0 migration guide.      |
| `migration.conflict` | `dara.config.json` and `package.json` require different versions of a package.       | Reconcile the two requirements, then run `dara lock`. |
| `migration.manual`   | The source still uses an API that the migration cannot convert, such as `js_module`. | Follow the Dara 2.0 migration guide.                  |
| `migration.changed`  | A file changed while it was being migrated.                                          | Review the file and run `dara lock` again.            |
| `migration.write`    | Writing a migrated file failed.                                                      | Review `git diff` and run `dara lock` again.          |
