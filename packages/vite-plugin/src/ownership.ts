import path from "node:path";
import type { Server } from "node:http";
import type { ResolvedConfig, UserConfig } from "vite";
import { ProjectError } from "./contract.js";

/**
 * Vite settings Dara owns, and how each one is enforced.
 *
 * The app's own vite.config.ts may not set an owned option to a different value: Dara reports it
 * so the setting never appears to work while being ignored. Other plugins may set owned options
 * (many contribute defaults); Dara applies its values after theirs, and only reports a plugin when
 * it changes an owned value after Dara configured it. Composable options such as server.fs.allow,
 * server.fs.deny, server.watch and resolve.dedupe are merged rather than owned.
 */
interface Owned {
  path: string;
  code: string;
  message: string;
  read: (config: UserConfig) => unknown;
  /** Values the app may set, typically Dara's own value. */
  allowed?: (value: unknown) => boolean;
}

const server = "Dara serves development through the Python origin";
const owned: Owned[] = [
  {
    path: "base",
    code: "vite.base",
    message: "Dara owns base URLs; pass --base-url to the Python command",
    read: (config) => config.base,
    allowed: (value) => value === "/static/",
  },
  {
    path: "publicDir",
    code: "vite.public",
    message: "Use static/ or add_static_folder instead of Vite publicDir",
    read: (config) => config.publicDir,
    allowed: (value) => value === false,
  },
  {
    path: "appType",
    code: "vite.entry",
    message: "Dara owns the application HTML and entry",
    read: (config) => config.appType,
    allowed: (value) => value === "custom",
  },
  {
    path: "build.lib",
    code: "vite.entry",
    message: "Dara owns the application entry; use vite.lib.config.ts for a separate library build",
    read: (config) => config.build?.lib,
    allowed: (value) => value === false,
  },
  {
    path: "build.rollupOptions.input",
    code: "vite.entry",
    message: "Dara owns the application entry; use vite.lib.config.ts for a separate library build",
    read: (config) => config.build?.rollupOptions?.input,
  },
  {
    path: "build.rolldownOptions.input",
    code: "vite.entry",
    message: "Dara owns the application entry; use vite.lib.config.ts for a separate library build",
    read: (config) => config.build?.rolldownOptions?.input,
  },
  {
    path: "build.manifest",
    code: "vite.output",
    message: "Dara publishes its own build marker instead of a Vite manifest",
    read: (config) => config.build?.manifest,
    allowed: (value) => value === false,
  },
  {
    path: "resolve.preserveSymlinks",
    code: "vite.resolve",
    message: "Dara resolves linked workspace packages by their real paths so each is loaded once",
    read: (config) => config.resolve?.preserveSymlinks,
    allowed: (value) => value === false,
  },
  ...(["port", "host", "strictPort", "ws", "origin", "proxy", "middlewareMode"] as const).map(
    (key): Owned => ({
      path: `server.${key}`,
      code: "vite.server",
      message: server,
      read: (config) => config.server?.[key],
    }),
  ),
  {
    path: "server.hmr",
    code: "vite.server",
    message: `${server}; only server.hmr.overlay can be configured`,
    read: (config) => config.server?.hmr,
    allowed: (value) =>
      typeof value === "object" &&
      value !== null &&
      Object.keys(value).every((key) => key === "overlay"),
  },
  {
    path: "server.fs.strict",
    code: "vite.server",
    message: "Dara keeps Vite's file access strict; add directories to server.fs.allow instead",
    read: (config) => config.server?.fs?.strict,
    allowed: (value) => value === true,
  },
];

/** Report owned options set by the app's vite.config.ts, naming the option and its replacement. */
export function checkUserConfig(config: UserConfig, root: string, outDir: string) {
  for (const option of owned) {
    const value = option.read(config);
    if (value !== undefined && !option.allowed?.(value)) {
      throw new ProjectError(
        option.code,
        `vite.config.ts sets ${option.path}: ${option.message}`,
        `remove ${option.path} from vite.config.ts`,
      );
    }
  }
  if (
    config.build?.outDir &&
    path.resolve(root, config.build.outDir) !== path.resolve(root, outDir)
  ) {
    throw new ProjectError(
      "vite.output",
      `build.outDir disagrees with Dara output ${outDir}`,
      "remove build.outDir from vite.config.ts; pass --output to dara build",
    );
  }
  if (config.root && path.resolve(root, config.root) !== root) {
    throw new ProjectError(
      "vite.root",
      "Vite root must be the Dara app root",
      "remove root from vite.config.ts",
    );
  }
}

/** The development endpoints Dara serves Vite through. */
export interface Serving {
  httpServer: Server;
  workspace: string;
}

export const hmrPath = "@dara/hmr";

/**
 * Apply Dara's development server settings after every other plugin's config hook.
 *
 * In Vite 8, server.ws carries the HMR socket (server.hmr's socket keys are deprecated aliases of
 * it), so Dara assigns server.ws whole: a stray port, host or path from another plugin would
 * otherwise redirect the browser's socket. server.hmr keeps only the app's overlay choice, and
 * server.fs.allow keeps the app's extra directories alongside the workspace.
 */
export function applyServing(config: UserConfig, serving: Serving) {
  const current = config.server ?? {};
  const overlay = typeof current.hmr === "object" ? current.hmr.overlay : undefined;
  config.server = {
    ...current,
    middlewareMode: true,
    host: "127.0.0.1",
    port: 0,
    strictPort: false,
    // Omitting clientPort lets the browser use Python's port. No direct-origin fallback is needed.
    ws: { server: serving.httpServer, path: hmrPath },
    hmr: overlay === undefined ? {} : { overlay },
    fs: {
      ...current.fs,
      strict: true,
      allow: [...(current.fs?.allow ?? []), serving.workspace],
    },
  };
}

/** Fail when a plugin changed an owned development setting after Dara applied it. */
export function verifyServing(config: ResolvedConfig, serving: Serving) {
  const ws = config.server.ws;
  const changed = [
    !config.server.middlewareMode && "server.middlewareMode",
    (!ws ||
      ws.server !== serving.httpServer ||
      ws.path !== hmrPath ||
      [ws.port, ws.host, ws.clientPort, ws.protocol].some((value) => value !== undefined)) &&
      "server.ws (or the deprecated server.hmr socket options)",
    !config.server.fs.strict && "server.fs.strict",
    !config.server.fs.allow.some(
      (entry) => path.resolve(entry) === path.resolve(serving.workspace),
    ) && "server.fs.allow",
  ].filter((option): option is string => Boolean(option));
  if (changed.length) {
    throw new ProjectError(
      "vite.override",
      `A Vite plugin changed ${changed.join(", ")} after Dara configured it`,
      "remove the plugin, or configure it to leave these options to Dara",
    );
  }
}
