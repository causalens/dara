import fs from "node:fs";
import path from "node:path";
import type { PluginOption } from "vite";
import type { DaraOptions } from "./contract.js";
import type { DaraPluginApi } from "./project.js";
export type { DaraOptions } from "./contract.js";
import react from "@vitejs/plugin-react";
import { selfReference } from "./exports.js";
import { convertPathToPattern } from "tinyglobby";
import { defaultClientConditions } from "vite";
import {
  ProjectError,
  generateEntry,
  parseOptions,
  resolvedEntry,
  shared,
  virtualEntry,
} from "./contract.js";
import { assetMiddleware } from "./assets.js";
import { fileHash } from "./files.js";

/** HTML belongs to Vite; Python fills runtime JSON and URL placeholders when serving it. */
export function htmlTemplate(
  scripts: string[],
  styles: string[] = [],
  development = false,
): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dara</title><base href="{{ base_url }}/"><link rel="icon" href="{{ static_url }}/favicon.ico">
<style>html,body,#dara_root{margin:0;min-height:100%;width:100%}body{display:flex}#dara_root{flex:1}</style>
<script id="__DARA_DATA__" type="application/json">{{ dara_data | safe }}</script>
<script id="__DARA_URLS__" type="application/json">{{ runtime_urls | safe }}</script>
<script>window.dara=JSON.parse(document.getElementById('__DARA_URLS__').textContent);window.__toDaraUrl=(filename)=>window.dara.static_url+filename;</script>
${styles.map((file) => `<link rel="stylesheet" href="{{ static_url }}/${file}">`).join("\n")}
${development ? `<script type="module">import RefreshRuntime from '{{ static_url }}/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script>` : ""}
${scripts.map((file) => `<script type="module" src="{{ static_url }}/${file}"></script>`).join("\n")}
</head><body><div id="dara_root"></div></body></html>`;
}

/** Vite integration and input declarations shared by all Dara applications. */
export default function dara(rawOptions: DaraOptions = {}): PluginOption[] {
  const options = parseOptions(rawOptions);
  const api: DaraPluginApi = { project: null, resolving: false, options };
  return [
    react(),
    {
      name: "dara:app",
      api,
      enforce: "pre",
      config(config) {
        if (!api.project) {
          if (config.base && config.base !== "/static/") {
            throw new ProjectError(
              "vite.base",
              "Dara owns base URLs; pass --base-url to the Python command",
              "edit vite.config.ts",
            );
          }
          if (config.publicDir) {
            throw new ProjectError(
              "vite.public",
              "Use static/ or add_static_folder instead of Vite publicDir",
              "edit vite.config.ts",
            );
          }
          if (
            config.build?.lib ||
            config.build?.rollupOptions?.input ||
            config.build?.rolldownOptions?.input
          ) {
            throw new ProjectError(
              "vite.entry",
              "Dara owns the application entry; use vite.lib.config.ts for a separate library build",
              "edit vite.config.ts",
            );
          }
          if (
            config.server?.port ||
            config.server?.host ||
            config.server?.hmr ||
            config.server?.ws ||
            config.server?.origin ||
            config.server?.proxy
          ) {
            throw new ProjectError(
              "vite.server",
              "Dara owns development endpoints and proxies them through Python",
              "edit vite.config.ts",
            );
          }
        }
        return {
          base: api.project?.base ?? "/static/",
          publicDir: false,
          appType: "custom",
          resolve: {
            conditions: ["dara-source", ...defaultClientConditions],
            dedupe: shared,
            preserveSymlinks: false,
          },
          optimizeDeps: {
            // Vite has no public HTML entry to crawl in a backend-integrated app.
            // Scan the resolved registrations, including linked package sources,
            // so Vite discovers every provider's dependencies without a package list.
            entries:
              api.resolving || !api.project
                ? []
                : [
                    ...[config.optimizeDeps?.entries ?? []].flat(),
                    ...[
                      path.join(api.project.root, "js/index.tsx"),
                      ...api.project.sourceFiles,
                    ].map(convertPathToPattern),
                  ],
          },
        };
      },
      configResolved(config) {
        api.conditions = [
          ...config.resolve.conditions.map((condition) =>
            condition === "development|production"
              ? config.isProduction
                ? "production"
                : "development"
              : condition,
          ),
          "import",
        ];
        // Retain Vite's defaults and application exclusions. This also protects
        // private files requested through transform URLs such as ?raw or @fs.
        config.server.fs.deny.push("**/.dara*/**", "**/.dara-build.json", "**/index.dev.html");
      },
      resolveId(source) {
        if (source === virtualEntry || source === "/@dara/entry") {
          return resolvedEntry;
        }
        const project = api.project;
        return project
          ? selfReference(project.root, project.packageJson, source, api.conditions)
          : null;
      },
      load(id) {
        if (id !== resolvedEntry) {
          const file = id.split("?")[0] ?? id;
          if (
            api.project?.observedHashes &&
            path.isAbsolute(file) &&
            fs.existsSync(file) &&
            fs.statSync(file).isFile() &&
            !file.split(path.sep).includes("node_modules")
          ) {
            const real = fs.realpathSync(file);
            if (!api.project.observedHashes.has(real)) {
              api.project.observedHashes.set(real, fileHash(real));
            }
          }
          return null;
        }
        if (!api.project || api.project.state !== "ready") {
          throw new ProjectError(
            "frontend.waiting",
            "The frontend project is not ready",
            "dara check",
          );
        }
        return generateEntry(api.project.manifest);
      },
      configureServer(server) {
        if (api.resolving || !api.project) {
          return;
        }
        api.project.server = server;
        server.middlewares.use(assetMiddleware(api.project));
        // Development HTML is read by Python; it must never be served directly by Vite.
        server.middlewares.use((request, response, next) => {
          let segments;
          try {
            segments = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname)
              .replaceAll("\\", "/")
              .split("/");
          } catch {
            response.statusCode = 400;
            response.end();
            return;
          }
          if (
            segments.some((part) => part.startsWith(".dara")) ||
            ["index.html", "index.dev.html"].includes(segments.at(-1) ?? "")
          ) {
            response.statusCode = 404;
            response.end();
            return;
          }
          next();
        });
      },
      buildStart() {
        if (!api.project || api.resolving) {
          return;
        }
        for (const file of api.project.inputs) {
          this.addWatchFile(file);
        }
        for (const file of options.inputs ?? []) {
          this.addWatchFile(path.resolve(api.project.root, file));
        }
      },
      generateBundle(_options, bundle) {
        const entry = Object.values(bundle).find((file) => file.type === "chunk" && file.isEntry);
        if (!entry) {
          throw new ProjectError(
            "build.entry",
            "Vite emitted no Dara application entry",
            "dara build",
          );
        }
        const styles = Object.values(bundle)
          .filter((file) => file.type === "asset" && file.fileName.endsWith(".css"))
          .map((file) => file.fileName);
        this.emitFile({
          type: "asset",
          fileName: "index.html",
          source: htmlTemplate([entry.fileName], styles),
        });
        if (api.project) {
          for (const id of this.getModuleIds()) {
            const file = id.split("?")[0] ?? id;
            if (path.isAbsolute(file) && fs.existsSync(file)) {
              api.project.sourceFiles.add(fs.realpathSync(file));
            }
          }
        }
      },
    },
  ];
}
