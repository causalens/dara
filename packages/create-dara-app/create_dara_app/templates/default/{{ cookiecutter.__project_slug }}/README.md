# {{ cookiecutter.project_name }}

## How to run the app

If you use [mise](https://mise.jdx.dev/), run `mise install` once and then:

```bash
mise run dev
```

Otherwise, run the application with uv:

```bash
uv run dara start
```

For development purposes it is often useful to add the `--reload` flag which will automatically reload the application when changes are made to any of the Python files. `mise run dev` includes it; with plain uv add the flag yourself:

```bash
uv run dara start --reload
```

By default this will load the config from the `config` variable in `./{{ cookiecutter.__package_name }}/main.py` module.
To see the list of available config options you can use the `--help` flag:

```bash
uv run dara start --help
```

To see other available commands you can run:

```bash
uv run dara
```

To add new dependencies to the project:

```bash
uv add <package-name>
```

To recreate your environment from the lockfile (after pulling changes):

```bash
uv sync --locked --all-groups
```

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
