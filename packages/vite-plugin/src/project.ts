import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import type { Plugin, ResolvedConfig, UserConfig, ViteDevServer } from "vite";
import type { ParsedDaraOptions, Manifest, RuntimeStatus } from "./contract.js";
import type { PackageJson } from "./files.js";
import { getTsconfig } from "get-tsconfig";
import semver from "semver";
import { createServer, loadConfigFromFile, resolveConfig } from "vite";
import { parse as parseYaml } from "yaml";
import { ProjectError, errorMessage, parseManifest, sourcePackage } from "./contract.js";
import { atomicWrite, inside, readPackageJson, workspaceRoot } from "./files.js";

export interface DaraPluginApi {
  project: Project | null;
  resolving: boolean;
  conditions?: string[];
  options: ParsedDaraOptions;
}

export type DaraPlugin = Plugin<DaraPluginApi> & { api: DaraPluginApi };

export interface ProjectConfig {
  userConfig: UserConfig;
  config: ResolvedConfig;
  api: DaraPluginApi;
  configInputs: string[];
}

export interface Project extends ProjectConfig {
  root: string;
  workspace: string;
  manifest: Manifest;
  packageJson: PackageJson;
  typescript: NonNullable<ReturnType<typeof getTsconfig>>;
  inputs: Set<string>;
  sourceFiles: Set<string>;
  workspacePackages: ReturnType<typeof workspaceGraph>["packages"];
  assets: Map<string, string>;
  state: "waiting" | "ready" | "blocked";
  base: string;
  observedHashes?: Map<string, string>;
  initialHashes: Map<string, string>;
  server?: ViteDevServer;
}

import { workspaceGraph } from "./workspace.js";
const defaults = {
  "vite.config.ts": `import dara from '@darajs/vite-plugin';\nimport { defineConfig } from 'vite';\n\nexport default defineConfig({ plugins: [dara()] });\n`,
  "tsconfig.json":
    JSON.stringify({ extends: "@darajs/vite-plugin/tsconfig.json", include: ["js"] }, null, 2) +
    "\n",
  "js/index.tsx": "export {};\n",
};

const typescriptOptionsSchema = z
  .object({
    moduleResolution: z.literal("bundler"),
    jsx: z.literal("react-jsx"),
    noEmit: z.literal(true),
    isolatedModules: z.literal(true),
    customConditions: z.array(z.string()).refine((values) => values.includes("dara-source"), {
      message: 'must include "dara-source"',
    }),
    types: z.array(z.string()).refine((values) => values.includes("vite/client"), {
      message: 'must include "vite/client"',
    }),
  })
  .passthrough();

/** Initialize only absent user files; existing configuration and app code remain user-owned. */
export function initialize(root: string): string[] {
  const created = [];
  for (const [name, contents] of Object.entries(defaults)) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) {
      // Exclusive creation avoids racing a user who creates a file during preparation.
      fs.mkdirSync(path.dirname(file), { recursive: true });
      try {
        fs.writeFileSync(file, contents, { flag: "wx" });
        created.push(name);
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) {
          throw error;
        }
      }
    }
  }
  return created;
}

/** Validate the effective TS project, following JSONC, inheritance and the locked preset. */
export function checkTypescript(root: string) {
  let config;
  const cache = new Map<string, unknown>();
  try {
    config = getTsconfig(root, "tsconfig.json", cache);
  } catch (error) {
    throw new ProjectError("typescript.config", errorMessage(error), "edit tsconfig.json");
  }
  if (!config || path.resolve(config.path) !== path.join(root, "tsconfig.json")) {
    throw new ProjectError("typescript.config", "The app needs a root tsconfig.json");
  }
  const options = typescriptOptionsSchema.safeParse(config.config.compilerOptions ?? {});
  if (!options.success) {
    throw new ProjectError(
      "typescript.config",
      `tsconfig.json: ${options.error.message}`,
      "edit tsconfig.json",
    );
  }
  // get-tsconfig records the actual JSONC/array/package inheritance reads in its cache.
  const hashes = new Map<string, string>();
  for (const [key, contents] of cache) {
    if (key.startsWith("readFileSync:") && key.endsWith(":utf8") && typeof contents === "string") {
      const file = fs.realpathSync(key.slice(13, -5));
      if (!file.split(path.sep).includes("node_modules")) {
        hashes.set(file, createHash("sha256").update(contents).digest("hex"));
      }
    }
  }
  return { ...config, hashes };
}

function checkDependencies(
  root: string,
  workspace: string,
  manifest: Manifest,
  packageJson: PackageJson,
) {
  const file = path.join(workspace, "pnpm-workspace.yaml");
  if (!fs.existsSync(file)) {
    throw new ProjectError("dependency.catalog", "Missing pnpm-workspace.yaml");
  }
  const catalog = z
    .object({
      catalogs: z.object({ dara: z.record(z.string()).optional() }).optional(),
    })
    .parse(parseYaml(fs.readFileSync(file, "utf8"))).catalogs?.dara;
  const inputs = new Set([path.join(root, "package.json"), file]);
  for (const required of manifest.packageRequirements) {
    if (catalog?.[required.name] !== required.specifier) {
      throw new ProjectError(
        "dependency.catalog",
        `catalogs.dara.${required.name} must be ${required.specifier}`,
      );
    }
    const reference = packageJson[required.section]?.[required.name];
    if (
      typeof reference !== "string" ||
      (!reference.startsWith("workspace:") &&
        !reference.startsWith("file:") &&
        !reference.startsWith("link:") &&
        reference !== "catalog:dara")
    ) {
      throw new ProjectError(
        "dependency.reference",
        `${required.name} needs a ${required.section} reference to catalog:dara`,
      );
    }
    const installed = path.join(root, "node_modules", required.name, "package.json");
    if (!fs.existsSync(installed)) {
      throw new ProjectError("dependency.missing", `${required.name} is not installed`);
    }
    const actual = readPackageJson(installed);
    if (
      actual.name !== required.name ||
      !actual.version ||
      !semver.satisfies(actual.version, required.specifier, { includePrerelease: true })
    ) {
      throw new ProjectError(
        "dependency.version",
        `${required.name}: installed ${actual.name}@${actual.version}, expected ${required.specifier}`,
      );
    }
    if (reference !== "catalog:dara") {
      const target = reference.startsWith("workspace:")
        ? fs.realpathSync(path.dirname(installed))
        : path.resolve(root, reference.replace(/^(file|link):/, ""));
      if (!inside(workspace, fs.realpathSync(target))) {
        throw new ProjectError(
          "dependency.target",
          `${required.name}: ${reference} must resolve inside ${workspace}`,
        );
      }
    }
    // Installed registry packages are represented by the lockfile; local source manifests are inputs.
    const real = fs.realpathSync(installed);
    if (!real.split(path.sep).includes("node_modules")) {
      inputs.add(real);
    }
  }
  return inputs;
}

async function resolveProjectConfig(
  root: string,
  command: "serve" | "build",
): Promise<ProjectConfig> {
  const file = path.join(root, "vite.config.ts");
  if (!fs.existsSync(file)) {
    throw new ProjectError("vite.config", "Missing vite.config.ts");
  }
  const env = { command, mode: command === "serve" ? "development" : "production" };
  process.env["NODE_ENV"] = env.mode;
  const loaded = await loadConfigFromFile(env, file, root, "warn");
  if (!loaded) {
    throw new ProjectError("vite.config", `Unable to load ${file}`, "edit vite.config.ts");
  }
  const resolved = await resolveConfig(
    { ...loaded.config, root, configFile: false },
    command,
    env.mode,
  );
  const plugins = resolved.plugins.filter(
    (plugin): plugin is DaraPlugin => plugin.name === "dara:app",
  );
  const [plugin] = plugins;
  if (plugins.length !== 1 || !plugin) {
    throw new ProjectError(
      "vite.plugin",
      'vite.config.ts must include exactly one dara() plugin: import dara from "@darajs/vite-plugin"',
      "edit vite.config.ts",
    );
  }
  const react = resolved.plugins.filter((candidate) =>
    ["vite:react-babel", "vite:react-swc"].includes(candidate.name),
  );
  if (react.length > 1) {
    throw new ProjectError(
      "vite.react",
      "dara() already includes the React plugin; remove the second React plugin",
      "edit vite.config.ts",
    );
  }
  return {
    userConfig: loaded.config,
    config: resolved,
    api: plugin.api,
    configInputs: [file, ...loaded.dependencies],
  };
}

async function checkLibraryOutput(project: Project) {
  const { root, manifest } = project;
  const file = path.join(root, "vite.lib.config.ts");
  if (!fs.existsSync(file)) {
    return;
  }
  const nodeEnv = process.env["NODE_ENV"];
  let loaded;
  let library;
  try {
    process.env["NODE_ENV"] = "production";
    loaded = await loadConfigFromFile({ command: "build", mode: "production" }, file, root, "warn");
    if (!loaded) {
      throw new ProjectError("workspace.library", `Cannot load ${file}`, "edit vite.lib.config.ts");
    }
    library = await resolveConfig(
      {
        ...loaded.config,
        root: path.resolve(root, loaded.config.root ?? "."),
        configFile: false,
      },
      "build",
      "production",
    );
  } finally {
    if (nodeEnv === undefined) {
      delete process.env["NODE_ENV"];
    } else {
      process.env["NODE_ENV"] = nodeEnv;
    }
  }
  const libraryOutput = path.resolve(library.root, library.build.outDir);
  const appOutput = path.resolve(root, manifest.outDir);
  if (inside(libraryOutput, appOutput) || inside(appOutput, libraryOutput)) {
    throw new ProjectError(
      "workspace.output",
      `Library output ${libraryOutput} overlaps app output ${appOutput}`,
      "choose separate app and library output directories",
    );
  }
  project.inputs.add(file);
  for (const dependency of loaded.dependencies) {
    project.inputs.add(dependency);
  }
}

/** Load and validate the app once at the Node boundary; runners consume the returned project. */
export async function loadProject(
  appRoot: string,
  raw: unknown,
  command: "serve" | "build" = "serve",
): Promise<Project> {
  const root = fs.realpathSync(appRoot);
  if (!semver.satisfies(process.version, ">=22.12.0")) {
    throw new ProjectError(
      "toolchain.runtime",
      `Plugin is running on ${process.version}; Node >=22.12.0 is required`,
      "install supported Node",
    );
  }
  const manifest = parseManifest(raw);
  const packageJson = readPackageJson(path.join(root, "package.json"));
  const workspace = workspaceRoot(root);
  const dependencyInputs = checkDependencies(root, workspace, manifest, packageJson);
  const graph = workspaceGraph(root, workspace);
  for (const name of Object.keys(defaults)) {
    if (!fs.existsSync(path.join(root, name))) {
      throw new ProjectError(
        "project.missing",
        `Missing ${name}; run dara lock and commit the result`,
      );
    }
  }
  const typescript = checkTypescript(root);
  // Vite and configuration modules read process-wide NODE_ENV. Resolve each mode
  // in its own posture, then restore the active command before running plugins.
  let configs: [ProjectConfig, ProjectConfig];
  try {
    configs = [
      await resolveProjectConfig(root, "serve"),
      await resolveProjectConfig(root, "build"),
    ];
  } finally {
    process.env["NODE_ENV"] = command === "build" ? "production" : "development";
  }
  const chosen = configs[command === "serve" ? 0 : 1];
  for (const config of configs) {
    if (
      config.userConfig.build?.outDir &&
      path.resolve(root, config.userConfig.build.outDir) !== path.resolve(root, manifest.outDir)
    ) {
      throw new ProjectError(
        "vite.output",
        `build.outDir disagrees with Dara output ${manifest.outDir}`,
        "edit vite.config.ts",
      );
    }
    if (config.userConfig.root && path.resolve(root, config.userConfig.root) !== root) {
      throw new ProjectError(
        "vite.root",
        "Vite root must be the Dara app root",
        "edit vite.config.ts",
      );
    }
  }
  const project: Project = {
    root,
    workspace,
    manifest,
    packageJson,
    typescript,
    initialHashes: typescript.hashes,
    ...chosen,
    inputs: new Set([
      ...dependencyInputs,
      ...graph.inputs,
      ...configs.flatMap((config) => config.configInputs),
      ...typescript.hashes.keys(),
    ]),
    sourceFiles: new Set<string>(),
    assets: new Map<string, string>(),
    state: "waiting",
    base: "/static/",
    workspacePackages: graph.packages,
  };
  await checkLibraryOutput(project);
  return project;
}

/** Resolve registered imports only after the active runner has prepared their dependencies. */
export async function resolveProjectSources(project: Project) {
  const { root, manifest } = project;
  project.api.project = project;
  // Use Vite's real plugin container, so user resolvers and the app's exports participate.
  project.api.resolving = true;
  let resolver;
  try {
    resolver = await createServer({
      ...project.userConfig,
      root,
      configFile: false,
      logLevel: "silent",
      server: { middlewareMode: true, watch: null, hmr: false },
      optimizeDeps: { noDiscovery: true, include: [] },
    });
    const client = resolver.environments["client"];
    if (!client) {
      throw new ProjectError(
        "vite.environment",
        "Vite did not create its client environment",
        "edit vite.config.ts",
      );
    }
    const imports = [
      { name: "Dara bootstrap", source: "@darajs/core/bootstrap" },
      ...manifest.moduleDependencies.map((item) => ({ name: item.python, source: item.source })),
      ...manifest.components,
      ...manifest.actions,
      ...manifest.auth,
    ];
    for (const item of imports) {
      const local = sourcePackage(item.source) === null;
      const specifier = local ? path.resolve(root, item.source) : item.source;
      let resolved;
      try {
        resolved = await client.pluginContainer.resolveId(
          specifier,
          path.join(root, "js/index.tsx"),
        );
      } catch (error) {
        throw new ProjectError(
          "source.unresolved",
          `${item.name}: cannot resolve ${item.source}: ${errorMessage(error)}`,
          "build the workspace package, start its watcher, or add dara-source exports",
        );
      }
      if (!resolved || resolved.external) {
        throw new ProjectError(
          "source.unresolved",
          `${item.name}: cannot resolve ${item.source}`,
          "edit js_source or build the workspace package",
        );
      }
      const file = resolved.id.split("?")[0] ?? resolved.id;
      if (
        local &&
        (!fs.existsSync(file) || !inside(path.join(root, "js"), fs.realpathSync(file)))
      ) {
        throw new ProjectError(
          "source.invalid",
          `${item.name}: ${item.source} must resolve to a file inside js/`,
          "edit js_source",
        );
      }
      if (fs.existsSync(file)) {
        project.sourceFiles.add(fs.realpathSync(file));
      }
    }
  } finally {
    await resolver?.close();
    project.api.resolving = false;
  }
  return project;
}

/** Publish private runner state for the Python supervisor and proxy. */
export function publishStatus(
  root: string,
  state: RuntimeStatus & { token: string; origin: string | undefined },
) {
  atomicWrite(path.join(root, "node_modules/.dara/dev-server.json"), JSON.stringify(state));
}
