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
import { applyServing, verifyServing } from "./ownership.js";

/**
 * Vite's own development deny list. A configured server.fs.deny replaces it rather than
 * extending it, so Dara always restates it alongside the app's own exclusions.
 */
const viteDefaultDeny = [
  ".env",
  ".env.*",
  "*.{crt,pem,key,p12,pfx,cer,der}",
  ".npmrc",
  ".yarnrc.yml",
  "**/.git/**",
];

/**
 * Private runner state and credential files that sit beside sources Vite may serve. Vite compiles
 * the deny list before configResolved, so these must be returned from the config hook.
 */
const daraDeny = ["**/.dara*/**", "**/.dara-build.json", "**/index.dev.html", ".pypirc", ".netrc"];

/**
 * HTML belongs to Vite; Python fills runtime JSON and URL placeholders when serving it. The root
 * shows a loading indicator until React renders the application into it.
 *
 * dara-core's static jquery.min.js stays a deferred classic script, so the `$` global that Bokeh
 * widgets expect exists before any module runs, until vendored libraries move to npm imports.
 */
export function htmlTemplate(
  scripts: string[],
  styles: string[] = [],
  development = false,
): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dara</title><base href="{{ base_url }}/"><link rel="icon" href="{{ static_url }}/favicon.ico">
<style>html,body,#dara_root{margin:0;min-height:100%;width:100%}body{display:flex;min-height:100vh}#dara_root{flex:1;display:flex}
.dara-dots-center{flex:1;display:flex;align-items:center;justify-content:center}
.dara-dots,.dara-dots::before,.dara-dots::after{width:10px;height:10px;border-radius:5px;background:#8D9199;animation:dara-dots 1s infinite alternate}
.dara-dots{position:relative;animation-delay:.5s}.dara-dots::before,.dara-dots::after{content:"";position:absolute;top:0}
.dara-dots::before{left:-15px;animation-delay:0s}.dara-dots::after{left:15px;animation-delay:1s}
@keyframes dara-dots{0%{background:#8D9199}50%,100%{background:#C3C6CF}}
@media (prefers-reduced-motion:reduce){.dara-dots,.dara-dots::before,.dara-dots::after{animation:none}}</style>
<script id="__DARA_DATA__" type="application/json">{{ dara_data | safe }}</script>
<script id="__DARA_URLS__" type="application/json">{{ runtime_urls | safe }}</script>
<script>window.dara=JSON.parse(document.getElementById('__DARA_URLS__').textContent);</script>
${styles.map((file) => `<link rel="stylesheet" href="{{ static_url }}/${file}">`).join("\n")}
<script defer src="{{ static_url }}/dara.core/jquery.min.js"></script>
${development ? `<script type="module">import RefreshRuntime from '{{ static_url }}/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script>` : ""}
${scripts.map((file) => `<script type="module" src="{{ static_url }}/${file}"></script>`).join("\n")}
</head><body><div id="dara_root"><div class="dara-dots-center"><div class="dara-dots"></div></div></div></body></html>`;
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
        return {
          base: api.project?.base ?? "/static/",
          // Vite concatenates this with application exclusions, which would otherwise replace
          // its defaults. Denied files stay private even through transform URLs such as ?raw or @fs.
          server: { fs: { deny: [...viteDefaultDeny, ...daraDeny] } },
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
            "wait for dara dev to finish preparing the frontend",
          );
        }
        return generateEntry(api.project.manifest, api.project.setupSources);
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
    {
      // Runs after every other plugin's config hook, so Dara's development endpoints win over
      // values contributed by plugins; the app's own owned settings were already reported.
      name: "dara:owned",
      enforce: "post",
      config(config) {
        if (api.serving) {
          applyServing(config, api.serving);
        }
      },
      configResolved(config) {
        if (api.serving) {
          verifyServing(config, api.serving);
        }
      },
    },
  ];
}
