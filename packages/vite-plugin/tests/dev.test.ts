import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TestContext } from "node:test";
import type { HotPayload } from "vite";
import { createServer } from "vite";
import { errorMessage, ProjectError } from "../dist/contract.js";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { version } from "../dist/contract.js";
import { initialize, loadProject } from "../dist/project.js";

const pluginRoot = fileURLToPath(new URL("..", import.meta.url));

function fixture(t: TestContext) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dara-dev-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "node_modules/@darajs/core"), { recursive: true });
  fs.mkdirSync(path.join(root, "node_modules/.dara"));
  fs.symlinkSync(pluginRoot, path.join(root, "node_modules/@darajs/vite-plugin"), "dir");
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "test-app", type: "module" }),
  );
  fs.writeFileSync(path.join(root, "pnpm-workspace.yaml"), "catalogs:\n  dara: {}\n");
  fs.writeFileSync(
    path.join(root, "node_modules/@darajs/core/package.json"),
    JSON.stringify({
      name: "@darajs/core",
      type: "module",
      exports: { "./bootstrap": "./bootstrap.js" },
    }),
  );
  fs.writeFileSync(
    path.join(root, "node_modules/@darajs/core/bootstrap.js"),
    "export default () => {};\n",
  );
  initialize(root);
  const manifest = {
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
  };
  fs.writeFileSync(
    path.join(root, "node_modules/.dara/manifest.dev.json"),
    JSON.stringify(manifest),
  );
  return { root, manifest };
}

function configure(root: string, value: string) {
  fs.writeFileSync(
    path.join(root, "vite.config.ts"),
    `
import dara from '@darajs/vite-plugin';
const value = ${JSON.stringify(value)} + '-' + process.env["NODE_ENV"];
export default {
  plugins: [dara(), { name: 'test-probe', configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if (request.url === '/static/probe') response.end(value);
      else next();
    });
  }}],
  define: { APP_POSTURE: JSON.stringify(process.env["NODE_ENV"]) },
};
`,
  );
}

async function until<T>(read: () => T | Promise<T>, description: string): Promise<NonNullable<T>> {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const result = await read();
    if (result) {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

await test("a manifest that registers a new source restarts Vite so dependency scanning covers it", async (t) => {
  const { root, manifest } = fixture(t);
  configure(root, "sources");
  fs.mkdirSync(path.join(root, "js"), { recursive: true });
  fs.writeFileSync(path.join(root, "js/widget.tsx"), "export default () => null;\n");
  const manifestFile = path.join(root, "node_modules/.dara/manifest.dev.json");
  const child = spawn(
    process.execPath,
    [path.join(pluginRoot, "dist/cli.js"), "serve", "--root", root, "--no-typecheck"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let logs = "";
  child.stdout.on("data", (chunk) => (logs += chunk));
  child.stderr.on("data", (chunk) => (logs += chunk));
  const exited = once(child, "exit");
  const statusFile = path.join(root, "node_modules/.dara/dev-server.json");
  const status = () =>
    fs.existsSync(statusFile) ? JSON.parse(fs.readFileSync(statusFile, "utf8")) : undefined;
  try {
    const first = await until(
      () => status()?.state === "ready" && status(),
      `initial server: ${logs}`,
    );
    fs.writeFileSync(manifestFile, JSON.stringify(manifest));
    await until(
      () => fs.statSync(statusFile).mtimeMs > fs.statSync(manifestFile).mtimeMs && status(),
      "unchanged sources are refreshed in place",
    );
    assert.equal(status().origin, first.origin, "same source set keeps the Vite server");
    fs.writeFileSync(
      manifestFile,
      JSON.stringify({ ...manifest, components: [{ name: "Widget", source: "./js/widget.tsx" }] }),
    );
    const second = await until(
      () => status()?.state === "ready" && status().origin !== first.origin && status(),
      `restart after a new registered source: ${logs}`,
    );
    assert.notEqual(second.origin, first.origin);
  } finally {
    child.kill("SIGTERM");
    await exited;
  }
});

await test("configuration validation keeps each operation's NODE_ENV posture", async (t) => {
  const { root, manifest } = fixture(t);
  configure(root, "posture");
  for (const command of ["build", "serve"] as const) {
    const project = await loadProject(root, manifest, command);
    const production = command === "build";
    assert.equal(project.config.isProduction, production);
    assert.equal(
      project.userConfig.define?.["APP_POSTURE"],
      JSON.stringify(production ? "production" : "development"),
    );
    assert.equal(process.env["NODE_ENV"], production ? "production" : "development");
  }
});

await test("JavaScript plugin options are parsed before configuring the project", async (t) => {
  const { root, manifest } = fixture(t);
  for (const options of [
    "null",
    "{ inputs: 42 }",
    "{ environment: [false] }",
    "{ input: ['data.json'] }",
  ]) {
    fs.writeFileSync(
      path.join(root, "vite.config.ts"),
      `import dara from '@darajs/vite-plugin';\nexport default { plugins: [dara(${options})] };\n`,
    );
    await assert.rejects(
      loadProject(root, manifest),
      (error: unknown) => error instanceof ProjectError && error.diagnostic.code === "vite.options",
    );
  }
});

await test("effective TypeScript options are parsed after config inheritance", async (t) => {
  const { root, manifest } = fixture(t);
  fs.copyFileSync(path.join(pluginRoot, "tsconfig.json"), path.join(root, "tsconfig.preset.json"));
  fs.writeFileSync(
    path.join(root, "tsconfig.json"),
    JSON.stringify({
      extends: "./tsconfig.preset.json",
      compilerOptions: { noEmit: false, customConditions: [], types: [] },
      include: ["js"],
    }),
  );
  await assert.rejects(loadProject(root, manifest), (error: unknown) => {
    assert.ok(error instanceof ProjectError);
    assert.equal(error.diagnostic.code, "typescript.config");
    for (const option of ["noEmit", "customConditions", "types"]) {
      assert.match(error.message, new RegExp(option));
    }
    return true;
  });
});

await test("Vite discovers nested dependencies for arbitrary registered package sources", async (t) => {
  const { root, manifest } = fixture(t);
  fs.writeFileSync(
    path.join(root, "vite.config.ts"),
    "import dara from '@darajs/vite-plugin';\nexport default { plugins: [dara()] };\n",
  );
  const providers = ["@darajs/enterprise", "@acme/widgets"];
  const dependencies: Record<string, string> = {};
  const components = providers.map((provider, index) => {
    // Glob metacharacters must remain literal when passed to Vite's entry scanner.
    const directory = path.join(root, `provider[${index}]`);
    const dependency = `@vendor/formatter-${index}`;
    const nested = path.join(directory, "node_modules", dependency);
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(
      path.join(nested, "package.json"),
      JSON.stringify({ name: dependency, main: "index.cjs" }),
    );
    fs.writeFileSync(path.join(nested, "index.cjs"), `exports.label = 'provider-${index}';\n`);
    fs.writeFileSync(
      path.join(directory, "package.json"),
      JSON.stringify({
        name: provider,
        version: "1.0.0",
        type: "module",
        exports: { "./widget": { "dara-source": "./widget.tsx", default: "./dist/widget.js" } },
        dependencies: { [dependency]: "1.0.0" },
      }),
    );
    fs.writeFileSync(
      path.join(directory, "widget.tsx"),
      `import { label } from '${dependency}';\nexport default function Widget() { return label; }\n`,
    );
    const installed = path.join(root, "node_modules", provider);
    fs.mkdirSync(path.dirname(installed), { recursive: true });
    fs.symlinkSync(directory, installed, "dir");
    dependencies[provider] = "workspace:*";
    return { name: `Widget${index}`, source: `${provider}/widget` };
  });
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "test-app", type: "module", dependencies }),
  );
  const project = await loadProject(root, { ...manifest, components });
  project.state = "ready";
  const server = await createServer({
    ...project.userConfig,
    root,
    configFile: false,
    logLevel: "silent",
    server: { middlewareMode: true, watch: null, hmr: false },
    optimizeDeps: { holdUntilCrawlEnd: false },
  });
  try {
    const optimizer = server.environments["client"]?.depsOptimizer;
    assert.ok(optimizer);
    const entry = await server.transformRequest("/@dara/entry");
    assert.ok(entry);
    await optimizer.scanProcessing;
    await until(
      () =>
        providers.every(
          (_provider, index) => optimizer.metadata.optimized[`@vendor/formatter-${index}`],
        ),
      "nested dependency prebundling",
    );
    for (const provider of providers) {
      assert.ok(
        project.sourceFiles.has(
          fs.realpathSync(path.join(root, "node_modules", provider, "widget.tsx")),
        ),
      );
    }
    assert.match(entry.code, /Widget0/);
    assert.match(entry.code, /Widget1/);
  } finally {
    await server.close();
  }
});

await test("development reloads configuration, recovers from errors and protects private state", async (t) => {
  const { root } = fixture(t);
  configure(root, "first");
  const child = spawn(
    process.execPath,
    [path.join(pluginRoot, "dist/cli.js"), "serve", "--root", root, "--no-typecheck"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let logs = "";
  child.stdout.on("data", (chunk) => {
    logs += chunk;
  });
  child.stderr.on("data", (chunk) => {
    logs += chunk;
  });
  const exited = once(child, "exit");
  const statusFile = path.join(root, "node_modules/.dara/dev-server.json");
  const status = () =>
    fs.existsSync(statusFile) ? JSON.parse(fs.readFileSync(statusFile, "utf8")) : undefined;
  try {
    const first = await until(
      () => status()?.state === "ready" && status(),
      `initial server: ${logs}`,
    );
    assert.equal(await (await fetch(first.origin + "/static/probe")).text(), "first-development");
    const clientSource = await (await fetch(first.origin + "/static/@vite/client")).text();
    const wsToken = clientSource.match(/const wsToken = "([^"]+)"/)?.[1];
    assert(wsToken);
    const socket = new WebSocket(
      first.origin.replace("http:", "ws:") + "/static/@dara/hmr?token=" + wsToken,
      "vite-hmr",
    );
    const messages: HotPayload[] = [];
    socket.addEventListener("message", (event) => messages.push(JSON.parse(event.data)));
    await once(socket, "open");
    fs.writeFileSync(path.join(root, "node_modules/.dara/backend-ready.json"), "{}");
    await until(
      () => messages.some((message) => message.type === "full-reload"),
      "backend reload through HMR websocket",
    );
    socket.close();
    for (const suffix of ["", "?raw", "?url"]) {
      for (const file of ["index.dev.html", "dev-server.json", "manifest.dev.json"]) {
        for (const request of [
          `/static/node_modules/.dara/${file}`,
          `/static/node_modules/%2edara/${file}`,
          `/static/node_modules%5c.dara%5c${file}`,
          `/static/@fs/${root}/node_modules/.dara/${file}`,
        ]) {
          const response = await fetch(first.origin + request + suffix);
          assert.equal(response.status, 404, request + suffix);
        }
      }
    }
    assert.equal((await fetch(first.origin + "/static/js/index.tsx")).status, 200);
    configure(root, "second");
    await until(async () => {
      const current = status();
      if (current?.state !== "ready") {
        return false;
      }
      try {
        return (
          (await (await fetch(current.origin + "/static/probe")).text()) === "second-development"
        );
      } catch {
        return false;
      }
    }, "configuration reload");
    fs.writeFileSync(path.join(root, "vite.config.ts"), "export default { invalid syntax;");
    await until(() => status()?.state === "blocked", "invalid configuration diagnostic");
    configure(root, "recovered");
    await until(async () => {
      const current = status();
      if (current?.state !== "ready") {
        return false;
      }
      try {
        return (
          (await (await fetch(current.origin + "/static/probe")).text()) === "recovered-development"
        );
      } catch {
        return false;
      }
    }, "configuration recovery");
  } catch (error) {
    throw new Error(`${errorMessage(error)}\n${logs}`, { cause: error });
  } finally {
    child.kill("SIGTERM");
    await exited;
  }
  assert.equal(fs.existsSync(statusFile), false, "shutdown removes runner state");
});
