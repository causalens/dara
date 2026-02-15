Before submitting a PR, make sure to update the `changelog.md` file for the relevant package.
New changes should ALWAYS be added to the top of the file, with a `## NEXT` section - this will be replaced by the release script with the appropriate version.

Example:

```markdown
## NEXT

- Fixed an issue where ...
- Added new ...
```

For `dara-core` backend tests, run from the package directory so test env secrets are loaded correctly:

```bash
cd packages/dara-core
DARA_TEST_FLAG=True poetry run pytest <args>
```

Running from repo root can miss `packages/dara-core/.env.test` and cause auth token mismatch failures.
