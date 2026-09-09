# Frontend release verification

Run `mise run release-check` after installing the repository Python dependencies, Node >=22.12.0, pnpm 12 and the Cypress binary (`pnpm --dir packages/dara-core exec cypress install`). The command builds packages, packs real npm tarballs and Python wheels, and tests isolated consumers. It does not publish anything.

The fixture retains logs in the temporary directory printed at startup. To choose that directory, run `uv run --locked python tooling/scripts/check_frontend_release.py --browser --output /tmp/dara-release-check` after `mise run prepare`. The output directory must be empty. Omitting `--browser` runs the command, package-resolution and HTTP checks without Cypress.

The matrix covers:

- Two apps and a library's own app sharing a catalog and lockfile, source exports, independent builds, React interaction and HMR state preservation.
- Actual packed component, setup and bootstrap exports, with no source-only conditions or UMD files in the published packages.
- Required setup runs before components render, while unused exports remain unevaluated.
- Frozen checks and builds preserve dependency documents, exclude private credentials from Vite, and keep credentials and registry configuration out of deployed output.
- Python wheels installed into a fresh virtual environment, without generated UMD assets.
- Unmodified generator output, a migrated local component, a separate consumer of the packed library, and a JavaScript consumer with no Dara dependency.
- `dara build --output .release-output`, followed by copying that output into an artifact-only runtime and starting with an empty `PATH`.

`mise run package` builds the `dara-core` and `dara-components` wheels with `uv build` into the repository-root `dist/`, and `mise run publish-python` publishes from there. Each npm package uses its own `dist/`; keeping wheels out of package directories prevents a Python wheel from entering an npm tarball.

`mise run publish-npm` uses native pnpm publishing so the tarballs receive the same `publishConfig.exports` overrides as the release fixture's `pnpm pack` artifacts. It publishes sequentially in dependency order and skips versions already in the registry, allowing a failed release to resume. Run `mise run publish-npm -- --dry-run` to rehearse packing without uploading packages.

When bumping release versions, run `mise run lock-frontends` after both Python and npm metadata have changed. This reconciles the demo and Cypress app catalogs before the release commit. CI checks and production builds consume those committed files without repairing them.

A release integration should call `dara build --output <staging-directory>` with the app's checked-in frontend files and locked dependencies available. Copy the complete output, including `.dara-build.json`, into the runtime's `dist/`. Then run `dara start --config package.main:config`. The runtime requires Python and the compiled artifact; Node, pnpm, frontend source, Vite configuration and lockfiles can be omitted together. Asset transformations belong in build inputs so the output marker remains valid. `dara start` never repairs or rebuilds an artifact.
