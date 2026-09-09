---
title: Dara 2.0 migration guide
---

Dara 2.0 introduces a new development and build workflow. Update application sources and scripts first, then let Dara convert the remaining project settings.

## Upgrade and migrate

For an agent-assisted migration, point your coding agent at the [dara-2-migration skill](https://github.com/causalens/dara/tree/master/skills/dara-2-migration). You can also copy that entire folder, including its reference files, into your agent's skill directory. It covers application code, commands, custom packages and verification. The steps below summarize the same workflow for a manual migration.

Upgrade your Dara Python packages together to 2.0, and check that any third-party Dara packages support it. Development and builds require Node.js >=22.12.0 and pnpm 12, including for apps without custom JavaScript.

Set `[tool.dara] config = "my_app.main:config"` in the application's `pyproject.toml`, using your actual configuration reference. Update custom JavaScript declarations and commands as described below. The application must load with Dara 2.0 declarations before automatic conversion runs.

From your application's root, in its Python environment, run:

```shell
dara lock
```

This copies `extra_dependencies` from understood `dara.config.json` files into `package.json`, reports conflicting requirements, and removes the converted legacy file. It preserves existing dependency declarations and keeps old npm/Yarn lockfiles for review. Unknown settings or source directories need manual changes before conversion. `dara dev` performs the same conversion during preparation; frozen development reports required changes without applying them.

Preparation also creates missing frontend project files and installs dependencies. It does not rewrite Python or JavaScript sources, infer configuration entries, move directories or update scripts. Review `git diff`, then validate and build:

```shell
dara check
dara build
```

Exercise affected pages and interactions in development and with `dara start` serving the built output. Commit the migrated sources, generated project configuration and `pnpm-lock.yaml` after verification.

## Update commands and scripts

| Previously | Dara 2.0 |
| --- | --- |
| `dara start` for local development, or `dara start --reload` | `dara dev` |
| `dara start --enable-hmr` and a separate frontend server | `dara dev` runs both servers on one public port |
| `dara setup-custom-js` | Remove this step; `dara dev` prepares JavaScript support for every app |
| `dara start --production` or `dara start --rebuild` | Run `dara build`, then `dara start` |
| `dara start --skip-jsbuild` | `dara start`, with an existing build |
| `dara start --docker` | Run `dara build`, then `dara start --require-sso` to retain the SSO requirement |

Use `dara dev --port` to choose the application's port; `--dev-port` is no longer needed. For Python debugging without reload, use `dara dev --no-reload`.

## Common manual changes

- **Custom components and actions:** replace `js_module` / `js_component` with `js_source`, pointing to a default-export module such as `./js/chart.tsx`. Keep explicit registrations, removing `local=True`.
- **Setup and styles:** import application setup and global CSS from `js/index.tsx`. Replace custom HTML injection and script-ordering settings with module imports.
- **Dependencies:** dependencies from `dara.config.json` move to `package.json`. Resolve any reported version conflicts. Review the new pnpm lockfile before removing old npm or Yarn lockfiles.
- **Custom packages:** use a Dara 2.0-compatible release. Package authors should follow the [custom JavaScript guide](./advanced/custom-js.mdx) for exports, setup and static assets.

## Deploy

Build during CI or image creation, then run `dara start` with the complete `dist/` directory, including hidden files. The runtime needs only Python and the built output.

`dara start` always serves an existing build. Enable API documentation explicitly with `--api-docs` if needed.
