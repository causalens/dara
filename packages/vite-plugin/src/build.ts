import { resolveProjectSources } from "./project.js";
import fs from "node:fs";
import type { Project } from "./project.js";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { build } from "vite";
import { ProjectError, errorMessage, digest, portable, version, virtualEntry } from "./contract.js";
import { collectAssets, copyAssets } from "./assets.js";
import { atomicWrite, fileHash, inside, treeFiles } from "./files.js";
import { compilerArguments, compilerExecutable } from "./compiler.js";
import { parse as parseYaml } from "yaml";

/** Run a package executable with arguments and forward diagnostics without using a shell. */
export async function runCommand(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN: "false" },
    });
    child.stdout.on("data", (data) => process.stderr.write(data));
    child.stderr.on("data", (data) => process.stderr.write(data));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            new ProjectError(
              "build.command",
              `${command} ${args.join(" ")} exited ${code}`,
              "fix the reported errors, then run dara build",
            ),
          ),
    );
  });
}

/** Type errors prevent publishing any production output. */
export async function checkTypes(project: Project, mode = "check") {
  await runCommand(
    compilerExecutable(project.root),
    compilerArguments(project, mode),
    project.root,
  );
}

function roots(project: Project): Record<string, string> {
  return {
    app: project.root,
    workspace: project.workspace,
    ...Object.fromEntries(
      project.manifest.static.map((asset, index) => [`asset:${index}`, asset.source]),
    ),
    ...Object.fromEntries(
      project.manifest.appStatic.map((folder, index) => [`appStatic:${index}`, folder]),
    ),
    ...(project.manifest.favicon ? { favicon: project.manifest.favicon } : {}),
  };
}

function portableInput(project: Project, file: string) {
  const locations = roots(project);
  // More specific asset roots take precedence over the app/workspace roots.
  for (const key of [
    ...Object.keys(locations).filter((location) => !["app", "workspace"].includes(location)),
    "app",
    "workspace",
  ]) {
    const root = locations[key];
    if (root === undefined) {
      continue;
    }
    if (inside(root, file)) {
      return { root: key, path: path.relative(root, file).replaceAll(path.sep, "/") || "." };
    }
  }
  throw new ProjectError(
    "build.input",
    `Build input ${file} is outside the app, workspace and registered assets`,
    "declare a portable build input inside the workspace",
  );
}

/** Inventory known input trees before compilation so additions and removals cannot be hidden. */
export function inputSnapshot(
  project: Pick<Project, "root" | "workspace" | "inputs" | "sourceFiles" | "assets" | "manifest"> &
    Partial<Pick<Project, "initialHashes">> & { api: Pick<Project["api"], "options"> },
) {
  const files = new Set([...project.inputs, ...project.sourceFiles, ...project.assets.values()]);
  const directories = [
    ...new Set([
      path.join(project.root, "js"),
      ...(project.workspacePackages ?? []).flatMap((entry) =>
        entry.sources.map((source) => {
          const prefix = source.split("*")[0];
          const resolved = path.resolve(entry.root, prefix);
          return prefix.endsWith("/") ? resolved : path.dirname(resolved);
        }),
      ),
      ...project.manifest.appStatic,
      ...project.manifest.static
        .filter((asset) => fs.statSync(asset.source).isDirectory())
        .map((asset) => asset.source),
      ...(project.api.options.directories ?? []).map((dir) => path.resolve(project.root, dir)),
    ]),
  ];
  for (const file of project.api.options.inputs ?? []) {
    files.add(path.resolve(project.root, file));
  }
  for (const dir of directories) {
    for (const file of treeFiles(dir)) {
      files.add(file);
    }
  }
  const lockfile = path.join(project.workspace, "pnpm-lock.yaml");
  files.add(lockfile);
  for (const file of project.initialHashes?.keys() ?? []) {
    files.add(file);
  }
  for (const directory of new Set([project.root, project.workspace])) {
    for (const name of ["package.json", ".npmrc", ".pnpmfile.cjs", "pnpm-workspace.yaml"]) {
      const file = path.join(directory, name);
      files.add(file);
    }
  }
  for (const name of [".env", ".env.local", ".env.production", ".env.production.local"]) {
    files.add(path.join(project.root, name));
  }
  const settingsFile = path.join(project.workspace, "pnpm-workspace.yaml");
  const settings = fs.existsSync(settingsFile)
    ? (parseYaml(fs.readFileSync(settingsFile, "utf8")) ?? {})
    : {};
  for (const patch of Object.values(
    settings.patchedDependencies ?? project.packageJson?.pnpm?.patchedDependencies ?? {},
  )) {
    const file = typeof patch === "string" ? patch : patch.path;
    files.add(path.resolve(project.workspace, file));
  }
  const environment = Object.fromEntries(
    (project.api.options.environment ?? [])
      .toSorted()
      .map((name) => [name, digest(process.env[name] ?? null)]),
  );
  const hashes = new Map(
    [...files]
      .filter((file) => !file.split(path.sep).includes("node_modules"))
      .map((file) => [file, fs.existsSync(file) ? fileHash(file) : null]),
  );
  for (const [file, hash] of project.initialHashes ?? []) {
    if (!file.split(path.sep).includes("node_modules") && hashes.get(file) !== hash) {
      throw new ProjectError(
        "build.changed",
        `${file} changed after configuration loading`,
        "dara build",
      );
    }
  }
  // Application lockfile sits outside node_modules and is always recorded.
  const trees = directories.map((dir) => ({
    directory: dir,
    files: treeFiles(dir).map((file) => path.relative(dir, file).replaceAll(path.sep, "/")),
  }));
  return { hashes, trees, environment };
}

/** Verify inputs stayed stable while Vite and custom build plugins were reading them. */
export function verifySnapshot(snapshot: ReturnType<typeof inputSnapshot>) {
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
    if ((fs.existsSync(file) ? fileHash(file) : null) !== hash) {
      throw new ProjectError(
        "build.changed",
        `${file} changed during compilation; previous output is intact`,
        "dara build",
      );
    }
  }
  for (const tree of snapshot.trees) {
    const files = treeFiles(tree.directory).map((file) =>
      path.relative(tree.directory, file).replaceAll(path.sep, "/"),
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

/** Inspect recoverable builds before cleaning abandoned siblings; never discard the sole valid output. */
export function recoverBuilds(output) {
  const parent = path.dirname(output);
  if (!fs.existsSync(parent)) {
    return;
  }
  const name = path.basename(output);
  const complete = (directory) => {
    try {
      const marker = JSON.parse(fs.readFileSync(path.join(directory, ".dara-build.json"), "utf8"));
      const files = treeFiles(directory).filter(
        (file) => file !== path.join(directory, ".dara-build.json"),
      );
      return (
        marker.schema === 1 &&
        marker.contractDigest === digest(marker.contract) &&
        typeof marker.files?.["index.html"] === "string" &&
        files.length === Object.keys(marker.files).length &&
        files.every(
          (file) =>
            marker.files[path.relative(directory, file).replaceAll(path.sep, "/")] ===
            fileHash(file),
        )
      );
    } catch {
      return false;
    }
  };
  const siblings = fs
    .readdirSync(parent)
    .filter(
      (entry) =>
        entry.startsWith(`${name}.dara-staging-`) || entry.startsWith(`${name}.dara-backup-`),
    )
    .map((entry) => path.join(parent, entry));
  const valid = siblings.filter(complete);
  if (!fs.existsSync(output) && valid.length === 1) {
    fs.renameSync(valid[0], output);
  } else if (valid.length && !complete(output)) {
    throw new ProjectError(
      "build.recovery",
      `Recoverable output needs review: ${valid.join(", ")}. Output is absent or incomplete at ${output}`,
      "restore the intended build at the output path, then run dara build",
    );
  }
  for (const directory of siblings) {
    // A valid published output makes older completed siblings redundant. Incomplete backups remain reviewable.
    if (directory.includes(`${name}.dara-staging-`) || valid.includes(directory)) {
      fs.rmSync(directory, { recursive: true, force: true });
    } else {
      throw new ProjectError(
        "build.recovery",
        `Unverified backup retained at ${directory}`,
        "inspect and relocate this backup before rebuilding",
      );
    }
  }
}

/** Replace completed output with recovery on failed directory renames, including Windows. */
export function publishBuild(staging: string, output: string, rename = fs.renameSync) {
  const backup = `${output}.dara-backup-${randomUUID()}`;
  const replacing = fs.existsSync(output);
  if (replacing) {
    rename(output, backup);
  }
  try {
    rename(staging, output);
  } catch (error) {
    if (replacing) {
      try {
        rename(backup, output);
      } catch (restore) {
        throw new ProjectError(
          "build.recovery",
          `Publish failed (${errorMessage(error)}); restore failed (${errorMessage(restore)}). Recover previous output from ${backup}; staging remains at ${staging}`,
          "restore the reported backup, then run dara build",
        );
      }
    }
    throw new ProjectError(
      "build.publish",
      `Publish failed: ${errorMessage(error)}. Staging remains at ${staging}; previous output was preserved`,
      "dara build",
    );
  }
  if (replacing) {
    fs.rmSync(backup, { recursive: true });
  }
}

/** Build in a sibling staging directory and write the private marker last. */
export async function buildProject(
  project: Project,
  { noDepsBuild = false }: { noDepsBuild?: boolean } = {},
) {
  const output = path.resolve(project.root, project.manifest.outDir);
  if (
    inside(output, project.root) ||
    inside(path.join(project.root, "js"), output) ||
    output.split(path.sep).includes("node_modules")
  ) {
    throw new ProjectError(
      "build.output",
      `Unsafe output directory ${output}`,
      "choose a separate build output directory",
    );
  }
  recoverBuilds(output);
  project.assets = collectAssets(project.manifest);
  project.state = "ready";
  project.base = "./";
  if (!noDepsBuild && project.workspacePackages?.some((entry) => entry.root !== project.root)) {
    await runCommand(
      "pnpm",
      ["--fail-if-no-match", "--filter", `${project.packageJson.name}^...`, "run", "build"],
      project.workspace,
    );
  }
  await resolveProjectSources(project);
  const snapshot = inputSnapshot(project);
  await checkTypes(project, "build");
  project.observedHashes = snapshot.hashes;
  const staging = `${output}.dara-staging-${randomUUID()}`;
  fs.mkdirSync(staging, { recursive: true });
  try {
    await build({
      ...project.userConfig,
      configFile: false,
      root: project.root,
      base: "./",
      logLevel: "warn",
      build: {
        ...project.userConfig.build,
        outDir: staging,
        emptyOutDir: false,
        manifest: false,
        rolldownOptions: { ...project.userConfig.build?.rolldownOptions, input: virtualEntry },
      },
    });
    copyAssets(project, staging);
    // Inputs discovered by module loading were fingerprinted before Vite read their bytes.
    verifySnapshot(snapshot);
    const contract = portable(project.manifest);
    const inputs = [...snapshot.hashes]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([file, hash]) => ({ ...portableInput(project, file), hash }));
    const directories = snapshot.trees.map((tree) => ({
      ...portableInput(project, tree.directory),
      files: tree.files,
    }));
    const environment = snapshot.environment;
    const files = Object.fromEntries(
      treeFiles(staging).map((file) => [
        path.relative(staging, file).replaceAll(path.sep, "/"),
        fileHash(file),
      ]),
    );
    const marker = {
      schema: 1,
      daraVersion: version,
      contract,
      contractDigest: digest(contract),
      inputs,
      directories,
      environment,
      files,
    };
    atomicWrite(path.join(staging, ".dara-build.json"), JSON.stringify(marker, null, 2) + "\n");
    publishBuild(staging, output);
    return { output, files: Object.keys(files).length };
  } catch (error) {
    // Incomplete staging has no marker and is safe to discard. Complete recoverable staging is retained.
    if (!fs.existsSync(path.join(staging, ".dara-build.json"))) {
      fs.rmSync(staging, { recursive: true, force: true });
    }
    throw error;
  }
}
