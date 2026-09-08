import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { collectAssets, copyAssets } from "../src/assets.mjs";
import { inputSnapshot, verifySnapshot, publishBuild, recoverBuilds } from "../src/build.mjs";
import { digest } from "../src/contract.mjs";
import { fileHash, treeFiles } from "../src/files.mjs";
import { checkTypescript } from "../src/project.mjs";

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dara-freshness-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function write(root, file, text = file) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
  return target;
}
function completed(root, file, text) {
  const folder = path.join(root, file);
  const index = write(folder, "index.html", text);
  write(
    folder,
    ".dara-build.json",
    JSON.stringify({
      schema: 1,
      contract: {},
      contractDigest: digest({}),
      files: { "index.html": fileHash(index) },
    }),
  );
  return folder;
}

await test("interrupted publication restores the only complete backup and removes incomplete staging", (t) => {
  const root = fixture(t);
  completed(root, "dist.dara-backup-old", "previous");
  write(root, "dist.dara-staging-incomplete/partial.js");
  recoverBuilds(path.join(root, "dist"));
  assert.equal(fs.readFileSync(path.join(root, "dist/index.html"), "utf8"), "previous");
  assert.deepEqual(fs.readdirSync(root), ["dist"]);
});

await test("failed restoration preserves both builds and later recovery requires a choice", (t) => {
  const root = fixture(t);
  const output = completed(root, "dist", "previous");
  const staging = completed(root, "dist.dara-staging-new", "new");
  assert.throws(
    () =>
      publishBuild(staging, output, (from, to) => {
        if (from !== output) {
          throw new Error("open file handle");
        }
        fs.renameSync(from, to);
      }),
    /restore failed.*Recover previous output/,
  );
  assert.throws(() => recoverBuilds(output), /Recoverable output needs review/);
  assert.equal(fs.readdirSync(root).length, 2);
});

await test("valid published output permits cleanup while corrupt backups are retained", (t) => {
  const root = fixture(t);
  const output = completed(root, "dist", "current");
  completed(root, "dist.dara-staging-new", "new");
  write(root, "dist.dara-backup-unknown/index.html", "unverified");
  assert.throws(() => recoverBuilds(output), /Unverified backup retained/);
  assert.equal(fs.readFileSync(path.join(output, "index.html"), "utf8"), "current");
  assert.ok(fs.existsSync(path.join(root, "dist.dara-backup-unknown/index.html")));
});

await test("workspace additions, dependency patches, optional configuration and declared environment invalidate snapshots", (t) => {
  const root = fixture(t);
  write(root, "app/js/index.tsx");
  write(root, "library/js/button.tsx");
  write(root, "pnpm-lock.yaml");
  const patch = write(root, "patches/library.patch");
  write(root, "pnpm-workspace.yaml", "patchedDependencies:\n  library@1: patches/library.patch\n");
  const project = {
    root: path.join(root, "app"),
    workspace: root,
    inputs: [],
    sourceFiles: [],
    assets: new Map(),
    manifest: { static: [], appStatic: [] },
    api: { options: { environment: ["DARA_FRESHNESS_TEST"] } },
    workspacePackages: [{ root: path.join(root, "library"), sources: ["./js/button.tsx"] }],
  };
  const snapshot = inputSnapshot(project);
  verifySnapshot(snapshot);
  const added = write(root, "library/js/new.tsx");
  assert.throws(() => verifySnapshot(snapshot), /changed/);
  fs.unlinkSync(added);
  const config = write(root, "app/.env.production", "PUBLIC_COLOR=blue");
  assert.throws(() => verifySnapshot(snapshot), /changed/);
  fs.unlinkSync(config);
  process.env.DARA_FRESHNESS_TEST = "secret-value";
  assert.throws(() => verifySnapshot(snapshot), /environment.*changed/);
  assert.ok(!JSON.stringify(snapshot.environment).includes("secret-value"));
  delete process.env.DARA_FRESHNESS_TEST;
  fs.writeFileSync(patch, "changed");
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
  const preset = path.join(root, "preset");
  write(preset, "package.json", JSON.stringify({ name: "test-preset", tsconfig: "base.json" }));
  write(preset, "base.json", JSON.stringify({ compilerOptions: options }));
  fs.mkdirSync(path.join(root, "node_modules"));
  fs.symlinkSync(preset, path.join(root, "node_modules/test-preset"), "dir");
  const extra = write(root, "extra.json", '{ /* comment */ "compilerOptions": {"strict":true,}, }');
  write(root, "tsconfig.json", '{"extends":["test-preset", "./extra.json"], "include":["js"]}');
  const parsed = checkTypescript(root);
  assert.equal(parsed.config.compilerOptions.strict, true);
  assert.equal(parsed.hashes.get(extra), fileHash(extra));
  assert.equal(
    parsed.hashes.get(path.join(preset, "base.json")),
    fileHash(path.join(preset, "base.json")),
  );
});

await test("asset remapping detects additions, removals and ancestor collisions with emitted output", (t) => {
  const root = fixture(t);
  const source = path.join(root, "static");
  const file = write(source, "nested/a.woff2");
  const manifest = { static: [], appStatic: [source] };
  assert.equal(collectAssets(manifest).get("nested/a.woff2"), file);
  fs.unlinkSync(file);
  write(source, "nested/b.woff2");
  const assets = collectAssets(manifest);
  assert.equal(assets.has("nested/a.woff2"), false);
  const staging = path.join(root, "dist");
  write(staging, "nested", "Vite-generated file");
  assert.throws(() => copyAssets({ assets }, staging), /b.woff2.*generated output/);
});

await test("inventories follow internal links but refuse escaping and cyclic directories", (t) => {
  const root = fixture(t);
  write(root, "source/a.ts");
  fs.symlinkSync(path.join(root, "source"), path.join(root, "alias"), "dir");
  assert.deepEqual(
    treeFiles(root).map((file) => path.relative(root, file)),
    ["alias/a.ts", "source/a.ts"],
  );
  fs.symlinkSync(root, path.join(root, "source/cycle"), "dir");
  assert.throws(() => treeFiles(root), /Cyclic/);
});
