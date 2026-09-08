import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { selfReference, sourceExports, workspaceGraph } from "../src/workspace.mjs";

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dara-workspace-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const app = path.join(root, "app");
  const library = path.join(root, "library");
  fs.mkdirSync(path.join(app, "node_modules"), { recursive: true });
  fs.mkdirSync(path.join(library, "js"), { recursive: true });
  fs.writeFileSync(
    path.join(app, "package.json"),
    JSON.stringify({ name: "app", dependencies: { widgets: "workspace:^1.0.0" } }),
  );
  fs.writeFileSync(
    path.join(library, "package.json"),
    JSON.stringify({
      name: "widgets",
      version: "1.2.0",
      exports: { "./counter": { "dara-source": "./js/counter.ts", default: "./dist/counter.js" } },
    }),
  );
  fs.writeFileSync(path.join(library, "js/counter.ts"), "export default () => 42;");
  fs.symlinkSync(library, path.join(app, "node_modules/widgets"), "dir");
  return { root, app, library };
}

await test("workspace source resolves without prebuilt output and records the reachable graph", (t) => {
  const { root, app, library } = fixture(t);
  const graph = workspaceGraph(app, root);
  assert.deepEqual(
    graph.packages.map((entry) => entry.manifest.name),
    ["app", "widgets"],
  );
  assert.deepEqual(graph.packages[1].sources, ["./js/counter.ts"]);
  assert(graph.inputs.has(path.join(library, "package.json")));
  assert.equal(fs.existsSync(path.join(library, "dist")), false);
});

await test("local name and version mismatches identify the owning declaration", (t) => {
  const { root, app, library } = fixture(t);
  fs.writeFileSync(
    path.join(library, "package.json"),
    JSON.stringify({ name: "other", version: "1.2.0" }),
  );
  assert.throws(() => workspaceGraph(app, root), /widgets resolves to other/);
  fs.writeFileSync(
    path.join(library, "package.json"),
    JSON.stringify({ name: "widgets", version: "2.0.0" }),
  );
  assert.throws(() => workspaceGraph(app, root), /2.0.0 does not satisfy workspace/);
});

await test("file and link references cannot escape the repository", (t) => {
  const { root, app, library } = fixture(t);
  fs.writeFileSync(
    path.join(app, "package.json"),
    JSON.stringify({ name: "app", dependencies: { widgets: "link:../../../outside" } }),
  );
  assert.throws(() => workspaceGraph(app, root), /must target a file or package inside/);
  fs.writeFileSync(
    path.join(app, "package.json"),
    JSON.stringify({ name: "app", dependencies: { widgets: "file:../library" } }),
  );
  assert(workspaceGraph(app, root).inputs.has(path.join(library, "package.json")));
});

await test("self references prefer source, support explicit and pattern subpaths, and reject escaping targets", (t) => {
  const { app } = fixture(t);
  fs.mkdirSync(path.join(app, "js"));
  fs.writeFileSync(path.join(app, "js/counter.ts"), "export default 42;");
  const packageJson = {
    name: "app",
    exports: {
      "./*": { "dara-source": "./js/*.ts", types: "./dist/*.d.ts", default: "./dist/*.js" },
    },
  };
  assert.equal(selfReference(app, packageJson, "app/counter"), path.join(app, "js/counter.ts"));
  assert.equal(selfReference(app, packageJson, "other/counter"), null);
  assert.throws(
    () => selfReference(app, packageJson, "app/missing"),
    /missing or invalid app export/,
  );
  packageJson.exports["./*"]["dara-source"] = "../library/js/*.ts";
  assert.throws(
    () => selfReference(app, packageJson, "app/counter"),
    /missing or invalid app export/,
  );
});

await test("source export discovery handles nested conditions without changing the manifest", () => {
  const exports = {
    "./counter": { browser: { "dara-source": "./js/counter.ts" }, default: "./dist/counter.js" },
  };
  const before = JSON.stringify(exports);
  assert.deepEqual(sourceExports(exports), ["./js/counter.ts"]);
  assert.equal(JSON.stringify(exports), before);
});
