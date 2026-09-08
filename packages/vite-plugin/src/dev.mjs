import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { watch } from "chokidar";
import { createServer } from "vite";
import { collectAssets } from "./assets.mjs";
import { resolvedEntry } from "./contract.mjs";
import { atomicWrite, readJson } from "./files.mjs";
import { htmlTemplate } from "./index.mjs";
import { loadProject, publishStatus } from "./project.mjs";

/** Supervise Vite and the native TypeScript watcher; Python owns both the manifest and HTTP origin. */
export async function serveProject(
  root,
  { baseUrl = "", noTypecheck = false, token = randomUUID() } = {},
) {
  const manifestPath = path.join(root, "node_modules/.dara/manifest.dev.json");
  const reloadPath = path.join(root, "node_modules/.dara/backend-ready.json");
  let project,
    server,
    checker,
    origin,
    stopped = false;
  let revision = Promise.resolve();
  const state = (value) => publishStatus(root, { token, origin, ...value });
  state({ state: "waiting" });
  const update = async () => {
    if (stopped) {
      return;
    }
    if (!fs.existsSync(manifestPath)) {
      state({ state: "waiting" });
      return;
    }
    try {
      const next = await loadProject(root, readJson(manifestPath), "serve");
      next.base = `${baseUrl.replace(/\/$/, "")}/static/`;
      next.assets = collectAssets(next.manifest);
      next.state = "ready";
      if (!server) {
        project = next;
        next.api.project = next;
        server = await createServer({
          ...next.userConfig,
          configFile: false,
          root,
          base: next.base,
          logLevel: "warn",
          server: {
            ...next.userConfig.server,
            host: "127.0.0.1",
            port: 0,
            strictPort: false,
            // Omitting clientPort lets the browser use Python's port. No direct-origin fallback is needed.
            hmr: { path: "@dara/hmr" },
            origin: undefined,
            fs: { strict: true, allow: [next.workspace] },
            watch: {
              ...next.userConfig.server?.watch,
              ignored: [
                "**/.venv/**",
                "**/__pycache__/**",
                ...(Array.isArray(next.userConfig.server?.watch?.ignored)
                  ? next.userConfig.server.watch.ignored
                  : next.userConfig.server?.watch?.ignored
                    ? [next.userConfig.server.watch.ignored]
                    : []),
              ],
            },
          },
        });
        await server.listen();
        const address = server.httpServer.address();
        origin = `http://127.0.0.1:${address.port}`;
        atomicWrite(
          path.join(root, "node_modules/.dara/index.dev.html"),
          htmlTemplate(["@vite/client", "@dara/entry"], [], true),
        );
        if (!noTypecheck) {
          checker = spawn(
            "pnpm",
            [
              "exec",
              "tsc",
              "--project",
              path.join(root, "tsconfig.json"),
              "--noEmit",
              "--watch",
              "--preserveWatchOutput",
              "--pretty",
              "false",
            ],
            { cwd: root, env: process.env, stdio: ["ignore", "pipe", "pipe"] },
          );
          let output = "";
          const report = (data) => {
            const chunk = data.toString();
            process.stderr.write(`[typescript] ${chunk}`);
            output += chunk;
            if (/Found \d+ errors?\. Watching/.test(output)) {
              if (output.includes("Found 0 errors")) {
                server.ws.send({ type: "custom", event: "dara:typecheck-clear", data: {} });
              } else {
                server.ws.send({
                  type: "error",
                  err: { message: output, stack: "", plugin: "Dara TypeScript" },
                });
              }
              output = "";
            }
          };
          checker.stdout.on("data", report);
          checker.stderr.on("data", report);
          checker.on("error", (error) =>
            state({
              state: "blocked",
              diagnostic: { code: "typescript.runner", message: error.message, fix: "dara lock" },
            }),
          );
          checker.on("exit", (code) => {
            if (!stopped) {
              state({
                state: "blocked",
                diagnostic: {
                  code: "typescript.runner",
                  message: `TypeScript watcher exited ${code}`,
                  fix: "dara dev",
                },
              });
            }
          });
        }
      } else {
        // Keep the running Vite plugin and process while replacing its parsed frontend state.
        Object.assign(project, {
          manifest: next.manifest,
          assets: next.assets,
          inputs: next.inputs,
          sourceFiles: next.sourceFiles,
          state: "ready",
        });
        const entry = server.environments.client.moduleGraph.getModuleById(resolvedEntry);
        if (entry) {
          server.environments.client.moduleGraph.invalidateModule(entry);
        }
        server.ws.send({ type: "full-reload" });
      }
      state({ state: "ready", runtime: process.version });
    } catch (error) {
      if (project) {
        project.state = "blocked";
      }
      const diagnostic = error.diagnostic ?? {
        code: "frontend.runner",
        message: error.message,
        fix: "dara check",
      };
      process.stderr.write(`[vite] ${diagnostic.message}\n`);
      state({ state: "blocked", diagnostic });
      server?.ws.send({
        type: "error",
        err: { message: diagnostic.message, stack: "", plugin: "Dara" },
      });
    }
  };
  const watcher = watch(
    [
      manifestPath,
      reloadPath,
      path.join(root, "js"),
      path.join(root, "vite.config.ts"),
      path.join(root, "tsconfig.json"),
    ],
    { ignoreInitial: true, usePolling: true, interval: 200 },
  );
  watcher.on("all", (_event, file) => {
    if (file === reloadPath) {
      server?.ws.send({ type: "full-reload" });
      return;
    }
    if (file === manifestPath || !server || project?.state !== "ready") {
      revision = revision.then(update);
    }
  });
  await update();
  await new Promise((resolve) => {
    const stop = async () => {
      if (stopped) {
        return;
      }
      stopped = true;
      await watcher.close();
      checker?.kill("SIGTERM");
      await revision;
      await server?.close();
      const status = path.join(root, "node_modules/.dara/dev-server.json");
      if (fs.existsSync(status) && readJson(status).token === token) {
        fs.rmSync(status);
      }
      resolve();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}
