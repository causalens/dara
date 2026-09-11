# CONTRIBUTING

## Getting Started

When contributing, please ensure that you know and understand which package your contribution affects.

## Setup

### Prerequisites

Install [mise](https://mise.jdx.dev/) and activate it for your shell, then run `mise install` from the repository root. This installs the pinned Python and uv versions from `mise.toml`/`mise.lock`.

### Python

#### Tools

This repository uses [uv](https://docs.astral.sh/uv/) for managing Python projects, organized as a uv workspace rooted at the top-level `pyproject.toml`. [mise](https://mise.jdx.dev/) provides the toolchain (Python, uv) and repository tasks.

#### Installation

To install dependencies for all python projects in this repository, run:

```bash
mise run uv-sync
```

This recreates the root `.venv` from `uv.lock` with every workspace package installed editable.

#### Running package scripts

To run a script for every Python package in this monorepo, use the root mise tasks: `mise run lint`, `mise run test`, `mise run format-check`, `mise run security-scan`, or `mise run package`.

To run scripts for individual packages, change directory to the package folder and run its task with `mise run <task>`. Tasks are defined in each package's `mise.toml` file.

### TypeScript

#### Tools

For TypeScript projects, [pnpm](https://pnpm.io/) and [lerna](https://github.com/lerna/lerna) are our chosen package managers.

#### Installation

Use the following command to install all dependencies.

```
mise run deps-project
```

#### Running Package Scripts

To run a script for every package in this monorepo, use `lerna run <script name>`, where `<script name>`, is the name of a script found in the `package.json` file of each package. The `mise run test-js` and `mise run prepare` tasks wrap the common cases.

To run scripts in an individual package, change directory to the package and use `pnpm run <script name>`.

## File Structure

- `tooling/`: Includes packages/scripts for assistance in the CI/CD process.
- `packages/`: This subfolder should include all of the individual packages within this mono-repo. Each of these packages can be individually published.
- `lerna.json`: Configuration file for the lerna build tool, this also includes the `version` number for all js packages.
- `package.json`: Base package.json file which defines paths to packages.
- `pnpm-lock.yaml`/`uv.lock`: Auto-generated lock file for pnpm and uv, respectively.
- `pnpm-workspace.yaml`: Yaml configuration for pnpm workspaces, this also includes the rules for discovering packages (in addition to `lerna.json`).
- `pyproject.toml`: Base configuration file for Python. This defines the uv workspace; member packages live in `packages/*/pyproject.toml`.
- `mise.toml`/`mise.lock`: Toolchain and task definitions, with a per-package `mise.toml` in each Python package.
- `tsconfig.json`: Base TypeScript configuration which can be extended by inner packages.

## Development Practice, Branches & Pull Requests

For this repository, Trunk Based Development is followed. Branches are created from and merged into the `master` branch. Versions of all of the packages are created by pushing a tag with a name that matches `VERSION*`.

For features/fixes that can be tested with unit or cypress tests, tests should be created as part of building the feature/fix. If a test case cannot be automated, then you should test manually and list the test cases tested.