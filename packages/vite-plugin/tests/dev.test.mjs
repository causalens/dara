import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { version } from "../src/contract.mjs";
import { initialize, loadProject } from "../src/project.mjs";

const pluginRoot = fileURLToPath(new URL("..", import.meta.url));

function fixture(t) {
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

function configure(root, value) {
  fs.writeFileSync(
    path.join(root, "vite.config.ts"),
    `
import dara from '@darajs/vite-plugin';
const value = ${JSON.stringify(value)} + '-' + process.env.NODE_ENV;
export default {
  plugins: [dara(), { name: 'test-probe', configureServer(server) {
    server.middlewares.use((request, response, next) => {
      if (request.url === '/static/probe') response.end(value);
      else next();
    });
  }}],
  define: { APP_POSTURE: JSON.stringify(process.env.NODE_ENV) },
};
`,
  );
}

async function until(read, description) {
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

await test("configuration validation keeps each operation's NODE_ENV posture", async (t) => {
  const { root, manifest } = fixture(t);
  configure(root, "posture");
  for (const command of ["build", "serve"]) {
    const project = await loadProject(root, manifest, command);
    const production = command === "build";
    assert.equal(project.config.isProduction, production);
    assert.equal(
      project.userConfig.define.APP_POSTURE,
      JSON.stringify(production ? "production" : "development"),
    );
    assert.equal(process.env.NODE_ENV, production ? "production" : "development");
  }
});

await test("development reloads configuration, recovers from errors and protects private state", async (t) => {
  const { root } = fixture(t);
  configure(root, "first");
  const child = spawn(
    process.execPath,
    [path.join(pluginRoot, "src/cli.mjs"), "serve", "--root", root, "--no-typecheck"],
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
    const wsToken = clientSource.match(/const wsToken = "([^"]+)"/)[1];
    const socket = new WebSocket(
      first.origin.replace("http:", "ws:") + "/static/@dara/hmr?token=" + wsToken,
      "vite-hmr",
    );
    const messages = [];
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
    throw new Error(`${error.message}\n${logs}`, { cause: error });
  } finally {
    child.kill("SIGTERM");
    await exited;
  }
  assert.equal(fs.existsSync(statusFile), false, "shutdown removes runner state");
});
