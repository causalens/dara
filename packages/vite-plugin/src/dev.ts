import fs from "node:fs";
import { z } from "zod";
import type { Server } from "node:http";
import type { Project } from "./project.js";
import type { RuntimeStatus } from "./contract.js";
import type { ViteDevServer } from "vite";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { watch } from "chokidar";
import { createServer } from "vite";
import { collectAssets } from "./assets.js";
import { resolvedEntry, diagnostic as projectDiagnostic } from "./contract.js";
import { atomicWrite, readJson } from "./files.js";
import { htmlTemplate } from "./index.js";
import { loadProject, publishStatus } from "./project.js";
import { startTypecheck } from "./typecheck.js";

/** Supervise Vite and the native TypeScript watcher; Python owns both the manifest and HTTP origin. */
export async function serveProject(
  root: string,
  {
    baseUrl = "",
    noTypecheck = false,
    token = randomUUID(),
  }: { baseUrl?: string; noTypecheck?: boolean; token?: string } = {},
) {
  const manifestPath = path.join(root, "node_modules/.dara/manifest.dev.json");
  const reloadPath = path.join(root, "node_modules/.dara/backend-ready.json");
  let project: Project | undefined;
  let server: ViteDevServer | undefined;
  let httpServer: Server | undefined;
  let checker: (() => Promise<void>) | undefined;
  let origin: string | undefined;
  let stopped = false;
  let revision = Promise.resolve();
  const configFiles = new Set([
    path.join(root, "vite.config.ts"),
    path.join(root, "tsconfig.json"),
  ]);
  const state = (value: RuntimeStatus) => publishStatus(root, { token, origin, ...value });
  state({ state: "waiting" });
  const closeRuntime = async () => {
    await checker?.();
    checker = undefined;
    await server?.close();
    server = undefined;
    const listener = httpServer;
    if (listener?.listening) {
      await new Promise<void>((resolve, reject) =>
        listener.close((error) => (error ? reject(error) : resolve())),
      );
    }
    httpServer = undefined;
    origin = undefined;
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
      if (!server || !project) {
        project = next;
        next.api.project = next;
        // The runner owns process shutdown. Middleware mode prevents Vite from
        // installing its own SIGTERM handler, which exits before our cleanup.
        const listener = createHttpServer();
        httpServer = listener;
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
        await new Promise<void>((resolve, reject) => {
          listener.once("error", reject);
          listener.listen(0, "127.0.0.1", resolve);
        });
        const address = httpServer.address();
        if (!address || typeof address === "string") {
          throw new Error("Vite listener did not bind a TCP port");
        }
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
        const client = server.environments["client"];
        if (!client) {
          throw new Error("Vite did not create its client environment");
        }
        const entry = client.moduleGraph.getModuleById(resolvedEntry);
        if (entry) {
          client.moduleGraph.invalidateModule(entry);
        }
        server.ws.send({ type: "full-reload" });
      }
      state({ state: "ready", runtime: process.version });
    } catch (error) {
      if (project) {
        project.state = "blocked";
      }
      const diagnostic = projectDiagnostic(error);
      process.stderr.write(`[vite] ${diagnostic.message}\n`);
      state({ state: "blocked", diagnostic });
      server?.ws.send({
        type: "error",
        err: { message: diagnostic.message, stack: "", plugin: "Dara" },
      });
    }
  };
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
  const finished = new Promise<void>((resolve) => {
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
      if (
        fs.existsSync(status) &&
        z.object({ token: z.string() }).parse(readJson(status)).token === token
      ) {
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
