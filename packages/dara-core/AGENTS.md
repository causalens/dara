Use `pnpm` for scripts and package management.

Use `mise`/`uv` to run Python scripts and tests.

Backend tests should be run with:

```bash
mise run test
```

Or directly:

```bash
DARA_TEST_FLAG=True uv run --locked --package dara-core --group dev pytest <args>
```

DARA_TEST_FLAG disables the prometheus metrics server etc.

Important: run backend tests from `packages/dara-core` (this directory). `.env.test` is loaded relative to cwd; running from repo root can miss it and cause auth token mismatch failures.