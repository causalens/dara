# Demo App

## Development

Install the Node and pnpm versions from `mise.toml` (`mise install` from this directory, or compatible tools on PATH), then run `uv run dara dev` from this directory. It prepares missing frontend files and runs Python, Vite and TypeScript behind one origin. Commit `package.json`, the root workspace catalog/lockfile and the app's Vite/TypeScript configuration after dependency changes.

The Custom JavaScript page uses `js/counter.tsx` and `js/increment.ts`. Python registers the classes with `js_source`, preserving the runtime names `DemoCounter` and `DemoIncrement`. The component calls `useVariable` and `useAction` explicitly; `js/index.tsx` is reserved for app-wide side effects. Editing a component uses React refresh; Python edits refresh the page after the backend is ready.

`uv run dara lock` prepares without starting servers. `uv run dara check --json` checks without repairing files. `uv run dara build` checks types and builds from the frozen lockfile; `uv run dara start` serves the artifact without Node or pnpm. For this source-linked monorepo, use `--no-deps-build` only after the repository's `prepare-dev` task has produced the supporting package outputs.

On hosts without native file watching, set `VITE_DEMO_POLLING=true` and `WATCHFILES_FORCE_POLLING=true`. The compiler falls back to checks triggered by Vite when its native watcher cannot start.

For an IDE debugger, launch `dara dev --no-reload`; Python stays in the debugger process. To run a separate frontend task, use `dara dev --frontend-only` alongside `dara dev --backend-only --no-reload`. Both commands must use this app root and matching `--base-url` values. `--frozen` prevents development from repairing committed files. `--no-typecheck` is a development-only escape hatch.

The default configuration is `demo_app.main:config`, set in `pyproject.toml`. The demo uses unauthenticated access by default; local OIDC QA is opt-in below.

## Local OIDC QA

Start the controllable provider from the repository root:

```bash
cd tools/local-oidc-provider
npm install --no-package-lock
npm start
```

In a second shell, source the demo-app env helper before starting the app. This sets `DARA_DEMO_AUTH=oidc` and the required `SSO_*` variables for the local provider:

```bash
cd packages/demo-app
source scripts/use-local-oidc.sh
uv run dara dev
```

For fish:

```fish
cd packages/demo-app
source scripts/use-local-oidc.fish
uv run dara dev
```

Use `--userinfo` with either helper to enable `SSO_USE_USERINFO=true`.
