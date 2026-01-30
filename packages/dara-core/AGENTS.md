Use `pnpm` for scripts and package management.

Use `poetry` to run Python scripts.

Backend tests should be run with:

```bash
DARA_TEST_FLAG=True poetry run pytest <args>
```

DARA_TEST_FLAG disables the prometheus metrics server etc.
