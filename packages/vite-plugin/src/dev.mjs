import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { watch } from "chokidar";
import { createServer } from "vite";
import { collectAssets } from "./assets.mjs";
import { resolvedEntry } from "./contract.mjs";
import { atomicWrite, readJson } from "./files.mjs";
import { htmlTemplate } from "./index.mjs";
import { loadProject, publishStatus } from "./project.mjs";
import { startTypecheck } from "./typecheck.mjs";

/** Supervise Vite and the native TypeScript watcher; Python owns both the manifest and HTTP origin. */
export async function serveProject(
  root,
  { baseUrl = "", noTypecheck = false, token = randomUUID() } = {},
) {
  const manifestPath = path.join(root, "node_modules/.dara/manifest.dev.json");
  const reloadPath = path.join(root, "node_modules/.dara/backend-ready.json");
  let project,
    server,
    httpServer,
    checker,
    origin,
    stopped = false;
  let revision = Promise.resolve();
  const configFiles = new Set([
    path.join(root, "vite.config.ts"),
    path.join(root, "tsconfig.json"),
  ]);
  const state = (value) => publishStatus(root, { token, origin, ...value });
  state({ state: "waiting" });
  const closeRuntime = async () => {
    await checker?.();
    checker = undefined;
    await server?.close();
    server = undefined;
    if (httpServer?.listening) {
      await new Promise((resolve, reject) =>
        httpServer.close((error) => (error ? reject(error) : resolve())),
      );
    }
    httpServer = undefined;
    origin = undefined;
  };
  const update = async (restart = false) => {
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
      for (const file of next.configInputs) {
        configFiles.add(file);
      }
      watcher.add([...configFiles]);
      if (restart) {
        state({ state: "waiting" });
        await closeRuntime();
      }
      if (!server) {
        project = next;
        next.api.project = next;
        // The runner owns process shutdown. Middleware mode prevents Vite from
        // installing its own SIGTERM handler, which exits before our cleanup.
        httpServer = createHttpServer();
        server = await createServer({
          ...next.userConfig,
          configFile: false,
          root,
          base: next.base,
          logLevel: "warn",
          server: {
            ...next.userConfig.server,
            middlewareMode: true,
            host: "127.0.0.1",
            port: 0,
            strictPort: false,
            // Omitting clientPort lets the browser use Python's port. No direct-origin fallback is needed.
            hmr: { server: httpServer, path: "@dara/hmr" },
            origin: undefined,
            fs: { ...next.userConfig.server?.fs, strict: true, allow: [next.workspace] },
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
        httpServer.on("request", server.middlewares);
        await new Promise((resolve, reject) => {
          httpServer.once("error", reject);
          httpServer.listen(0, "127.0.0.1", resolve);
        });
        const address = httpServer.address();
        origin = `http://127.0.0.1:${address.port}`;
        atomicWrite(
          path.join(root, "node_modules/.dara/index.dev.html"),
          htmlTemplate(["@vite/client", "@dara/entry"], [], true),
        );
        if (!noTypecheck) {
          checker = startTypecheck(root, server, (diagnostic) =>
            state({ state: "blocked", diagnostic }),
          );
        }
      } else {
        // Keep the running Vite plugin and process while replacing its parsed frontend state.
        Object.assign(project, {
          manifest: next.manifest,
          packageJson: next.packageJson,
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
    if (configFiles.has(file)) {
      revision = revision.then(() => update(true));
    } else if (file === manifestPath || !server || project?.state !== "ready") {
      revision = revision.then(() => update());
    }
  });
  const finished = new Promise((resolve) => {
    const stop = async () => {
      if (stopped) {
        return;
      }
      stopped = true;
      process.off("SIGINT", stop);
      process.off("SIGTERM", stop);
      await watcher.close();
      await revision;
      await closeRuntime();
      const status = path.join(root, "node_modules/.dara/dev-server.json");
      if (fs.existsSync(status) && readJson(status).token === token) {
        fs.rmSync(status);
      }
      resolve();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
  revision = revision.then(() => update());
  await finished;
}
