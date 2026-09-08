import fs from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { ProjectError, generateEntry, resolvedEntry, shared, virtualEntry } from "./contract.mjs";
import { assetMiddleware } from "./assets.mjs";
import { fileHash } from "./files.mjs";

/** HTML belongs to Vite; Python fills runtime JSON and URL placeholders when serving it. */
export function htmlTemplate(scripts, styles = [], development = false) {
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
export default function dara(options = {}) {
  const api = { project: null, resolving: false, options };
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
          if (config.publicDir && config.publicDir !== false) {
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
          resolve: { conditions: ["dara-source"], dedupe: shared, preserveSymlinks: false },
          optimizeDeps: {
            include: api.resolving
              ? []
              : [
                  "react",
                  "react-dom/client",
                  "styled-components",
                  "recoil",
                  "@tanstack/react-query",
                ],
          },
        };
      },
      resolveId(source) {
        if (source === virtualEntry || source === "/@dara/entry") {
          return resolvedEntry;
        }
        const project = api.project;
        if (!project?.packageJson.name || !source.startsWith(project.packageJson.name + "/")) {
          return null;
        }
        const key = "./" + source.slice(project.packageJson.name.length + 1);
        let entry = project.packageJson.exports?.[key];
        if (!entry) {
          for (const [pattern, value] of Object.entries(project.packageJson.exports ?? {})) {
            if (!pattern.includes("*")) {
              continue;
            }
            const [prefix, suffix] = pattern.split("*");
            if (key.startsWith(prefix) && key.endsWith(suffix)) {
              const match = key.slice(prefix.length, suffix ? -suffix.length : undefined);
              entry = JSON.parse(JSON.stringify(value).replaceAll("*", match));
              break;
            }
          }
        }
        const select = (value) =>
          typeof value === "string"
            ? value
            : value && select(value["dara-source"] ?? value.import ?? value.default);
        const target = select(entry);
        if (!target) {
          throw new ProjectError(
            "source.self",
            `Missing app export ${key} for ${source}`,
            "edit package.json exports",
          );
        }
        return path.resolve(project.root, target);
      },
      load(id) {
        if (id !== resolvedEntry) {
          const file = id.split("?")[0];
          if (
            api.project?.observedHashes &&
            path.isAbsolute(file) &&
            fs.existsSync(file) &&
            fs.statSync(file).isFile() &&
            !file.split(path.sep).includes("node_modules") &&
            !api.project.observedHashes.has(file)
          ) {
            api.project.observedHashes.set(file, fileHash(file));
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
          if (/\/(?:index\.html|\.dara-build\.json)(?:\?|$)/.test(request.url)) {
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
            const file = id.split("?")[0];
            if (path.isAbsolute(file) && fs.existsSync(file)) {
              api.project.sourceFiles.add(fs.realpathSync(file));
            }
          }
        }
      },
    },
  ];
}
