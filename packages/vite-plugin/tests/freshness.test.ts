import assert from "node:assert/strict";
import fs from "node:fs";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";
import { assetMiddleware, collectAssets, copyAssets } from "../dist/assets.js";
import { inputSnapshot, verifySnapshot } from "../dist/inputs.js";
import { publishBuild, recoverBuilds } from "../dist/publication.js";
import { digest, version, parseOptions } from "../dist/contract.js";
import { assertOutputSafe, snapshotDeclaredInputs, portableInputs } from "../dist/inputs.js";
import { fileHash, treeFiles } from "../dist/files.js";

function fixture(t: TestContext) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dara-freshness-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function write(root: string, file: string, text = file) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
  return target;
}
function completed(root: string, file: string, text: string) {
  const folder = path.join(root, file);
  const index = write(folder, "index.html", text);
  const contract = {
    schema: 1,
    daraVersion: version,
    packageRequirements: [],
    moduleDependencies: [],
    components: [],
    actions: [],
    auth: [],
    static: [],
  };
  write(
    folder,
    ".dara-build.json",
    JSON.stringify({
      schema: 1,
      daraVersion: version,
      workspaceRoot: ".",
      contract,
      contractDigest: digest(contract),
      inputs: [],
      directories: [],
      environment: {},
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
  const project: Parameters<typeof inputSnapshot>[0] = {
    root: path.join(root, "app"),
    workspace: root,
    inputs: [],
    sourceFiles: [],
    assets: new Map(),
    manifest: { static: [], appStatic: [] },
    api: { options: { environment: ["DARA_FRESHNESS_TEST"] } },
    workspacePackages: [
      {
        root: path.join(root, "library"),
        manifest: { exports: { "dara-source": "./js/button.tsx" } },
      },
    ],
  };
  const snapshot = inputSnapshot(project);
  verifySnapshot(snapshot);
  const added = write(root, "library/js/new.tsx");
  assert.throws(() => verifySnapshot(snapshot), /changed/);
  fs.unlinkSync(added);
  const config = write(root, "app/.env.production", "PUBLIC_COLOR=blue");
  assert.throws(() => verifySnapshot(snapshot), /changed/);
  fs.unlinkSync(config);
  process.env["DARA_FRESHNESS_TEST"] = "secret-value";
  assert.throws(() => verifySnapshot(snapshot), /environment.*changed/);
  assert.ok(!JSON.stringify(snapshot.environment).includes("secret-value"));
  delete process.env["DARA_FRESHNESS_TEST"];
  fs.writeFileSync(patch, "changed");
  assert.throws(() => verifySnapshot(snapshot), /changed/);
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

await test("incomplete marker schemas never authorize deletion of a valid backup", (t) => {
  const root = fixture(t);
  const output = completed(root, "dist", "current");
  const backup = completed(root, "dist.dara-backup-old", "previous");
  const markerFile = path.join(output, ".dara-build.json");
  const marker = JSON.parse(fs.readFileSync(markerFile, "utf8"));
  delete marker.inputs;
  fs.writeFileSync(markerFile, JSON.stringify(marker));
  assert.throws(() => recoverBuilds(output), /Recoverable output needs review/);
  assert.equal(fs.readFileSync(path.join(backup, "index.html"), "utf8"), "previous");
});

await test("recovery classifies sibling basenames before cleaning any output", (t) => {
  const root = fixture(t);
  const parent = path.join(root, "dist.dara-staging-parent");
  const output = completed(parent, "dist", "current");
  const staging = completed(parent, "dist.dara-staging-new", "new");
  const unknown = write(parent, "dist.dara-backup-unknown/index.html", "unverified");
  assert.throws(() => recoverBuilds(output), /Unverified backup retained/);
  assert.ok(fs.existsSync(staging));
  assert.ok(fs.existsSync(unknown));
});

await test("package-root source files use shallow inventories without traversing linked dependencies", (t) => {
  const root = fixture(t);
  write(root, "app/js/index.tsx");
  write(root, "library/index.ts");
  fs.mkdirSync(path.join(root, "library/node_modules"));
  fs.symlinkSync(path.join(root, "app"), path.join(root, "library/node_modules/app"), "dir");
  const project: Parameters<typeof inputSnapshot>[0] = {
    root: path.join(root, "app"),
    workspace: root,
    inputs: [],
    sourceFiles: [],
    assets: new Map(),
    manifest: { static: [], appStatic: [] },
    api: { options: {} },
    workspacePackages: [
      {
        root: path.join(root, "library"),
        manifest: { exports: { ".": { "dara-source": "./index.ts" } } },
      },
    ],
  };
  const snapshot = inputSnapshot(project);
  assert.equal(snapshot.trees.find((tree) => tree.directory.endsWith("library"))?.recursive, false);
  verifySnapshot(snapshot);
  write(root, "library/another.ts");
  assert.throws(() => verifySnapshot(snapshot), /changed/);
  project.workspacePackages = [
    {
      root: path.join(root, "library"),
      manifest: { exports: { "./*": { "dara-source": "./*.ts" } } },
    },
  ];
  assert.throws(() => inputSnapshot(project), /bounded source directory/);
});

await test("declarations parse at the boundary and output cannot replace declared input trees", (t) => {
  assert.throws(() => parseOptions({ inputs: "theme.json" }), /Expected array/);
  assert.throws(() => parseOptions({ environment: [true] }), /Expected string/);
  assert.deepEqual(parseOptions({}), { inputs: [], directories: [], environment: [] });
  const root = fixture(t);
  const project = {
    root,
    workspace: root,
    inputs: [],
    sourceFiles: [],
    manifest: { static: [], appStatic: [] },
    api: { options: { directories: ["themes"] } },
  };
  assert.throws(() => assertOutputSafe(project, path.join(root, "themes/dist")), /overlaps/);
  assertOutputSafe(project, path.join(root, "dist"));
});

await test("declared directory roots must exist as directories", (t) => {
  const root = fixture(t);
  write(root, "settings.json", "{}");
  for (const directory of ["settings.json", "missing"]) {
    assert.throws(
      () => snapshotDeclaredInputs(root, { directories: [directory] }),
      /does not exist or is not a directory/,
    );
  }
  fs.mkdirSync(path.join(root, "empty"));
  assert.deepEqual(snapshotDeclaredInputs(root, { directories: ["empty"] }).trees[0]?.files, []);
});

await test(
  "recursive input trees reject unsupported filesystem entries",
  { skip: process.platform === "win32" },
  (t) => {
    const root = fixture(t);
    const fifo = path.join(root, "named-pipe");
    const result = spawnSync("mkfifo", [fifo], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.throws(() => treeFiles(root), /Unsupported filesystem entry/);
  },
);

await test("asset identities take precedence over application roots and retain favicon fallback", (t) => {
  const root = fixture(t);
  const shared = path.join(root, "static");
  const project = {
    root,
    workspace: root,
    manifest: {
      static: [{ source: shared }],
      appStatic: [shared],
      favicon: path.join(root, "custom.ico"),
    },
  };
  assert.deepEqual(portableInputs(project, path.join(shared, "file.js")), [
    { root: "asset:0", path: "file.js" },
    { root: "appStatic:0", path: "file.js" },
  ]);
  assert.deepEqual(portableInputs(project, project.manifest.favicon), [
    { root: "favicon", path: "." },
  ]);
});

await test("static responses resolve MIME types and retain HEAD and unknown-type behavior", async (t) => {
  const root = fixture(t);
  const cases: [string, string][] = [
    ["module.mjs", "text/javascript"],
    ["image.AVIF", "image/avif"],
    ["data.csv", "text/csv"],
    ["font.woff2", "font/woff2"],
    ["payload.unknown-extension", "application/octet-stream"],
    ["no-extension", "application/octet-stream"],
  ];
  const assets = new Map(cases.map(([name]) => [name, write(root, name, "asset body")]));
  const middleware = assetMiddleware({ assets, base: "/dashboard/static/" });
  const server = createServer((req, res) =>
    middleware(req, res, () => {
      res.statusCode = 404;
      res.end();
    }),
  );
  t.after(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}/dashboard/static/`;
  for (const [name, type] of cases) {
    for (const method of ["GET", "HEAD"]) {
      const response = await fetch(base + name, { method });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("content-type"), type, name);
      assert.equal(response.headers.get("cache-control"), "no-cache");
      assert.equal(await response.text(), method === "HEAD" ? "" : "asset body");
    }
  }
});
