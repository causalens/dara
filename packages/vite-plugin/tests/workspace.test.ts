import { ProjectError } from "../dist/contract.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";
import { workspaceGraph } from "../dist/workspace.js";

function fixture(t: TestContext) {
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

await test("local links and relative workspace references must resolve to the declared directory", (t) => {
  const { root, app, library } = fixture(t);
  const other = path.join(root, "other");
  fs.cpSync(library, other, { recursive: true });
  fs.unlinkSync(path.join(app, "node_modules/widgets"));
  fs.symlinkSync(other, path.join(app, "node_modules/widgets"), "dir");
  for (const reference of ["link:../library", "workspace:../library"]) {
    fs.writeFileSync(
      path.join(app, "package.json"),
      JSON.stringify({ name: "app", dependencies: { widgets: reference } }),
    );
    assert.throws(
      () => workspaceGraph(app, root),
      (error) =>
        error instanceof ProjectError &&
        error.diagnostic.code === "workspace.target" &&
        error.message.includes(other),
    );
  }
});

await test("workspace aliases, dependency build tools, and absent optional packages follow pnpm's closure", (t) => {
  const { root, app, library } = fixture(t);
  const tooling = path.join(root, "tooling");
  fs.mkdirSync(path.join(library, "node_modules"));
  fs.mkdirSync(tooling);
  fs.writeFileSync(
    path.join(tooling, "package.json"),
    JSON.stringify({ name: "tooling", version: "1.0.0" }),
  );
  fs.symlinkSync(tooling, path.join(library, "node_modules/tooling"), "dir");
  fs.writeFileSync(
    path.join(library, "package.json"),
    JSON.stringify({
      name: "widgets",
      version: "1.2.0",
      devDependencies: { tooling: "workspace:*" },
      optionalDependencies: { absent: "workspace:*" },
    }),
  );
  fs.renameSync(path.join(app, "node_modules/widgets"), path.join(app, "node_modules/alias"));
  fs.writeFileSync(
    path.join(app, "package.json"),
    JSON.stringify({ name: "app", dependencies: { alias: "workspace:widgets@^1.0.0" } }),
  );
  assert.deepEqual(
    workspaceGraph(app, root).packages.map((entry) => entry.manifest.name),
    ["app", "widgets", "tooling"],
  );
});

await test("malformed sibling manifests fail at the manifest boundary", (t) => {
  const { root, app, library } = fixture(t);
  for (const fields of [
    { dependencies: [] },
    { devDependencies: { tool: 42 } },
    { optionalDependencies: null },
    { dependencies: { "../outside": "link:.." } },
  ]) {
    fs.writeFileSync(
      path.join(library, "package.json"),
      JSON.stringify({ name: "widgets", version: "1.2.0", ...fields }),
    );
    assert.throws(
      () => workspaceGraph(app, root),
      (error) =>
        error instanceof ProjectError &&
        error.diagnostic.code === "workspace.manifest" &&
        error.message.includes(path.join(library, "package.json")),
    );
  }
});
