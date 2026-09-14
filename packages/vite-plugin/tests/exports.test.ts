import type { DaraPlugin } from "../dist/project.js";
import { parseManifest, version, ProjectError } from "../dist/contract.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";
import { selfReference } from "../dist/exports.js";

function fixture(t: TestContext) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dara-exports-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const app = path.join(root, "app");
  fs.mkdirSync(app);
  return { root, app };
}

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

await test("self export selection agrees with Vite for condition order, arrays, sugar and explicit null", async (t) => {
  const { createServer } = await import("vite");
  const { app } = fixture(t);
  fs.mkdirSync(path.join(app, "js"));
  for (const name of ["source", "default", "browser", "production"]) {
    fs.writeFileSync(path.join(app, `js/${name}.js`), `export default ${JSON.stringify(name)};`);
  }
  const cases = [
    {
      source: "app/counter",
      exports: { "./counter": { default: "./js/default.js", "dara-source": "./js/source.js" } },
    },
    {
      source: "app/counter",
      exports: {
        "./counter": {
          browser: { production: "./js/production.js", default: "./js/browser.js" },
          "dara-source": "./js/source.js",
        },
      },
    },
    { source: "app", exports: { "dara-source": "./js/source.js", default: "./js/default.js" } },
    { source: "app/counter", exports: { "./counter": ["./js/source.js"] } },
    { source: "app/counter", exports: { "./counter": null, "./*": "./js/source.js" } },
  ];
  for (const example of cases) {
    const packageJson = { name: "app", type: "module", exports: example.exports };
    fs.writeFileSync(path.join(app, "package.json"), JSON.stringify(packageJson));
    const conditions = ["dara-source", "browser", "production"];
    const server = await createServer({
      root: app,
      configFile: false,
      logLevel: "silent",
      resolve: { conditions },
      server: { middlewareMode: true, watch: null, hmr: false },
      optimizeDeps: { noDiscovery: true, include: [] },
    });
    try {
      let resolved;
      try {
        const client = server.environments["client"];
        assert(client);
        resolved = await client.pluginContainer.resolveId(
          example.source,
          path.join(app, "js/index.tsx"),
        );
      } catch {
        assert.throws(
          () => selfReference(app, packageJson, example.source, [...conditions, "import"]),
          (error) => error instanceof ProjectError && error.diagnostic.code === "source.self",
        );
        continue;
      }
      assert(resolved);
      assert.equal(
        selfReference(app, packageJson, example.source, [...conditions, "import"]),
        resolved.id,
      );
    } finally {
      await server.close();
    }
  }
});

await test("the self hook retains Vite browser defaults and evaluates the active build mode", async (t) => {
  const { resolveConfig, createServer } = await import("vite");
  const { default: dara } = await import("../dist/index.js");
  const { app } = fixture(t);
  fs.mkdirSync(path.join(app, "js"));
  for (const mode of ["development", "production"]) {
    fs.writeFileSync(path.join(app, `js/${mode}.js`), `export default ${JSON.stringify(mode)};`);
  }
  const packageJson = {
    name: "app",
    exports: {
      "./counter": {
        browser: { development: "./js/development.js", production: "./js/production.js" },
      },
    },
  };
  const previous = process.env["NODE_ENV"];
  try {
    for (const command of ["serve", "build"] as const) {
      const mode = command === "serve" ? "development" : "production";
      process.env["NODE_ENV"] = mode;
      const plugins = dara();
      const config = await resolveConfig(
        { root: app, configFile: false, plugins, resolve: { conditions: ["application"] } },
        command,
      );
      assert(config.resolve.conditions.includes("application"));
      assert(config.resolve.conditions.includes("browser"));
      assert(config.resolve.conditions.includes("dara-source"));
      const plugin = config.plugins.find(
        (candidate): candidate is DaraPlugin => candidate.name === "dara:app",
      );
      assert(plugin);
      plugin.api.resolving = true;
      plugin.api.project = {
        root: app,
        workspace: app,
        packageJson,
        api: plugin.api,
        userConfig: {},
        config,
        configInputs: [],
        configHashes: new Map(),
        declaredSnapshot: { hashes: new Map(), trees: [], environment: {} },
        initialSnapshots: [],
        typescript: { path: path.join(app, "tsconfig.json"), config: {} },
        inputs: new Set(),
        sourceFiles: new Set(),
        initialHashes: new Map(),
        workspacePackages: [],
        assets: new Map(),
        state: "waiting",
        base: "/static/",
        manifest: parseManifest({
          schema: 1,
          configuration: "test",
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
        }),
      };
      const server = await createServer({
        root: app,
        configFile: false,
        plugins,
        mode,
        resolve: { conditions: ["application"] },
        logLevel: "silent",
        server: { middlewareMode: true, watch: null, hmr: false },
        optimizeDeps: { noDiscovery: true, include: [] },
      });
      try {
        const client = server.environments["client"];
        assert(client);
        const resolved = await client.pluginContainer.resolveId(
          "app/counter",
          path.join(app, "js/index.tsx"),
        );
        assert.equal(resolved?.id, path.join(app, `js/${mode}.js`));
      } finally {
        await server.close();
      }
    }
  } finally {
    if (previous === undefined) {
      delete process.env["NODE_ENV"];
    } else {
      process.env["NODE_ENV"] = previous;
    }
  }
});
