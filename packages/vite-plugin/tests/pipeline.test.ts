import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TestContext } from "node:test";
import type { Manifest } from "../dist/contract.js";
import { test } from "node:test";
import { fileHash } from "../dist/files.js";
import { collectAssets } from "../dist/assets.js";
import { inputSnapshot, publishBuild, verifySnapshot } from "../dist/build.js";
import {
  generateEntry,
  parseManifest,
  parseOptions,
  sourcePackage,
  version,
} from "../dist/contract.js";
import { checkTypescript, initialize } from "../dist/project.js";

function fixture(t: TestContext) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dara-pipeline-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function manifest(overrides: Partial<Manifest> = {}): Manifest {
  return {
    schema: 1,
    configuration: "app.main:config",
    daraVersion: version,
    packageRequirements: [],
    moduleDependencies: [],
    components: [],
    actions: [],
    auth: [],
    static: [],
    appStatic: [],
    favicon: null,
    outDir: "dist",
    ...overrides,
  };
}

await test("manifest version and source syntax fail before resolution", () => {
  assert.throws(() => parseManifest({ ...manifest(), schema: 2 }), /schema/);
  assert.throws(() => parseManifest(manifest({ daraVersion: "0.0.0" })), /does not match/);
  for (const source of ["../secret", "./js/../../secret", "https://host/module", "@pkg/a/../b"]) {
    assert.throws(() => sourcePackage(source), /js_source/);
  }
  assert.equal(sourcePackage("@pkg/library/button"), "@pkg/library");
  assert.equal(sourcePackage("./js/button.tsx"), null);
});

await test("entry uses dedicated default imports and preserves serialized names", () => {
  const entry = generateEntry(
    parseManifest(
      manifest({
        components: [{ name: "__proto__", source: "./js/button.tsx" }],
        actions: [{ name: "ExistingAction", source: "@pkg/actions/action" }],
        auth: [{ name: "./js/login.tsx", source: "./js/login.tsx" }],
        moduleDependencies: [
          { python: "python_pkg", package: "@pkg/library", source: "@pkg/library/setup" },
        ],
      }),
    ),
  );
  assert.match(entry, /import implementation0 from "\/js\/button.tsx"/);
  assert.match(entry, /\["__proto__"\]: implementation0/);
  assert.match(entry, /import implementation2 from "\/js\/login.tsx"/);
  assert.match(entry, /auth: \{\["\.\/js\/login.tsx"\]: implementation2\}/);
  assert.match(entry, /import "@pkg\/library\/setup"/);
  assert.match(entry, /import '\/js\/index.tsx'/);
});

await test("initialization leaves existing code and configuration byte-identical", (t) => {
  const root = fixture(t);
  const custom = "// owned by the application\nexport default {};\n";
  fs.writeFileSync(path.join(root, "vite.config.ts"), custom);
  assert.deepEqual(initialize(root), ["tsconfig.json", "js/index.tsx"]);
  assert.deepEqual(initialize(root), []);
  assert.equal(fs.readFileSync(path.join(root, "vite.config.ts"), "utf8"), custom);
});

await test("static namespace collision names both competing registrations", (t) => {
  const root = fixture(t);
  const first = path.join(root, "a.js");
  const second = path.join(root, "b.js");
  fs.writeFileSync(first, "a");
  fs.writeFileSync(second, "b");
  assert.throws(
    () =>
      collectAssets(
        manifest({
          static: [
            { package: "python_pkg", source: first, target: "script.js" },
            { package: "python_pkg", source: second, target: "script.js" },
          ],
        }),
      ),
    (error) =>
      error instanceof Error && error.message.includes(first) && error.message.includes(second),
  );
});

await test("failed publication restores the previous output and retains staging", (t) => {
  const root = fixture(t);
  const output = path.join(root, "dist");
  const staging = path.join(root, "staging");
  fs.mkdirSync(output);
  fs.mkdirSync(staging);
  fs.writeFileSync(path.join(output, "index.html"), "previous");
  fs.writeFileSync(path.join(staging, "index.html"), "new");
  assert.throws(
    () =>
      publishBuild(staging, output, (from, to) => {
        if (from === staging) {
          throw new Error("rename failed");
        }
        fs.renameSync(from, to);
      }),
    /previous output was preserved/,
  );
  assert.equal(fs.readFileSync(path.join(output, "index.html"), "utf8"), "previous");
  assert.equal(fs.readFileSync(path.join(staging, "index.html"), "utf8"), "new");
});

await test("input snapshots catch additions and byte changes during compilation", (t) => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, "js"));
  fs.writeFileSync(path.join(root, "pnpm-lock.yaml"), "lock");
  const file = path.join(root, "js/index.tsx");
  fs.writeFileSync(file, "initial");
  const project = {
    root,
    workspace: root,
    inputs: new Set<string>(),
    sourceFiles: new Set<string>(),
    assets: new Map<string, string>(),
    manifest: manifest(),
    api: { options: parseOptions({}) },
  };
  const snapshot = inputSnapshot(project);
  verifySnapshot(snapshot);
  fs.writeFileSync(file, "changed");
  assert.throws(() => verifySnapshot(snapshot), /changed/);
  fs.writeFileSync(file, "initial");
  fs.writeFileSync(path.join(root, "js/added.ts"), "new");
  assert.throws(() => verifySnapshot(snapshot), /changed/);
});

await test("effective TS config follows JSONC, arrays and local package presets", (t) => {
  const root = fixture(t);
  const options = {
    moduleResolution: "bundler",
    jsx: "react-jsx",
    noEmit: true,
    isolatedModules: true,
    customConditions: ["dara-source"],
    types: ["vite/client"],
  };
  function write(directory: string, name: string, contents: string) {
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, name);
    fs.writeFileSync(file, contents);
    return file;
  }
  const preset = path.join(root, "preset");
  write(preset, "package.json", JSON.stringify({ name: "test-preset", tsconfig: "base.json" }));
  write(preset, "base.json", JSON.stringify({ compilerOptions: options }));
  fs.mkdirSync(path.join(root, "node_modules"));
  fs.symlinkSync(preset, path.join(root, "node_modules/test-preset"), "dir");
  const extra = write(root, "extra.json", '{ /* comment */ "compilerOptions": {"strict":true,}, }');
  write(root, "tsconfig.json", '{"extends":["test-preset", "./extra.json"], "include":["js"]}');
  const parsed = checkTypescript(root);
  assert.equal(parsed.config.compilerOptions?.strict, true);
  assert.equal(parsed.hashes.get(extra), fileHash(extra));
  assert.equal(
    parsed.hashes.get(path.join(preset, "base.json")),
    fileHash(path.join(preset, "base.json")),
  );
  fs.mkdirSync(path.join(root, "js"));
  write(root, "pnpm-lock.yaml", "lock");
  const snapshot = inputSnapshot({
    root,
    workspace: root,
    inputs: new Set(parsed.hashes.keys()),
    sourceFiles: new Set(),
    assets: new Map(),
    manifest: manifest(),
    api: { options: parseOptions({}) },
    initialHashes: parsed.hashes,
  });
  verifySnapshot(snapshot);
  fs.writeFileSync(extra, '{ "compilerOptions": { "strict": false } }');
  assert.throws(() => verifySnapshot(snapshot), /changed/);
});
