# {{ cookiecutter.project_name }}

## How to run the app

If you use [mise](https://mise.jdx.dev/), run `mise install` once to get Python, uv, Node and pnpm, then start development from this directory:

```bash
mise run dev
```

Otherwise install Node >=22.12.0 and pnpm 12 yourself and run the application with uv:

```bash
uv run dara dev
```

Dara checks for Node and pnpm but never installs them. The first run creates the frontend project and installs dependencies. Commit package.json, pnpm-workspace.yaml, pnpm-lock.yaml, vite.config.ts, tsconfig.json and js/index.tsx. Keep node_modules/ and dist/ ignored. Later runs reuse consistent dependency state. Project configuration lives in [tool.dara] in pyproject.toml.

By default this will load the config from the `config` variable in `./{{ cookiecutter.__package_name }}/main.py` module.
To see other available commands you can run:

```bash
uv run dara
```

## Building and deploying

Build deployment output with `uv run dara build`, then serve it with `uv run dara start` (or `mise run build-frontend` and `mise run run`). Build requires committed, consistent dependency files and passing TypeScript checks. The runtime needs only Python and the compiled output, without Node or pnpm. Start always uses deployment posture; use `--api-docs` to expose API documentation.

Run `uv run dara check --json` for diagnostics, or `uv run dara lock` to prepare dependency changes without starting development.

## Custom components

For custom components and actions, default-export the implementation under js/ and point the Python class at it with js_source. Use js/index.tsx for setup and global styles. Existing discovery and explicit registration keep their current roles.

## Migrating a legacy application

Use the [dara-2-migration skill](https://github.com/causalens/dara/tree/master/skills/dara-2-migration) to update sources, configuration references and scripts first. Once the app loads, `dara lock` or `dara dev` converts understood `dara.config.json` settings and prepares dependencies. Resolve unknown settings and dependency conflicts manually. Review `git diff`, then run `dara check` and `dara build` and verify affected interactions. Frozen development never applies conversion; backend-only debugging skips frontend preparation.

## Dependencies

To add new Python dependencies to the project:

```bash
uv add <package-name>
```

To recreate your environment from the lockfile (after pulling changes):

```bash
uv sync --locked --all-groups
```

Use pnpm directly for frontend dependencies. Dara owns only its named catalog and required references/engine constraints.

## Linting, type-checking and building

The project ships mise tasks for the common commands:

```bash
mise run lint          # ruff check
mise run format        # ruff format
mise run format-check  # verify Ruff formatting
mise run type-check    # pyright
mise run build         # build the wheel
mise run uv-lock-check # verify uv.lock is up to date
```

Each task runs through `uv run --locked`, so the locked environment is used consistently.
