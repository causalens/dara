# create-dara-app

This is the CLI for creating Decision Apps with Dara.

## Installation

The CLI can be installed globally with `pip`:

```bash
pip install create-dara-app
```

Alternatively with the help of the `pipx` package you can install it in an isolated virtual environment and make it available just like any other global binary. You can skip the rest of this section if you are not interested in using `pipx`.

`pipx` installation instructions [are available here](https://pypa.github.io/pipx/installation/) but the short version is:

```bash
python3 -m pip install --user pipx
python3 -m pipx ensurepath
```

Note that you might need to restart your terminal after installing `pipx`. The `ensurepath` command adds necessary directories to your `PATH`, the changes might not be reflected in your terminal until you restart it.

To install the CLI globally with the `pipx` package, run the following command:

```bash
pipx install create-dara-app
```

You should see a message saying that the CLI has been installed successfully. Check that the CLI is available by running the following command:

```bash
>> create-dara-app --version
create-dara-app, version <version>
```

Later on the package can be updated by running:

```bash
pipx upgrade create-dara-app
```

## Running the CLI

The CLI can be invoked globally with the following command:

```bash
create-dara-app <command?>
```

The `command` argument is optional, if not specified the CLI will run the `bootstrap` command.

## Available commands

Currently available commands:

### bootstrap

Creates a new project in the specified directory.

```bash
create-dara-app bootstrap [OPTIONS] [DIRECTORY]
```

Note: this is the default command, the above is equivalent to calling

```bash
create-dara-app [OPTIONS] [DIRECTORY]
```

#### Options

- `DIRECTORY` - parent directory for the new project, defaults to `.` if not specified (which means the project will be generated in `./{project_name}`)
- `--debug` - enable debug logging
- `--no-install` - do not install dependencies after creating the project
- `--packaging` - choose the packaging tool to use when scaffolding your project. Accepts `poetry` or `pip`, defaults to `poetry`. If `poetry` is not installed, it display a warning and fall back to `pip`.

#### PIP setup

`pip` installation uses [PEP 660](https://peps.python.org/pep-0660/) `pyproject.toml`-based editable installation process. This requires the following:

- `pip >= 21.3`
- `setuptools >= 64.0.0`

Those dependencies can be upgraded with:

```bash
python -m pip install --upgrade pip
pip install --user --upgrade setuptools
```

## Running the CLI locally

For local development, the scripts can be run with `poetry`:

```bash
poetry run create-dara-app <command>
```
