## Repo Basics

- This is a Python 3.10 monorepo (supported range 3.10–3.12) managed by uv workspaces + mise. JavaScript packages are managed by pnpm + lerna.
- Python dependencies live in each package's `pyproject.toml` under the uv workspace rooted at the repo-level `pyproject.toml`. Do not edit `uv.lock` by hand - run `uv lock`.
- After changing dependencies or checking out the repo, run `mise run uv-sync` which installs everything into the root `.venv` from `uv.lock`.

## Commands

- `mise run uv-sync`: install/sync the workspace venv from `uv.lock`
- `mise run uv-lock-check`: verify `uv.lock` is up to date (CI runs this)
- `mise run lint` / `mise run format-check` / `mise run format`: Python lint/format across all packages
- `mise run test`: Python tests across all packages
- `mise run security-scan`: bandit across all packages
- `mise run lint-js` / `mise run format-js-check` / `mise run test-js`: JS equivalents
- `mise run prepare`: build all JS packages (needed before running a dara app or building wheels)
- `mise run bearer`: JS security scan
- Per-package tasks live in each package's `mise.toml`; run a single package with e.g. `mise //packages/dara-core:test` or from inside the package with `mise run test`

## Dara-Core Tests

For `dara-core` backend tests, run from the package directory so test env secrets are loaded correctly:

```bash
cd packages/dara-core
mise run test
```

Or run pytest directly with parallelism:

```bash
cd packages/dara-core
DARA_TEST_FLAG=true uv run --locked --package dara-core --group dev pytest tests -n auto
```

Prefer running with parallelism with `-n` to save time.

Running from repo root can miss `packages/dara-core/.env.test` and cause auth token mismatch failures.

## CI Validation

Before pushing or opening a PR, validate the CI checks relevant to your changes locally first.

- Python changes: run `mise run lint` and `mise run format-check` from the repo root.
- `dara-core` backend changes: also run the tests, e.g.:

```bash
cd packages/dara-core
mise run test
```

- JS changes: run `mise run lint-js` and `mise run format-js-check` from the repo root.
- If your change is broad or cross-cutting, prefer the same aggregate commands CI uses: `mise run test`, `mise run lint-js`, and `mise run format-js-check`.
- PR body linting is enforced by `.github/prace.yml`; when using the PR template, make sure all required checkboxes are checked before opening or updating the PR.

## Changelog

Before submitting a PR, make sure to update the `changelog.md` file for the relevant package.
New changes should ALWAYS be added to the top of the file, with a `## NEXT` section - this will be replaced by the release script with the appropriate version.

Example:

```markdown
## NEXT

- Fixed an issue where ...
- Added new ...
```

## Tools

- `mise` manages the toolchain (python, uv) and repository tasks; see `mise.toml` and `mise.lock`.
- `uv` manages Python packages and the lockfile (`uv.lock`).
- `pnpm` + `lerna` manage JavaScript packages (`pnpm-lock.yaml`, `lerna.json`).
- Wheels for the publishable Python packages build with `mise run package` and release from the tag-driven release workflow.