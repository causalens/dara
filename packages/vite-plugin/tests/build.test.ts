import { ProjectError } from "../dist/contract.js";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { buildProject } from "../dist/build.js";
import { version } from "../dist/contract.js";
import { initialize, loadProject } from "../dist/project.js";

const pluginRoot = fileURLToPath(new URL("..", import.meta.url));

function fixture(t: TestContext, sourceExports = false) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dara-build-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file: string, contents: string) => {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  };
  write(
    "package.json",
    JSON.stringify({ name: "test-app", type: "module", dependencies: { widgets: "workspace:*" } }),
  );
  write("pnpm-workspace.yaml", "packages:\n  - .\n  - packages/*\ncatalogs:\n  dara: {}\n");
  write("pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
  write(
    "node_modules/@darajs/core/package.json",
    JSON.stringify({
      name: "@darajs/core",
      type: "module",
      exports: { "./bootstrap": "./bootstrap.js" },
    }),
  );
  write(
    "node_modules/@darajs/core/bootstrap.js",
    "export default (registrations) => { globalThis.testComponents = registrations.components; };\n",
  );
  fs.symlinkSync(pluginRoot, path.join(root, "node_modules/@darajs/vite-plugin"), "dir");
  for (const name of ["widgets", "tokens"]) {
    const entry = sourceExports
      ? { "dara-source": "./src/index.js", default: "./dist/index.js" }
      : "./dist/index.js";
    write(
      `packages/${name}/package.json`,
      JSON.stringify({
        name,
        version: "1.0.0",
        type: "module",
        exports: { ".": entry },
        scripts: { build: "node build.mjs" },
        ...(name === "widgets" ? { dependencies: { tokens: "workspace:*" } } : {}),
      }),
    );
    write(
      `packages/${name}/src/index.js`,
      name === "widgets"
        ? "import token from 'tokens'; export default () => token;\n"
        : "export default 'dependency-value';\n",
    );
    write(
      `packages/${name}/build.mjs`,
      `import fs from 'node:fs';
${name === "widgets" ? "if (!fs.existsSync('../tokens/dist/index.js')) throw new Error('dependencies built out of order');" : ""}
fs.mkdirSync('dist', { recursive: true });
fs.copyFileSync('src/index.js', 'dist/index.js');
fs.appendFileSync('../../build-events', '${name}\\n');
`,
    );
    fs.symlinkSync(path.join(root, "packages", name), path.join(root, "node_modules", name), "dir");
  }
  // The compiler probe asserts pipeline ordering; actual TypeScript behavior has separate coverage.
  const nativeName = `@typescript/typescript-${process.platform}-${process.arch}`;
  write(
    "node_modules/typescript/package.json",
    JSON.stringify({
      name: "typescript",
      version: "7.0.2",
      optionalDependencies: { [nativeName]: "7.0.2" },
    }),
  );
  write(
    `node_modules/${nativeName}/package.json`,
    JSON.stringify({ name: nativeName, version: "7.0.2" }),
  );
  const executable = `node_modules/${nativeName}/lib/tsc`;
  write(
    executable,
    `#!${process.execPath}
const fs = require('node:fs');
if (!fs.existsSync('packages/widgets/dist/index.js')) process.exit(1);
fs.appendFileSync('build-events', 'typecheck\\n');
`,
  );
  fs.chmodSync(path.join(root, executable), 0o755);
  initialize(root);
  write(
    "vite.config.ts",
    "import dara from '@darajs/vite-plugin'; export default {plugins:[dara()]};\n",
  );
  const manifest = {
    schema: 1,
    configuration: "app.main:config",
    daraVersion: version,
    packageRequirements: [],
    moduleDependencies: [],
    components: [{ name: "Widget", source: "widgets" }],
    actions: [],
    auth: [],
    static: [],
    appStatic: [],
    favicon: null,
    outDir: "dist",
  };
  return { root, manifest, write };
}

await test("CLI project preparation accepts clean dependencies before a production build", async (t) => {
  const { root, manifest } = fixture(t);
  for (const operation of ["init", "check-project"]) {
    const result = spawnSync(
      process.execPath,
      [path.join(pluginRoot, "dist/cli.js"), operation, "--root", root],
      {
        input: JSON.stringify(manifest),
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(fs.existsSync(path.join(root, "build-events")), false);
  }
  const check = spawnSync(
    process.execPath,
    [path.join(pluginRoot, "dist/cli.js"), "check", "--root", root],
    {
      input: JSON.stringify(manifest),
      encoding: "utf8",
    },
  );
  assert.equal(check.status, 1);
  assert.equal(JSON.parse(check.stdout)[0].code, "source.unresolved");
});

for (const sourceExports of [false, true]) {
  await test(
    `production builds the complete dependency graph before resolution (${sourceExports ? "source" : "compiled"} exports)`,
    { skip: process.platform === "win32" },
    async (t) => {
      const { root, manifest } = fixture(t, sourceExports);
      const project = await loadProject(root, manifest, "build");
      await buildProject(project);
      assert.equal(
        fs.readFileSync(path.join(root, "build-events"), "utf8"),
        "tokens\nwidgets\ntypecheck\n",
      );
      assert.ok(fs.existsSync(path.join(root, "dist/.dara-build.json")));
      assert.ok(fs.existsSync(path.join(root, "dist/index.html")));
    },
  );
}

await test(
  "no-deps-build requires prebuilt compiled exports and never runs dependency scripts",
  { skip: process.platform === "win32" },
  async (t) => {
    const { root, manifest, write } = fixture(t);
    await assert.rejects(
      buildProject(await loadProject(root, manifest, "build"), { noDepsBuild: true }),
      (error) => error instanceof ProjectError && error.diagnostic?.code === "source.unresolved",
    );
    assert.equal(fs.existsSync(path.join(root, "build-events")), false);
    for (const name of ["tokens", "widgets"]) {
      write(
        `packages/${name}/dist/index.js`,
        fs.readFileSync(path.join(root, "packages", name, "src/index.js"), "utf8"),
      );
    }
    await buildProject(await loadProject(root, manifest, "build"), { noDepsBuild: true });
    assert.equal(fs.readFileSync(path.join(root, "build-events"), "utf8"), "typecheck\n");
    assert.ok(fs.existsSync(path.join(root, "dist/.dara-build.json")));
  },
);

await test("library overlap uses the configured root and plugin-resolved output", async (t) => {
  const { root, manifest, write } = fixture(t);
  for (const config of [
    "{ root: 'js', build: { outDir: '../dist' } }",
    "{ build: { outDir: 'dist-lib' }, plugins: [{ name: 'output', config() { return { build: { outDir: 'dist' } }; } }] }",
    "{ build: { outDir: 'dist/nested' } }",
    "{ build: { outDir: process.env.NODE_ENV === 'production' ? 'dist' : 'dist-lib' } }",
  ]) {
    write("vite.lib.config.ts", `export default ${config};\n`);
    for (const command of ["serve", "build"] as const) {
      await assert.rejects(
        loadProject(root, manifest, command),
        (error) => error instanceof ProjectError && error.diagnostic?.code === "workspace.output",
      );
      assert.equal(process.env["NODE_ENV"], command === "build" ? "production" : "development");
    }
  }
  write("vite.lib.config.ts", "export default { build: { outDir: 'dist-lib' } };\n");
  const project = await loadProject(root, manifest, "build");
  assert.ok(project.inputs.has(path.join(root, "vite.lib.config.ts")));
  assert.equal(fs.existsSync(path.join(root, "build-events")), false);
});
