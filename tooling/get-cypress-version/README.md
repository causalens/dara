## Get Cypress Version

This is a simple CLI tool that collects the currently installed Cypress version from a given lockfile.
By default it assumes it's ran from the base folder so that it accesses the lockfile under `CWD/pnpm-lock.yaml`.
It accepts an optional `-l` or `--lockfile` param which overrides the `./pnpm-lock.yaml` relative path.

The CLI tries to access the version by parsing the YAML file and accessing `importers -> packages/cldp_core -> devDependencies -> cypress`.

Example usage:

```bash
# Ran from the root
./tooling/get-cypress-version/main.js
```

### Development

This package is using `esbuild` to bundle and minify the script into a single runnable.

After installing dependencies, to build the tool for CI use, run `npm run build` to create a single runnable `main.js` file.
