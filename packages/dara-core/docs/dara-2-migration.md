---
title: Dara 2.0 migration guide
---

Dara 2.0 introduces a new development and build workflow. Start with automatic migration, then update your scripts and deployment steps.

## Upgrade and migrate

Upgrade your Dara Python packages together to 2.0, and check that any third-party Dara packages support it. Development and builds require Node.js >=22.12.0 and pnpm 12, including for apps without custom JavaScript.

From your application's root, in its Python environment, run:

```shell
dara lock
```

This migrates supported legacy configuration and custom JavaScript declarations, prepares the frontend files, and installs dependencies. It announces migration and reports any follow-up steps. `dara dev` also performs automatic migration when starting development.

If manual changes are needed, migration stops before editing source files and tells you what to change. Make those changes and rerun `dara lock`.

Review `git diff`, then validate and build:

```shell
dara check
dara build
```

Commit the migrated sources, generated project configuration and `pnpm-lock.yaml`.

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
