# Working on this Dara application

Run `dara dev` from this directory. It prepares missing frontend files, reconciles Dara dependencies and supervises Python, Vite and TypeScript behind one origin. Node >=22.12.0 and pnpm 12 are prerequisites; `mise install` installs the optional pinned tools.

Commit package.json, pnpm-workspace.yaml, pnpm-lock.yaml, vite.config.ts, tsconfig.json and js/index.tsx after preparation. Dara owns catalogs.dara and its required package references and engines. Preserve user settings elsewhere. Add application dependencies with pnpm.

Custom JS components and actions default-export their implementation from a file under js/. Their Python declaration sets js_source = './js/my-component.tsx'. Existing discovery and explicit config.add_component/config.add_action calls register them. js/index.tsx is for setup and global styles only. Keep using explicit useVariable and useAction hooks.

Run `dara check --json` for structured diagnostics. `dara lock` prepares changes without starting a server. `dara dev --frozen` reports dependency drift without repairing checked-in files. `dara build` requires frozen inputs and passing TypeScript checks; `dara start` serves the output without a JS toolchain.

For legacy applications, use the [dara-2-migration skill](https://github.com/causalens/dara/tree/master/skills/dara-2-migration) to update sources, configuration references and scripts first. Once the app loads, `dara lock` or `dara dev` converts understood `dara.config.json` settings and prepares dependencies. Resolve unknown settings and dependency conflicts manually. Review `git diff`, then run `dara check` and `dara build` and verify affected interactions. Frozen development never applies conversion; backend-only debugging skips frontend preparation.
