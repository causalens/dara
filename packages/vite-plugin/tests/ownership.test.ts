import assert from "node:assert/strict";
import { createServer } from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { TestContext } from "node:test";
import { test } from "node:test";
import type { Plugin } from "vite";
import { resolveConfig } from "vite";
import dara from "../dist/index.js";
import { ProjectError } from "../dist/contract.js";
import { checkUserConfig } from "../dist/ownership.js";
import type { DaraPlugin } from "../dist/project.js";

function code(error: unknown) {
  return error instanceof ProjectError ? error.diagnostic.code : undefined;
}

await test("the app's own config reports the owned option it sets", () => {
  const root = "/app";
  for (const [config, expected] of [
    [{ server: { port: 3000 } }, "vite.server"],
    [{ server: { hmr: { port: 1234 } } }, "vite.server"],
    [{ server: { fs: { strict: false } } }, "vite.server"],
    [{ base: "/app/" }, "vite.base"],
    [{ publicDir: "public" }, "vite.public"],
    [{ appType: "spa" }, "vite.entry"],
    [{ build: { manifest: true } }, "vite.output"],
    [{ resolve: { preserveSymlinks: true } }, "vite.resolve"],
  ] as const) {
    assert.throws(
      () => checkUserConfig(config, root, "dist"),
      (error) => {
        assert.equal(code(error), expected, JSON.stringify(config));
        assert.match((error as Error).message, /vite\.config\.ts sets /);
        return true;
      },
    );
  }
});

await test("the app may configure composable options and restate Dara's values", () => {
  checkUserConfig(
    {
      base: "/static/",
      publicDir: false,
      server: {
        hmr: { overlay: false },
        fs: { strict: true, allow: ["../shared"], deny: ["**/secrets/**"] },
        watch: { usePolling: true },
      },
      build: { manifest: false, outDir: "dist" },
    },
    "/app",
    "dist",
  );
});

function serving(t: TestContext, before: Plugin[] = [], after: Plugin[] = []) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dara-owned-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const httpServer = createServer();
  const [, app, owned] = dara() as Plugin[];
  const api = (app as DaraPlugin).api;
  api.serving = { httpServer, workspace: root };
  return {
    root,
    httpServer,
    resolve: (user: object = {}) =>
      resolveConfig(
        {
          configFile: false,
          root,
          logLevel: "silent",
          ...user,
          plugins: [...before, app!, owned!, ...after],
        },
        "serve",
      ),
  };
}

await test("plugins may set owned server options without overriding Dara", async (t) => {
  const stray: Plugin = {
    name: "stray",
    config: () => ({ server: { port: 4000, hmr: { port: 1234, path: "elsewhere" } } }),
  };
  const { root, httpServer, resolve } = serving(t, [stray]);
  const config = await resolve({
    server: { hmr: { overlay: false }, fs: { allow: ["../shared"] } },
  });
  const { ws, hmr } = config.server;
  assert.ok(ws && typeof hmr === "object");
  assert.equal(ws.server, httpServer);
  assert.equal(ws.path, "@dara/hmr");
  assert.equal(ws.port, undefined, "a stray HMR port would redirect the browser socket");
  assert.equal(hmr.overlay, false, "the app's overlay choice is kept");
  assert.equal(config.server.middlewareMode, true);
  assert.equal(config.server.fs.strict, true);
  assert.ok(config.server.fs.allow.includes(path.resolve(root, "../shared")));
  assert.ok(config.server.fs.allow.includes(root));
  assert.ok(config.server.fs.deny.includes(".env"), "Vite's default exclusions are kept");
});

await test("a plugin that changes an owned option after Dara is reported", async (t) => {
  // A post plugin listed after dara() runs its config hook after Dara's.
  const late: Plugin = {
    name: "late",
    enforce: "post",
    config: () => ({ server: { hmr: { path: "elsewhere" } } }),
  };
  const { resolve } = serving(t, [], [late]);
  await assert.rejects(resolve(), (error) => {
    assert.equal(code(error), "vite.override");
    assert.match((error as Error).message, /server\.ws/);
    return true;
  });
});
