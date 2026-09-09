import { z } from "zod";
import type { DaraOptions } from "./contract.js";
import type { Project } from "./project.js";
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { ProjectError, digest } from "./contract.js";
import { fileHash, inside, treeFiles } from "./files.js";

const posixRelative = (root: string, file: string) =>
  path.relative(root, file).replaceAll(path.sep, "/") || ".";
const hashFile = (file: string) => (fs.existsSync(file) ? fileHash(file) : null);

function inventory(directory: string, recursive = true) {
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    throw new ProjectError(
      "build.input",
      `Build input directory ${directory} does not exist or is not a directory`,
      "create the declared directory or edit dara() input declarations",
    );
  }
  if (recursive) {
    return treeFiles(directory);
  }
  return fs
    .readdirSync(directory)
    .sort()
    .flatMap((name) => {
      const file = path.join(directory, name);
      const stat = fs.statSync(file);
      if (stat.isDirectory()) {
        return [];
      }
      if (!stat.isFile() || !inside(fs.realpathSync(directory), fs.realpathSync(file))) {
        throw new ProjectError(
          "build.input",
          `Unsupported or escaping input ${file}`,
          "edit source exports",
        );
      }
      return [file];
    });
}

function capture(
  files: Iterable<string>,
  directories: { directory: string; recursive?: boolean }[],
  names: string[] = [],
) {
  const hashes = new Map([...files].map((file) => [file, hashFile(file)]));
  const trees = directories.map(({ directory, recursive = true }) => {
    const entries = inventory(directory, recursive);
    for (const file of entries) {
      hashes.set(file, hashFile(file));
    }
    return { directory, recursive, files: entries.map((file) => posixRelative(directory, file)) };
  });
  const environment = Object.fromEntries(
    [...names]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => [name, digest(process.env[name] ?? null)]),
  );
  return { hashes, trees, environment };
}

export type InputSnapshot = ReturnType<typeof capture>;

type InputProject = Pick<Project, "root" | "workspace" | "assets"> &
  Partial<Pick<Project, "initialHashes" | "initialSnapshots" | "packageJson">> & {
    inputs: Iterable<string>;
    sourceFiles: Iterable<string>;
    workspacePackages?: { root: string; manifest: Record<string, unknown> }[];
    api: { options: DaraOptions };
    manifest: { static: { source: string }[]; appStatic: string[]; favicon?: string | null };
  };

/** Capture declarations before configuration evaluation can consume their values. */
export function snapshotDeclaredInputs(root: string, options: DaraOptions) {
  return capture(
    (options.inputs ?? []).map((file) => path.resolve(root, file)),
    (options.directories ?? []).map((directory) => ({ directory: path.resolve(root, directory) })),
    options.environment ?? [],
  );
}

function sourceTargets(exports: unknown, selected = false): string[] {
  if (typeof exports === "string") {
    return selected ? [exports] : [];
  }
  if (!exports || typeof exports !== "object") {
    return [];
  }
  return Object.entries(exports).flatMap(([condition, value]) =>
    sourceTargets(value, selected || condition === "dara-source"),
  );
}

function inputDirectories(
  project: Pick<InputProject, "root" | "workspacePackages" | "manifest" | "api">,
) {
  const directories = new Map<string, boolean>();
  const add = (directory: string, recursive = true) =>
    directories.set(directory, recursive || directories.get(directory) === true);
  add(path.join(project.root, "js"));
  for (const entry of project.workspacePackages ?? []) {
    for (const source of sourceTargets(entry.manifest["exports"])) {
      const prefix = source.split("*")[0] ?? source;
      const resolved = path.resolve(entry.root, prefix);
      const directory = prefix.endsWith("/") ? resolved : path.dirname(resolved);
      if (!source.startsWith("./") || !inside(entry.root, directory)) {
        throw new ProjectError(
          "build.input",
          `Invalid dara-source target ${source} in ${entry.root}`,
          "edit package.json exports",
        );
      }
      if (directory === entry.root && source.includes("*")) {
        throw new ProjectError(
          "build.input",
          `Root wildcard dara-source target ${source} in ${entry.root} has no bounded source directory`,
          "place wildcard source exports in a dedicated source directory",
        );
      }
      // Other export conditions may name absent source trees. Resolution already
      // requires the active source to exist; only inventory existing alternatives.
      if (fs.existsSync(directory) && fs.statSync(directory).isDirectory()) {
        add(directory, directory !== entry.root);
      }
    }
  }
  for (const directory of project.manifest.appStatic) {
    add(directory);
  }
  for (const asset of project.manifest.static) {
    if (fs.statSync(asset.source).isDirectory()) {
      add(asset.source);
    }
  }
  for (const directory of project.api.options.directories ?? []) {
    add(path.resolve(project.root, directory));
  }
  return [...directories].map(([directory, recursive]) => ({ directory, recursive }));
}

/** Reject output that would replace an input or create staging inside an inventoried tree. */
export function assertOutputSafe(project: Omit<InputProject, "assets">, output: string) {
  const conflict = inputDirectories(project).find(
    ({ directory, recursive }) =>
      inside(output, directory) || (recursive && inside(directory, output)),
  );
  const files = [
    ...project.inputs,
    ...project.sourceFiles,
    ...(project.api.options.inputs ?? []).map((file) => path.resolve(project.root, file)),
    ...project.manifest.static.map((asset) => asset.source),
    ...(project.manifest.favicon ? [project.manifest.favicon] : []),
  ];
  if (conflict || files.some((file) => inside(output, file))) {
    throw new ProjectError(
      "build.output",
      `Output ${output} overlaps a build input`,
      "choose a separate build output directory",
    );
  }
}

/** Preserve every registered asset identity when a source serves multiple output locations. */
export function portableInputs(
  project: Pick<InputProject, "root" | "workspace" | "manifest">,
  file: string,
) {
  const assets = {
    ...Object.fromEntries(
      project.manifest.static.map((asset, index) => [`asset:${index}`, asset.source]),
    ),
    ...Object.fromEntries(
      project.manifest.appStatic.map((directory, index) => [`appStatic:${index}`, directory]),
    ),
  };
  const matches = Object.entries(assets).flatMap(([root, directory]) =>
    inside(directory, file) ? [{ root, path: posixRelative(directory, file) }] : [],
  );
  if (matches.length) {
    return matches;
  }
  const locations = {
    ...(project.manifest.favicon ? { favicon: project.manifest.favicon } : {}),
    app: project.root,
    workspace: project.workspace,
  };
  for (const [root, directory] of Object.entries(locations)) {
    if (inside(directory, file)) {
      return [{ root, path: posixRelative(directory, file) }];
    }
  }
  throw new ProjectError(
    "build.input",
    `Build input ${file} is outside the app, workspace and registered assets`,
    "declare a portable build input inside the workspace",
  );
}

/** Verify input bytes, directory membership and declared environment remained stable. */
export function verifySnapshot(snapshot: InputSnapshot) {
  for (const [name, hash] of Object.entries(snapshot.environment ?? {})) {
    if (digest(process.env[name] ?? null) !== hash) {
      throw new ProjectError(
        "build.changed",
        `Build environment ${name} changed during compilation`,
        "dara build",
      );
    }
  }
  for (const [file, hash] of snapshot.hashes) {
    if (hashFile(file) !== hash) {
      throw new ProjectError(
        "build.changed",
        `${file} changed during compilation; previous output is intact`,
        "dara build",
      );
    }
  }
  for (const tree of snapshot.trees) {
    const files = inventory(tree.directory, tree.recursive).map((file) =>
      posixRelative(tree.directory, file),
    );
    if (JSON.stringify(files) !== JSON.stringify(tree.files)) {
      throw new ProjectError(
        "build.changed",
        `${tree.directory} changed during compilation; retry the build`,
        "dara build",
      );
    }
  }
}

/** Inventory each known input tree once, preserving snapshots captured before configuration ran. */
export function inputSnapshot(project: InputProject) {
  for (const snapshot of project.initialSnapshots ?? []) {
    verifySnapshot(snapshot);
  }
  const files = new Set([
    ...project.inputs,
    ...project.sourceFiles,
    ...project.assets.values(),
    ...(project.initialHashes?.keys() ?? []),
  ]);
  for (const file of project.api.options.inputs ?? []) {
    files.add(path.resolve(project.root, file));
  }
  files.add(path.join(project.workspace, "pnpm-lock.yaml"));
  for (const name of [".env", ".env.local", ".env.production", ".env.production.local"]) {
    files.add(path.join(project.root, name));
  }
  for (const directory of new Set([project.root, project.workspace])) {
    for (const name of ["package.json", ".npmrc", ".pnpmfile.cjs", "pnpm-workspace.yaml"]) {
      files.add(path.join(directory, name));
    }
  }
  const settingsFile = path.join(project.workspace, "pnpm-workspace.yaml");
  const patchSettings = z
    .object({
      patchedDependencies: z
        .record(z.union([z.string(), z.object({ path: z.string() })]))
        .optional(),
    })
    .passthrough();
  const settings = patchSettings.parse(
    fs.existsSync(settingsFile) ? (parseYaml(fs.readFileSync(settingsFile, "utf8")) ?? {}) : {},
  );
  const packageSettings = patchSettings.parse(project.packageJson?.["pnpm"] ?? {});
  for (const patch of Object.values(
    settings.patchedDependencies ?? packageSettings.patchedDependencies ?? {},
  )) {
    files.add(path.resolve(project.workspace, typeof patch === "string" ? patch : patch.path));
  }
  const snapshot = capture(
    [...files].filter((file) => !file.split(path.sep).includes("node_modules")),
    inputDirectories(project),
    project.api.options.environment ?? [],
  );
  for (const [file, hash] of project.initialHashes ?? []) {
    if (!file.split(path.sep).includes("node_modules") && snapshot.hashes.get(file) !== hash) {
      throw new ProjectError(
        "build.changed",
        `${file} changed after configuration loading`,
        "dara build",
      );
    }
  }
  for (const initial of project.initialSnapshots ?? []) {
    for (const [file, hash] of initial.hashes) {
      snapshot.hashes.set(file, hash);
    }
    snapshot.trees.push(...initial.trees);
    Object.assign(snapshot.environment, initial.environment);
  }
  for (const file of snapshot.hashes.keys()) {
    portableInputs(project, file);
  }
  return snapshot;
}

/** Fail closed when an earlier custom loader consumed an undeclared input before Dara could hash it. */
export function verifyObservedInputs(
  project: Pick<Project, "sourceFiles">,
  snapshot: InputSnapshot,
) {
  for (const file of project.sourceFiles) {
    if (!file.split(path.sep).includes("node_modules") && !snapshot.hashes.has(file)) {
      throw new ProjectError(
        "build.input",
        `Custom loader read ${file} before Dara could fingerprint it`,
        "declare the file with dara({ inputs: [...] }) or place Dara before the custom loader",
      );
    }
  }
}
