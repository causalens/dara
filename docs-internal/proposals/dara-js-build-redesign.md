# Dara JS build redesign

Status: Draft

## Summary

Replace the generated `dist/` JS workspace, `dara.config.json`, the dependence on whatever Node is installed, and the UMD / auto-JS mode with one build pipeline that runs on a Dara-managed Node and pnpm.

The model:

- Dara downloads and caches one Node and one pnpm version and uses them for every app.
- Every app checks in `package.json` and `pnpm-lock.yaml` at its root. Nothing Dara-specific is checked in.
- Dara owns its own entries in those files and users refresh them with `dara lock`.
- An app with custom JS adds a source directory and uses the same `package.json` for its own tooling. There is no eject and no user-owned Vite config; the checked-in `package.json` is already the user's JS project.
- Missing lockfiles are created on first local run. `dara build` and CI install with a frozen lockfile and fail if anything is stale.
- `dara.config.json` goes away, with a staged migration.
- UMD / auto-JS mode goes away. Apps with and without custom JS build the same way.
- Python writes one file, `node_modules/.dara/manifest.json`. `@darajs/vite-plugin` reads it and produces everything in `dist/`, including `index.html`. Python serves `dist/`. There is no generated entrypoint, no Vite config on disk and no `fastapi_vite_dara`.

## Problems today

- Dara writes a throwaway JS workspace into `dist/` instead of using a stable one that either Dara or the user owns.
- Custom JS is wired in with `dara.config.json`, symlinks and a generated `package.json`, and the entry file and Vite config are produced by string replacement on templates.
- At runtime `fastapi_vite_dara` reads Vite's `manifest.json` back to emit script tags into a Jinja template, so the HTML is assembled by a second tool that has to agree with the first.
- Production and non-production builds take different paths because of the UMD / auto-JS split.
- There is no lockfile for the transitive npm graph, so two builds of the same commit can resolve different packages.
- Production builds use whatever Node happens to be on the machine.

## Non-goals

- Every Node target on day one.
- Changes to the Python component and action registration APIs.
- Pruning unrelated user dependencies from `package.json`.
- Lockfile formats other than pnpm's.
- A pip-only, no-download fallback for apps without custom JS. See the trade-off below.

## Accepted trade-off: zero config, not zero download

Today `dara start` with no flags serves UMD bundles shipped inside the Python wheels. No Node, no network beyond pip, any OS. Removing that path means the first run of any Dara app, including one with no custom JS, downloads the managed Node and pnpm into the global cache and runs `pnpm install` for `@darajs/*`, Vite, React and their dependencies.

We are accepting this knowingly:

- First run is slower and needs network access to Node, pnpm and npm artifact sources. A locked-down environment now needs a Node/pnpm mirror and an npm registry mirror on top of a pip mirror. `DARA_NODE_DOWNLOAD_URL` and `DARA_PNPM_DOWNLOAD_URL` cover the first, a root `.npmrc` covers the second.
- A platform without a managed Node target loses support outright, because there is no runtime-free mode anymore. That is why `win-x64` is in the initial target list even though CI does not run on Windows.
- Wheels shrink. The UMD bundles go away outright. `dara-components` also ships several MB of vendored Bokeh, Pixi and Plotly, which go away only if the bundling spike described under vendored libraries succeeds.

The promise to users is "zero configuration": no files to write, no tools to install. It is not "zero download". We are not adding a prebuilt fallback bundle to soften this, because the point is fewer code paths, not a different second path.

## Design

### 1. Managed Node and pnpm

Each `dara-core` release bakes in one exact Node version and one exact pnpm version. Exact pins, not ranges: a range would let two machines resolve different runtimes from the same `dara-core` release. The pins depend on nothing but the installed `dara-core`, so an app's Python lockfile pins `dara-core`, which pins the toolchain, and a macOS developer and Linux CI run the same Node and pnpm from the same commit with no extra file.

pnpm tracks the latest major at release time, v11 as of writing. pnpm 10 and later block dependency lifecycle scripts by default, which matters for a tool that runs installs unattended on developer machines. That default is not a blanket guarantee: the project's own scripts, a `.pnpmfile.cjs`, and anything a workspace lists under `allowBuilds` still run, and Dara treats those as trusted repository code rather than as something it protects against.

At runtime Dara maps the current platform to a target, resolves the toolchain from the global cache and downloads it if missing. Initial targets:

- macOS arm64
- macOS x64
- Linux x64 (glibc)
- Linux arm64 (glibc)
- Windows x64, best effort and not covered by CI

Cache layout:

- `${XDG_CACHE_HOME:-~/.cache}/dara/node/<version>/<target>/` on Linux and macOS
- `%LOCALAPPDATA%\dara\node\<version>\<target>\` on Windows

pnpm comes from the same cache. Dara downloads the standalone executable for the target (`pnpm-linux-x64`, `pnpm-macos-arm64`, `pnpm-win-x64.exe`) from the pnpm GitHub release into `.../dara/pnpm/<version>/<target>/`. Not `npm install -g pnpm`, not corepack. Both need Node first and neither can be pinned to a checksum the same way. Dara sets `PNPM_HOME` and the pnpm store directory to its own locations when it runs pnpm, so nothing depends on or leaks into a user-level pnpm setup.

Every toolchain and package-manager call uses `subprocess.run` with an argument list and a minimal explicit environment. No `os.system`, no shell strings.

#### Download integrity

The installed `dara-core` package is the only authority for versions and checksums. Checksums are captured at Dara release time from Node's signed `SHASUMS256.txt` and pnpm's release checksums, and shipped as static metadata in the wheel. Nothing in the app repository can override them. If a checked-in file were authoritative, a pull request to the app could swap a checksum and pair it with a download URL override in CI.

Downloads are verified and installed atomically. Download to a temporary file inside the cache root, verify the SHA-256, extract into a temporary directory, rename into `<version>/<target>/` in one step, then write a completion marker that includes the artifact digest. A directory without a marker counts as absent and is fetched again. Extraction uses a safe extractor that rejects absolute paths, `..` components, symlinks, hardlinks and special files. Cache directories are created owner-only. A file lock on the target directory stops two Dara processes (two apps, or `dara start` next to `dara dev`) from racing. In CI, the toolchain cache must not be shared between jobs on different sides of a trust boundary, for example untrusted pull-request builds and release builds; the cache key should include the job's trust level. Standard proxy and CA variables are honoured (`HTTPS_PROXY`, `SSL_CERT_FILE`, `REQUESTS_CA_BUNDLE`). The environments that need mirrors are the same ones with TLS-intercepting proxies.

#### Environment variables

- `DARA_TOOLCHAIN_CACHE_DIR` overrides the cache root. CI caches this path, or the default one, between runs. Build images can preseed it.
- `DARA_NODE_DOWNLOAD_URL` and `DARA_PNPM_DOWNLOAD_URL` are URL templates with `{version}` and `{target}` placeholders for environments that mirror the official artifacts. They change where Dara downloads from and nothing else. Version and checksum stay as pinned, and a mirror serving a different hash fails the build.
- `DARA_DISABLE_TOOLCHAIN_DOWNLOAD=1` restricts Dara to already-cached artifacts and fails with instructions if one is missing.

A pre-installed Node or pnpm on `PATH` is not an escape hatch, in CI or anywhere. Accepting it brings back the machine-dependent behaviour this redesign removes. An organisation that wants no public downloads in CI preseeds or restores the toolchain cache, using the URL overrides if needed.

### 2. Package registry and auth

Dara does not add a registry or auth setting to replace `dara.config.json`. Registry routing and authentication use the standard `.npmrc` at the app root:

```ini
@my-org:registry=https://npm.pkg.github.com/
//npm.pkg.github.com/:_authToken=${NPM_TOKEN}
```

Users check in `.npmrc` files with registry routes and environment-variable placeholders. Tokens come from the shell, CI secrets or the user's home `.npmrc`. Dara never writes a token into a project file. Dara runs pnpm from the app root so `.npmrc` discovery works, and when an install fails on a missing or invalid token the error names the `.npmrc` entry and the environment variable involved. Credentials are passed to pnpm only; the Vite build process does not receive them.

`@darajs/ai` and `@darajs/enterprise` live on a private registry, so any app using them needs registry auth for local development. Today auto-JS mode reads bundles from the wheels and needs none, so this is new. It is also a standard npm setup that organisations already have for other JS work, a `@darajs:registry=...` route and credential in the user-level `~/.npmrc` provisioned by whatever manages developer credentials. Dara's pnpm reads the user-level `.npmrc` like any other pnpm. The `create-dara-app` template ships the registry route line, never a token, so only the credential is left to the environment.

### 3. Checked-in files

Every app checks in two files at its root, `package.json` and `pnpm-lock.yaml`, and does not check in `dist/` or `node_modules/`. Both files are standard. There is no Dara-specific lockfile: everything Dara would put in one is either already in these two files or derivable from the installed Python packages at command time. The Node and pnpm pins come from `dara-core` (section 1), the required `@darajs/*` versions are the `dependencies`, drift between `package.json` and the lockfile is what `pnpm install --frozen-lockfile` rejects, and whether `dist/` matches the current configuration is the build marker's job (section 4).

Checking these in is what locks dependency resolution. Today `@darajs/*` versions come from the installed Python packages, but the transitive npm graph is resolved fresh on every build with no lockfile. Generating the JS files from the Python environment on the fly would keep that hole open. The checked-in `pnpm-lock.yaml` with integrity hashes is the fix, and it is the only reason these files exist in the repository at all. The guarantee is that two builds of one commit install the same packages with the same tools. It is not bit-identical output: the package map comes from importing the app's Python config, and native optional dependencies differ per platform.

Two consequences need documenting for users. Upgrading a `dara-*` Python package now means running `dara lock` and committing both files, in every app including ones with no custom JS. `dara dev` detects the mismatch and says so. `dara build` and CI fail on it. And dependency bots will find the root `package.json` and try to bump `@darajs/*` on their own, which produces immediate drift failures. The `create-dara-app` template ships Dependabot and Renovate configuration that ignores `@darajs/*` and the Dara-owned build tools, and the docs say `dara lock` is the only supported writer of those entries.

In every app Dara owns its entries in `package.json` (listed in section 5), the whole `pnpm-lock.yaml`, the entry and the bundler config. The last two are not files; the plugin provides them (section 4). Everything else in `package.json` belongs to the user. An app with no custom JS never needs to touch it and its users never run pnpm themselves. `dara dev` works from a Python app with no JS source files, `dara lock` refreshes both files, and the failure message from `dara build` is literally `run dara lock and commit package.json and pnpm-lock.yaml`.

### 4. One pipeline: Python writes a manifest, Vite does the rest

Every app builds through the same toolchain, and the boundary between the two sides is one file. Python knows what only Python can know: which `dara-*` packages are installed and what JS module each maps to, which components and actions the app registered, which static folders the configuration and the packages declare. It writes that to `node_modules/.dara/manifest.json`. `@darajs/vite-plugin` reads the file and produces everything in `dist/`, including the `index.html` template. Python renders that template and serves `dist/`. Nothing else crosses the boundary in either direction.

For comparison, today `js_utils.py` builds a `BuildCache`, generates `package.json`, `_entry.tsx` and `vite.config.ts` by string replacement on templates, symlinks the custom JS folder into `dist/` and `node_modules` back out, copies `tsconfig.json` and a favicon in, copies static folders and package assets in, shells out with `os.system`, writes `dist/_build.json`, and at request time `fastapi_vite_dara` reads Vite's `manifest.json` to emit `<script>` tags into `jinja/index.html`. Eleven steps, four generated files, and a runtime dependency whose only job is to read the bundler's output back. Under the redesign Python has three functions: write the manifest, run the toolchain, check the build marker.

#### The manifest

`dara lock`, `dara build`, `dara dev` and `dara start` all write it from the imported configuration. It is data, not code, and the plugin is its only reader.

It lives in `node_modules/.dara/` for the same reason Vite keeps its cache in `node_modules/.vite/`: it is tool-derived state that only means something next to the installed packages. It is ignored by every repository already, so migrating apps do not gain a `.gitignore` entry, pnpm leaves dot-directories it did not create alone, and there is no new top-level directory to explain. Python creates it before the first install. In a workspace the app has its own `node_modules`, so the path is unchanged.

It is not checked in. It contains absolute site-packages paths and reflects the installed Python environment, so it is machine-specific by construction and regenerated on every command. The build marker records a digest of the portable part only: `packages`, `components`, `actions` and `local`. The `static` paths are excluded, otherwise a laptop and CI would compute different digests for the same `dist/`.

```json
{
  "schema": 1,
  "daraVersion": "1.24.0",
  "packages": {
    "dara.core": "@darajs/core",
    "dara.components": "@darajs/components",
    "my_lib": "@scope/ui"
  },
  "local": { "entry": "./js/index.tsx" },
  "components": [{ "module": "dara.components", "export": "Button" }, { "module": "LOCAL", "export": "MyChart" }],
  "actions": [{ "module": "dara.core", "export": "NavigateTo" }],
  "static": [
    { "source": "./static", "dest": "." },
    { "source": "/…/site-packages/dara/components/_assets/static", "dest": "dara.components" }
  ],
  "favicon": "./static/favicon.ico",
  "outDir": "./dist"
}
```

`packages` is today's `package_map`. `components` and `actions` come from the registries and exist so the build can check them. `static` is `Configuration.static_folders` plus whatever the package static assets mechanism (below) returns, resolved to absolute paths by Python because only Python knows where site-packages is. `local` is null in an app with no custom JS.

#### What the plugin does with it

`dara()` reads the manifest at config time and fails with `run dara lock` if the `@darajs/*` versions in `package.json` disagree with `packages`. Then, hook by hook:

- `config`: `build.outDir` from the manifest, the React plugin with `jsxRuntime: 'classic'` (today the docs only imply it by telling users to import React in every file), `publicDir: false`, `build.manifest: false` because nothing reads it anymore, `resolve.dedupe: ['react', 'react-dom']` in place of the `overrides` field Dara writes into `package.json` today, `experimental.renderBuiltUrl` routing asset URLs through `window.__toDaraUrl` because the base URL is a runtime setting, and in serve mode the `/static/` `base` and `server.origin` that today live in a `scripts.dev` field. `rollupOptions.input` is the virtual entry.
- `resolveId` / `load` for the virtual entry: generated from `packages` and `local`, never written to disk.

  ```ts
  import daraCore from '@darajs/core';
  import * as core from '@darajs/core';
  import * as components from '@darajs/components';
  import * as LOCAL from '/abs/path/js/index.tsx';
  daraCore({ 'dara.core': core, 'dara.components': components, LOCAL });
  ```

  The imports are static on purpose. Today's entry maps each package to `() => import(...)`, but `run.tsx` awaits every importer before the first render, so nothing is deferred and the only effect is a waterfall: fetch the entry, execute it, discover the `import()` calls, then fetch the packages. Vite emits `modulepreload` hints for static imports, so the whole graph loads in parallel from HTML parse time. Tree-shaking is unaffected because components are looked up by name at runtime either way, and per-package browser caching across deploys is still available through `output.manualChunks` in the plugin if it turns out to matter. `daraCore` takes module namespaces, and `preloadComponents` / `preloadActions` in `run.tsx` go away.
- `generateBundle`: emits `index.html` from a template that ships inside the plugin package. It is today's `jinja/index.html` minus `{{ common_tags }}` and minus the `vite_hmr_client()` / `vite_asset()` calls. The plugin knows the entry chunk and its CSS from the bundle and writes the `<script type="module">`, `<link rel="stylesheet">` and `modulepreload` tags itself. The Jinja placeholders (`{{ dara_data|safe }}`, `{{ base_url }}`, `{{ static_url }}`) pass through verbatim because the plugin writes the file directly instead of going through Vite's HTML pipeline, which would otherwise try to resolve `<base href="{{ base_url }}">`.
- `buildEnd`: for each entry in `components` and `actions`, the resolved module's exports must contain the named export. A typo in `js_module` or a missing export in `LOCAL` fails `dara build` naming the Python class and the module it looked in, instead of a runtime "component not found" in the browser. Libraries that re-export with `export *` get a warning rather than a hard error, since Rollup reports those as a single `*` binding.
- `closeBundle`: copy `static[]` sources into `outDir/<dest>`, copy `favicon`, write `dist/.dara-build.json`. The plugin is the only thing that writes into `dist/`.
- `configureServer`: the `/__dara__/dev-server-info` middleware, plus `/__dara__/index.html` serving the same template with the `@vite/client` script, the React refresh preamble and the virtual entry URL. The manifest is a watched file, so when Python rewrites it (a package installed, a component registered) the virtual entry is invalidated and the page reloads.

The plugin is versioned in lockstep with `@darajs/core` and is one of the Dara-owned `package.json` entries. `dara build` and `dara dev` point Vite at the config shipped inside it; there is no Vite config in the app.

#### What Python keeps

- `write_manifest(config)`.
- `build()`: write the manifest, `pnpm install --frozen-lockfile`, `vite build`, both through the managed toolchain and both `subprocess.run` with argv lists.
- `check_fresh()`: the two staleness rules under build freshness below.
- Serving: mount `dist/` at `/static/`, render `dist/index.html` through Jinja with `dara_data`, `base_url` and `static_url` on the catch-all route. Under `--enable-hmr` the template is fetched from the dev server's `/__dara__/index.html` instead of disk, and the error when the dev server is not up says `run dara dev`. Today HMR mode does not depend on the dev server being up; it emits tags that 404. The new behaviour is stricter and the message is clearer.

Deleted from Python: `fastapi_vite_dara` as a dependency, `VITE_MANIFEST_PATH` and `VITE_STATIC_PATH`, `build_vite_template`, `build_common_tags`, `build_autojs_template`, `bundle_js`, `symlink_js`, `migrate_package_assets`, `migrate_static_assets`, `find_favicon`, the `scripts` and `overrides` fields of the generated `package.json`, `BuildCache` and `BuildCacheDiff`, both `_entry*.template.tsx`, `vite.config.template.ts`, `statics/tsconfig.json`, and `jinja/index.html` and `index_autojs.html`. The HTML template moves into the plugin package. The dev template and the production template are one string with two sets of tags, so they cannot drift.

#### On disk

An app with no custom JS has `package.json` and `pnpm-lock.yaml` and no JS source files. There is no `vite.config.ts` because the plugin ships it, no entry file because the entry is virtual, no `tsconfig.json` because the plugin sets the JSX transform, and no generated code because the only generated artifact is the manifest in `node_modules/.dara/`.

An app with custom JS adds a source directory, `js/` by default, and whatever tooling files its authors want (section 5). `dist/` and `node_modules/` are ignored in every app. Today `dist/` is a synthetic workspace and an output directory at the same time; here it is only output.

#### Build freshness

Today `dist/_build.json` records what the bundle was built from, and startup diffs it against the current configuration to decide whether to rebuild. Dropping it without a replacement would let `dara start` serve a bundle built before the last `dara lock`. So the plugin writes `dist/.dara-build.json` in `closeBundle` with the portable manifest digest, the `pnpm-lock.yaml` digest, the Dara version and a hash of the emitted files, and `dara build` runs Vite against a temporary output directory and swaps it into place atomically so a crashed build cannot leave a half-written `dist/`.

There are then two staleness checks, and they behave differently by context:

- `package.json` and `pnpm-lock.yaml` against the installed Python packages. Stale means someone upgraded a `dara-*` package without running `dara lock`, or edited `package.json` without reinstalling. The first is caught by comparing the `@darajs/*` entries with the Python versions, the second by `pnpm install --frozen-lockfile`. Neither is fixed automatically because the fix is a commit; every command fails and says `run dara lock`.
- `dist/.dara-build.json` against the manifest and `pnpm-lock.yaml`. Stale means the dependencies or the configuration moved and nobody rebuilt. Local interactive `dara start` and `dara dev` rebuild, the same way startup rebuilds today. `--skip-jsbuild`, `--docker` and `dara build`-in-CI never rebuild; they fail and name the mismatch.

Static folders are copied at build time now, not at every startup as `migrate_static_assets` does today, so editing a file under `static/` needs a rebuild. The manifest digest covers the static source list, and the build marker covers the emitted files, so the second check catches it locally.

### 5. Custom JS

Custom JS does not get its own JS project. Today `setup-custom-js` creates one because adding components meant taking over the build: a separate `package.json`, `node_modules`, entry and Vite config. In the new model the app already has a checked-in `package.json` (section 3), the entry is virtual and the bundler config is the plugin's, so there is nothing to take over. Custom JS is a source directory plus whatever the app's authors add to their `package.json`.

Adding custom components:

1. Create `js/index.tsx` and export components from it. Dara picks it up by convention, or `Configuration.js_entry` names a different directory. This is the `LOCAL` module the virtual entry imports (section 4).
2. Add tooling to `package.json` as in any JS project: `pnpm add -D typescript eslint prettier vitest`, a `tsconfig.json`, `scripts` for lint and test. Dara owns only its own entries, listed below, and leaves the rest alone.
3. Run `dara lock` after changing dependencies so the Dara-owned entries are re-checked and `pnpm-lock.yaml` is updated before `dara build` or CI.

`dara setup-custom-js` stays as the scaffold for step 1 and 2: it writes `js/index.tsx` with an empty export, a `tsconfig.json` with the classic JSX runtime for editor support, and runs `dara lock`. It stops creating `dara.config.json`.

There is no user-owned Vite config. Replacing the bundler is not a use case, and every Vite setting Dara has needed is framework contract rather than preference. If app-level bundler settings are needed later, the plugin can take options through the Python configuration; that is additive and needs no config file. The `daraCore(...)` wiring and the Vite integration are never user code, so their shape is never a compatibility surface.

The Dara-owned entries in `package.json` stay small:

- discovered `@darajs/*` runtime dependencies
- build tools Dara pins for the current Python version: `vite`, `@vitejs/plugin-react`, `@darajs/vite-plugin`
- `react` and `react-dom`, pinned to the supported major (see shared dependencies below)

Merge rules, applied by `dara lock` in every app:

- A missing Dara-owned dependency is added. `@darajs/*` runtime packages go to `dependencies`, build tools to `devDependencies`, so a manifest that is also a published library does not gain bundler tooling as a runtime dependency.
- A user value that is compatible with Dara's version is kept.
- A `workspace:`, `link:` or `file:` specifier on a Dara-owned dependency is accepted instead of a version. Before install, Dara resolves the path, requires it to be inside the repository or the declared workspace, and reads the target's `package.json` to check name and version. The source itself is in the same repository as the app, so it is reviewed and versioned with it.
- An incompatible user version fails with a precise error before anything is written.
- User dependencies are never removed.

#### Shared dependencies

The user's components import `react`, `react-dom` and `styled-components`, and they must get the same instance Dara's runtime uses or hooks and theming break. Today the generated `package.json` handles this with `overrides` on React. Two things replace that:

- `@darajs/*` libraries declare `react`, `react-dom` and `styled-components` as `peerDependencies`. `@darajs/core` currently lists React as a plain dependency, and under pnpm's isolated `node_modules` that gives it its own copy whenever the app's version differs. As peers they resolve to the app's single copy and pnpm errors when the app is outside the range. This is a library-side change that ships with the redesign.
- `react` and `react-dom` are Dara-owned entries in every app's `package.json`, pinned to the major Dara supports. A no-custom-JS app gets them from `dara lock`. A custom-JS app on `react: ^19` gets the incompatible-version error from the merge rules instead of a runtime hook error. `resolve.dedupe` in the plugin is the backstop for a nested dependency that still bundles its own React.

`@types/react` is the user's concern; `dara setup-custom-js` adds it to `devDependencies` because a TypeScript project with React components and no types is unusable. For an app that is also a published library, an existing `peerDependencies` entry satisfies a Dara-owned dependency, so `dara lock` does not add a second one under `dependencies`.

#### Apps that are also published libraries

Some apps publish their custom JS as an npm package so a sibling Dara app can use the same components by `js_module`. For example, a monorepo where one package is both a Dara app and a published `@scope/ui` library. Its root already has a `package.json` with `files`, `main` and `types`, a `vite.config.ts` for the library build, and a `tsconfig.json` with `outDir: ./dist`. Dara never reads a root `vite.config.ts`, so the library build config is not in the way. Two things still are:

- `static_files_dir` should not be `dist/` when `dist/` is the library output. Dara warns when the configured output directory is also referenced by `files` or `main` in `package.json`, and the docs recommend a separate directory for this layout.
- A sibling app in the same monorepo depends on the library with `workspace:*`, not a registry version that changes on every release.

Once auto-JS is gone these packages drop their UMD build, their `dara_assets` entrypoint and the `cp dist/umd -> _assets/auto_js` step. They ship ESM and types.

### 6. Workspace mode for monorepos

An app inside an existing pnpm workspace (a `pnpm-workspace.yaml` in a parent directory) joins that workspace. Isolating it with `--ignore-workspace` would give one manifest two lockfiles and silently drop the workspace's `pnpm-workspace.yaml` settings, such as `minimumReleaseAge`, `allowBuilds` and `blockExoticSubdeps`. Those are supply-chain controls the monorepo owner set on purpose.

Dara finds the workspace by walking up from the app root and then:

- treats the workspace root `pnpm-lock.yaml` as the lockfile of record and writes no app-level one
- runs pnpm from the app root with the workspace's own configuration, still with `--frozen-lockfile` in `dara build`
- records the digest of the whole root `pnpm-lock.yaml` in the build marker, not just the app's `importers:` entry, since integrity records, snapshots, overrides, catalogs and patches live elsewhere in the file. Any dependency change anywhere in the workspace therefore makes `dist/` stale.
- owns only the app's own entries in `package.json`; the shared lockfile belongs to the workspace, so `dara lock` runs a filtered install for the app rather than claiming the whole file
- keeps the emitted output at the app root and lets pnpm place `node_modules` as the workspace dictates

Dara's default pnpm configuration excludes `@darajs/*` from `minimumReleaseAge`, otherwise a same-day Dara release cannot install. A workspace that sets its own value wins.

#### Sibling libraries

`workspace:*` lets the app depend on a sibling package without publishing it, but it points at the package directory, not at built output. A library whose `main` is `dist/index.js` still has to be built before the app's Vite build can resolve it, and today's downstream CI does exactly that by hand before running Dara.

The preferred answer is to not need the build at all. The library declares a source condition in its `exports`:

```json
"exports": {
    ".": {
        "dara-source": "./js/index.tsx",
        "types": "./dist/index.d.ts",
        "default": "./dist/index.js"
    }
}
```

and `@darajs/vite-plugin` adds `dara-source` to `resolve.conditions`. The app then bundles the sibling from TypeScript source, HMR works across packages, and the published package is unaffected because npm consumers never see the condition. For libraries that cannot do this, `dara build` runs `pnpm --filter "<app>^..." run build` first, which builds the app's workspace dependencies in topological order, and `dara build --no-deps-build` skips it. Downstream monorepos migrating to the new model should adopt the source condition and drop their separate "build the library first" CI steps.

#### Which pnpm

If the workspace root `package.json` declares `packageManager: pnpm@<version>`, Dara honours it rather than fighting the repository. Verification cannot use the standalone GitHub executable here: the `+sha512.<hash>` suffix in that field is the hash of the pnpm npm tarball, not of any standalone binary. So in this case Dara downloads the pnpm npm tarball, verifies it against the suffix, extracts it into the toolchain cache, and runs it with the managed Node. A `packageManager` field without a hash is accepted only if the version matches Dara's own pinned pnpm; otherwise Dara fails and tells the user to add the hash (`corepack use pnpm@<version>` writes it). Dara runs pnpm with `manage-package-manager-versions=false` so pnpm does not download a second copy of itself. Outside a workspace, or without the field, Dara's own pinned standalone pnpm applies.

## Commands

All of them accept `--config <module:config>`. They import the app config to discover the package map, and apps with namespaced packages cannot rely on auto-discovery.

| Command | What it does |
| --- | --- |
| `dara lock` | Discover the required Dara JS dependencies, write the manifest, apply the merge rules to `package.json`, install with the managed pnpm, write `pnpm-lock.yaml`. |
| `dara dev` | Create missing lockfiles locally and print which files to commit. Validate toolchain and dependencies, write the manifest, run the dev server through the managed Node. Never rewrites the checked-in files except on that first local bootstrap. |
| `dara build --output <dir>` | Require `package.json` and `pnpm-lock.yaml` that agree with the installed Python packages. Write the manifest. `pnpm install --frozen-lockfile`. Run Vite; the plugin copies static assets and writes `index.html` and the build marker. Leave a self-contained output directory with no `node_modules` and no credentials in it. Used by CI and by the release action. |
| `dara setup-custom-js` | Section 5. Scaffold `js/index.tsx` and `tsconfig.json`, then `dara lock`. |

## Migration

Staged, not a flag day. Compatibility and Warn ship in minor releases. Enforce breaks downstream packages and any app still on `dara.config.json`, so it lands in a major.

### Compatibility

- If `dara.config.json` is present, Dara reads it as migration input only, and prefers the new files when they exist.
- `extra_dependencies` merge into `package.json` under the merge rules.
- `package_manager`: legacy `pnpm` keeps pnpm and gets a root `pnpm-lock.yaml`. Legacy `npm` or `yarn` moves to the managed pnpm the first time `dara lock` runs, with a message that the lockfile format is changing.
- `local_entry` becomes `local.entry` in the manifest, pointing at the same directory. No entry file is generated.

Existing app shapes:

- No custom JS: create `package.json` and `pnpm-lock.yaml`. Add `dist/` to `.gitignore` if missing. When a discovered `@darajs/*` package is not on the public registry, write the `@darajs:registry=` route into a root `.npmrc` (no credential) and, before installing, check that the credential the route needs is present in the environment, naming the variable in the error if it is not.
- A `package.json` already at the root: merge rules.
- Custom JS already present: the old `local_entry` directory becomes the `LOCAL` module as it is, so nothing moves. The dependencies from `dara.config.json` are merged into the root `package.json`.
- Inside a pnpm workspace: section 6.
- Custom JS also published as a library: section 5.

### Warn

- Legacy-only projects still work.
- Dara warns when `dara.config.json` is still the source of truth and points at `dara lock`.

### Enforce

- `dara.config.json` no longer participates in builds.
- `dara build` requires the two checked-in files.
- The UMD / auto-JS path and the deprecated internals listed below are removed.
- `--production` and `DARA_JS_REBUILD` are removed. `--skip-jsbuild` stays.

## What changes where

### CLI and environment

Today the user-facing interface is a set of flags on `dara start` plus environment variables read in `BuildConfig.from_env` and `rebuild_js`, and the build happens as a side effect of starting the server. The redesign separates building from serving, so each existing entry point needs a stated fate.

| Today | New model |
| --- | --- |
| `dara start` (no flags, auto-JS) | `dara start` serves the bundle in `dist/`. Locally, if `dist/` is missing or its build marker does not match the manifest and lockfile, it runs the managed build first (see build freshness in section 4). If `package.json` is stale against the installed Python packages, it fails and says to run `dara lock`. |
| `dara start --production` | `dara build` then `dara start`. `--production` is a no-op with a deprecation warning during the compatibility window. There is only one pipeline. |
| `DARA_PRODUCTION_MODE`, `DARA_HMR_MODE`, `DARA_DOCKER_MODE`, `SKIP_JSBUILD` set by the flags | Still set by the deprecated flags during the compatibility window. Downstream apps read them directly, for example to switch `static_files_dir` on `DARA_PRODUCTION_MODE` and serve assets packaged in a wheel. Programmatic callers such as `dara_cli.main([...])` get warnings, not errors. |
| `dara start --enable-hmr` + `dara dev` | Same pairing. `dara start --enable-hmr` serves from the Vite dev server, `dara dev` runs it. Both validate managed state instead of installing into `dist/`. |
| `dara start --skip-jsbuild` / `SKIP_JSBUILD=TRUE` | Kept, as the one flag meaning "never build". Requires a `dist/` whose build marker matches the manifest and lockfile, and fails otherwise instead of serving a stale bundle. |
| `dara start --docker` | Unchanged in meaning. It implies `--skip-jsbuild` and keeps its other effects, `DARA_REQUIRE_SSO` and hiding the API docs, which is why it is not folded into `--skip-jsbuild`. `dist/` comes from `dara build` at image build time. |
| `dara start --rebuild` / `DARA_JS_REBUILD=TRUE` | `dara build --force`. |
| `dist/_build.json` | Replaced by the manifest and the build marker `dist/.dara-build.json` described in section 4. |
| `manifest.json` in `dist/`, `VITE_MANIFEST_PATH`, `fastapi_vite_dara` | Gone. The plugin emits `dist/index.html` with the script tags in it. |
| `config.static_files_dir` | Still the output directory, default `dist/`. |
| `dist/tsconfig.json` copied from `statics/` | Not needed by the build; the plugin sets the JSX transform. `dara setup-custom-js` writes one at the app root for editor support. |

The `create-dara-app` template changes in the same release that ships `dara lock`. Its `.gitignore` ignores `package-lock.json` and `yarn.lock` but not `dist/`. The in-repo `packages/demo-app` has a `dara.config.json` and a `js/` folder and is where the migration flow gets tested first.

### Production builds and the release action

Every production deployment goes through `dara-release-action`, which never calls `dara start`. It runs three `dara-enterprise` commands: `cache-build-config` imports the app config and writes a `BuildCache` JSON, `collect-static` copies static folders, and `package` copies package assets, writes registry credentials into `<output>/.npmrc`, runs `bundle_js(copy_js=True)` and strips `node_modules`. The action copies the output into the image as `/var/app/dist` and starts the app with `dara start --docker`.

Those commands are thin wrappers over the internals this redesign removes (`BuildCache`, `BuildConfig`, `BuildMode`, `JsConfig.from_file`, `bundle_js`, `migrate_package_assets`), and nothing about them needs to live in `dara-enterprise`. `dara build` in core does the same work, so:

- `dara-enterprise cache-build-config`, `collect-static` and `package` become deprecated aliases that print the equivalent `dara build` call, then go away.
- `dara-release-action` calls `dara build` for asset compilation. It no longer needs `node` on the runner or the `~/.npm` cache mount. It caches `DARA_TOOLCHAIN_CACHE_DIR` and the pnpm store instead, keyed by trust level so pull-request and release jobs do not share a cache.
- Everything else the action does is unchanged and is outside this proposal: wheel builds, temporary asset embedding into wheels, prepared-bundle validation, post-assets hooks, and the prebuilt-assets flow where another job supplies the bundle. The only contract that changes is "how do I get a compiled asset directory": from three `dara-enterprise` commands to one `dara build --output`.
- Registry auth reaches the build as environment variables read by the checked-in `.npmrc` placeholders. The action stops writing `.npmrc` files. Its bundle validator keeps rejecting any `.npmrc`, symlink or special file in the output, and additionally scans for literal credential values; the structural check stays because it catches things a value scan cannot.
- The action's `dara-config-file` input, which staged a release-specific `dara.config.json` with `{{ version }}` substituted so a repository could pin its own published JS package to the release version, has no replacement. Rewriting a dependency version at release time cannot coexist with a frozen lockfile, and the monorepo case it served is covered by `workspace:*` (section 6).

So `dara-enterprise` and `dara-release-action` ship in lockstep with the Enforce phase, alongside `dara-components`.

### Deprecated internals

Removing the auto-JS path orphans code that only it used. None of it is documented for end users, but downstream Dara packages (`dara-components` and anything else with a `dara_assets` entrypoint) depend on it. It follows the same staging as the rest. Keep the fields so existing packages and apps still load, make them no-ops that warn when set, remove them at Enforce once downstream packages have shipped updates.

| Surface | Compatibility / Warn | Enforce |
| --- | --- | --- |
| `ConfigurationBuilder.template_extra_js`, `add_package_tag_processor` / `package_tag_processors` | Kept. Only `build_autojs_template` reads them, so they have no effect once auto-JS is gone. Setting them warns. | Removed. |
| `AssetManifest` (`autojs_assets`, `common_assets`, `tag_order`, `depends_on`, topo sort) and the `_assets/auto_js/` convention | Fields stay optional and the auto-JS parts are ignored. Packages may keep shipping the UMD files. `common_assets` still get copied to `/static/<pkg>/` so the runtime URL loaders in `dara-components` keep working. | `autojs_assets`, `tag_order`, `depends_on` and the tag-emitting code go. Downstream packages drop the `cp -R dist/umd/. dara/core/_assets/auto_js/` step and stop shipping UMDs. The static-file half is replaced by the package static assets mechanism below. |
| `BuildMode.AUTO_JS`, `_entry_autojs.template.tsx` | Kept while legacy-only projects still run on the old pipeline. | Removed. |
| `fastapi_vite_dara`, `jinja/index.html`, `jinja/index_autojs.html`, `build_vite_template` | Kept for the old pipeline. The new pipeline serves the `index.html` the plugin emitted. | Removed, and the dependency dropped. |
| `BuildConfig.npm_registry` / `npm_token` and the `.npmrc` template that wrote `_authToken` in plaintext into `dist/.npmrc` | Kept for the old pipeline. The new one never reads them and never writes tokens into project files. Setting them on the new pipeline warns and points at a root `.npmrc`. | Removed. This also closes the case where a Docker image that copies `dist/` ships the token in a layer. |

### Package static assets and vendored libraries

The `dara_assets` manifest exists because auto-JS mode could not bundle anything. Every third-party library had to be a `<script>` tag or a file fetched by URL at runtime. Most of the machinery (`tag_order`, `depends_on`, topo sort, `build_common_tags`, `build_autojs_template`) only orders script tags for a page without a bundler, and it goes with the auto-JS path.

What does not go on its own is the set of vendored libraries in `dara-components/_assets/common/`: BokehJS at the version of the installed Python `bokeh`, Pixi with its plugins, and Plotly. `plotting/bokeh/bokeh.tsx` and `plotting/plotly/plotly.tsx` load them by URL from `/static/dara.components/...`. That was a workaround for bundling problems with Pixi and Bokeh in the old setup, not a preference. Together with the UMDs they make up most of the 7.8 MB in the `dara-components` wheel.

The plan:

1. Try to bundle Bokeh, Pixi and Plotly as ordinary npm dependencies behind dynamic `import()`, so they become code-split chunks from the same build as everything else. For Bokeh, `dara lock` writes `@bokeh/bokehjs` at the installed Python `bokeh` version into `package.json`, using the same version derivation as `@darajs/*`. Test against the demo app's Bokeh, Plotly and causal graph pages. The outcome is uncertain and the redesign does not depend on it.

   Start by upgrading rather than retrying the same versions. The old bundling problems were hit on old releases. Bokeh is pinned to exactly `3.1.1` on both sides (2023), upstream is several minors ahead and has reworked its JS packaging since. Pixi may be a non-issue already. `pixi.js` 8.5 is a normal bundled dependency of `ui-causal-graph-editor`, not an external, and nothing in `dara-components/js` references the vendored `pixi*.js` files, so those look like leftovers that can be deleted without any bundling work. The vendored `plotly.js` 2.28 is behind as well.
2. Either way, replace `AssetManifest` with a minimal way for a package to contribute files to `/static/<pkg>/`: an entrypoint returning a directory or file list. Python writes the resolved paths into the manifest's `static` list and the plugin copies them into `dist/<pkg>/` at build time, with no tag emission or ordering. This is what `Configuration.static_folders` already gives apps, declared by a package instead. It stays as a permanent escape hatch for anything that cannot be bundled.
3. Depending on step 1: if bundling works, `dara-components` stops shipping the vendored files and Dara's own packages do not use the static mechanism. If it does not, the vendored files move onto the static mechanism unchanged and the existing URL loaders keep working.

#### Lazy loading heavy components

Bundling Bokeh behind `import()` is one instance of something worth doing across the board. The entry imports every package statically (section 4), so everything a package exports from its index is fetched at startup regardless of what the page shows. `@darajs/components` re-exports everything from one `index.tsx`, so that includes the causal graph editor, the plotting wrappers and the code editor whether or not the app uses them. Same for `@darajs/ai` and `@darajs/enterprise`.

Loading the package indexes eagerly is fine. What matters is what is inside them. A library replaces the static re-export of a heavy module with a lazy one:

```ts
// before
export { default as CausalGraphEditor } from './causal-graph';
// after
export const CausalGraphEditor = React.lazy(() => import('./causal-graph'));
```

The static export must go, otherwise Rollup keeps the module in the entry chunk and the lazy boundary does nothing. With it gone, Rollup follows the dynamic import through the ESM dependency and the app's Vite build emits a separate chunk with no app-side config. The package index, which is what startup fetches, is now small. The heavy chunk is fetched the first time the component renders, and `DynamicComponent` already wraps every rendered component in `Suspense` with the app's configured fallback (`shared/dynamic-component/dynamic-component.tsx`) and takes the component as a plain export from the module, so a `React.lazy` export needs nothing new on the Dara side. The user's `fallback=` and `suspend_render` settings apply to the chunk fetch for free.

This only becomes possible with the redesign. Under UMD a library-level `import()` is inlined into the single bundle, which is why the runtime URL loaders exist. ESM-only libraries after the auto-JS removal keep `import()` intact through to the app build.

Start with the heaviest: the causal graph editor (Pixi), the plotting components (Plotly, Bokeh), the code and markdown editors, and the AI chat components. One thing to keep in mind: actions are resolved from the same modules as plain functions, not through `Suspense`, so a heavy dependency inside an action is split with an `await import()` in the action body rather than `React.lazy`.

`dara-core` ships `jquery.min.js` as a common asset and emits a `<script>` tag for it in `index.html`. Nothing in Dara's JS references it. It has been there since the initial commit and is believed to be an implicit BokehJS dependency. Whether current BokehJS still needs it gets checked in the spike, by loading a Bokeh figure and a `DataTable` with the tag removed, before the tag is dropped.

## Alternative considered: Bun

Bun was the earlier option. One binary covers runtime, package manager and bundler, and the main appeal was never clashing with whatever Node a user has installed.

We stay on Node because a Dara-managed Node solves the clash just as well, the size saving from Bun is not big enough to decide the architecture, pnpm's shared store recovers most of the install-speed gap on repeat builds, and the current Vite and plugin ecosystem keeps working without changes. The cost is one extra artifact to manage, pnpm, and that is Dara-managed state rather than user setup. If the Node implementation turns out more awkward than expected, the same cache-and-resolve design can manage a Bun runtime instead.

## Open questions

- How long should `dara.config.json` keep working?
- Can Bokeh, Pixi and Plotly be bundled behind dynamic imports, or do they stay as vendored files on the package static assets mechanism?
- Does BokehJS still need the jQuery `<script>` tag?
- Should the plugin's component export check be a hard error for `export *` libraries too, by following `exportedBindings` one level, or is a warning enough?

## Implementation slices

Each slice is usable end to end before the next starts.

1. Managed app with no custom JS, the whole path. Node and pnpm resolution with checksum verification, atomic extraction and the global cache; the toolchain environment variables; `dara lock` writing `package.json` and `pnpm-lock.yaml`; React as a peer dependency of `@darajs/*`; the manifest in `node_modules/.dara/`; `@darajs/vite-plugin` with the virtual entry, the `index.html` template and the build marker, and `fastapi_vite_dara` dropped; `dara build` swapping the output atomically; `dara start` and `dara dev` serving it with the freshness checks. Tested on `create-dara-app` output. Replaces `os.system` with `subprocess.run` along the way.
2. Custom JS app. The `LOCAL` module, the merge rules, `dara setup-custom-js` as the scaffold, `dara.config.json` compatibility, the deprecation warnings for the old flags. Tested on `packages/demo-app`.
3. Production build and release action. `dara build --output` as the only compilation entrypoint, `dara-enterprise` build commands as deprecated aliases, `dara-release-action` switched over with trust-keyed caches. Tested on a no-custom-JS downstream app from a clean checkout.
4. Workspace mode. Root lockfile as the lockfile of record, the `dara-source` export condition in the plugin, `packageManager` handling, local-specifier checks. Tested on a monorepo where the app is also a published library.
5. Package static assets mechanism, the Bokeh/Pixi/Plotly bundling spike, the jQuery check, then `React.lazy` boundaries around the heaviest components in `@darajs/components`, `@darajs/ai` and `@darajs/enterprise`.
6. Remove the UMD / auto-JS path and the deprecated `AssetManifest` fields once every slice above is in use downstream.
