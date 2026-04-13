## Changelog

Before submitting a PR, make sure to update the `changelog.md` file for the relevant package.
New changes should ALWAYS be added to the top of the file, with a `## NEXT` section - this will be replaced by the release script with the appropriate version.

Example:

```markdown
## NEXT

- Fixed an issue where ...
- Added new ...
```

## Dara-Core Tests

For `dara-core` backend tests, run from the package directory so test env secrets are loaded correctly:

```bash
cd packages/dara-core
DARA_TEST_FLAG=True poetry run pytest <args>
```

Running from repo root can miss `packages/dara-core/.env.test` and cause auth token mismatch failures.

## CI Validation

Before pushing or opening a PR, validate the CI checks relevant to your changes locally first.

- Python changes: run `poetry anthology run lint` and `poetry anthology run format-check` from the repo root.
- `dara-core` backend changes: also run the relevant backend tests from `packages/dara-core`, e.g.:

```bash
cd packages/dara-core
DARA_TEST_FLAG=True poetry run pytest <args>
```

- JS changes: run `pnpm lerna run lint` and `pnpm lerna run format:check` from the repo root.
- If your change is broad or cross-cutting, prefer the same aggregate commands CI uses: `poetry anthology run test`, `pnpm lerna run lint`, and `pnpm lerna run format:check`.
- PR body linting is enforced by `.github/prace.yml`; when using the PR template, make sure all required checkboxes are checked before opening or updating the PR.
