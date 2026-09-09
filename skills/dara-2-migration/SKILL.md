---
name: dara-2-migration
description: Migrate Dara 1.x applications and component packages to Dara 2.0. Use when upgrading the frontend pipeline, replacing legacy js_module/js_component declarations, or resolving Dara diagnostics that refer to this migration skill.
---

# Dara 2.0 migration

Migrate one application through a working build before applying the same decisions to other applications. Source and deployment changes require repository-specific reasoning. Dara's automatic migration only copies understood legacy dependency settings and removes the corresponding `dara.config.json`.

## 1. Inventory the application

Locate each application root, its Python configuration object, dependency manifests, custom component/action/auth implementations, setup entry, static assets and development/deployment commands. Include CI, containers, task runners and documentation that users execute.

Search for `dara.config.json`, `js_module`, `js_component`, `local=True`, `add_component`, `add_action`, `add_module_dependency`, `dara_assets`, `AuthComponent` and `dara start`. Follow aliases, inherited declarations and dynamic registrations to the actual implementation. Record how each legacy entry's imports initialize the app.

**Complete when:** every application and owned component package has a known root and configuration entry, and every affected declaration, setting and command has an identified owner and destination.

## 2. Upgrade the environment and configuration

Upgrade the Dara Python packages together to compatible 2.0 releases using the repository's package manager. Check third-party component packages for Dara 2.0 support. Development and builds require Node >=22.12.0 and pnpm 12, even for Python-only applications.

Set the explicit configuration reference in each application's `pyproject.toml`, preserving unrelated settings:

```toml
[tool.dara]
config = "my_app.main:config"
```

Use the actual importable module and configuration object found in step 1. Every Dara app in a pnpm workspace must use the same Dara version and the workspace's root lockfile.

**Complete when:** the selected Python environment contains compatible packages, the JS toolchain is available, and each configuration reference identifies the existing application.

## 3. Migrate source and legacy settings

For applications with custom components, actions, authentication UI or setup code, follow [custom-javascript.md](custom-javascript.md). For repositories that publish component packages, also follow [packages.md](packages.md), including its packed-consumer check. Upgrade an external package to a compatible release; treat unavailable compatibility as an unresolved dependency.

Review every key in `dara.config.json`. Automatic conversion accepts `local_entry` pointing to `js/`, `package_manager` set to `pnpm`, `npm` or `yarn`, and string-valued `extra_dependencies`. It copies missing dependencies into `package.json`, preserves matching declarations across dependency sections, and reports conflicting requirements. Resolve conflicts deliberately using the application's actual compatibility requirements.

For another source directory, move owned application sources under `js/` and repair imports and asset references, then update `local_entry`. Translate custom HTML, script ordering and other legacy settings into module imports or supported Vite configuration as appropriate. Remove an obsolete setting only after its behavior has an explicit replacement or is confirmed unnecessary. Retain dependency settings until `dara lock` can copy them.

**Complete when:** every affected Python declaration selects a valid default-export implementation, setup and assets retain their behavior, and all remaining legacy configuration is understood by automatic conversion.

## 4. Update commands and deployment

| Legacy usage | Replacement |
| --- | --- |
| `dara start` for development, `--reload` or `--enable-hmr` | `dara dev` |
| Development debugging without reload | `dara dev --no-reload` |
| Separate public frontend port / `--dev-port` | One public origin via `dara dev --port` |
| `dara setup-custom-js` | Remove the step; normal preparation creates `js/index.tsx` |
| `dara start --production` or `--rebuild` | `dara build` during build/CI, then `dara start` at runtime |
| `dara start --skip-jsbuild` | `dara start` with an existing build |
| `dara start --docker` | `dara build`, then `dara start --require-sso` |

Classify each unflagged `dara start` by its purpose: production serving remains `dara start`; local development becomes `dara dev`. Preserve ports, host bindings, base URLs and environment handling where the new command supports them. Inspect `--help` for remaining options.

Deployment includes the complete `dist/` output, including hidden files. The runtime needs Python and the built output; Node and pnpm belong in the build stage. Enable API documentation explicitly with `--api-docs` when required.

**Complete when:** every command identified in step 1 has the intended development or deployment behavior, and the deployment copies the complete build artifact.

## 5. Prepare and verify

From each app root in its Python environment, run `dara lock`. The app must load with Dara 2.0 declarations before configuration conversion runs. Resolve import errors at their source and rerun.

Review the diff: `dara.config.json` should be removed once its dependencies are copied. Normal preparation creates missing frontend project files and reconciles Dara dependencies through the `dara` pnpm catalog. Preserve application dependencies and workspace policy. Review `pnpm-lock.yaml` before removing obsolete npm/Yarn lockfiles. Run `dara lock` again and verify that it produces no further migration changes.

Run `dara check`, the relevant application tests, and `dara build`. Exercise affected pages in `dara dev`: render custom components, update variables, invoke custom actions, and verify setup, authentication and static assets for each affected implementation. Start the built artifact with `dara start` and repeat the affected user flows. For a workspace, verify every affected app against the shared dependency resolution.

**Complete when:** repeated preparation is stable, checks and builds pass, and each affected implementation works in development and production. Report the changed contract and commands, files to commit, and verification evidence. If credentials, external packages or services prevent verification, identify the exact remaining check and report the migration as incomplete.
