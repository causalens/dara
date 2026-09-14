import fs from "node:fs";
import type { Project } from "./project.js";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { build } from "vite";
import {
  ProjectError,
  digest,
  portable,
  version,
  virtualEntry,
  parseBuildMarker,
} from "./contract.js";
import { collectAssets, copyAssets } from "./assets.js";
import { atomicWrite, fileHash, inside, treeFiles } from "./files.js";
import { compilerArguments, compilerExecutable } from "./compiler.js";
import { resolveProjectSources } from "./project.js";
import {
  inputSnapshot,
  portableInputs,
  verifySnapshot,
  assertOutputSafe,
  verifyObservedInputs,
} from "./inputs.js";
import { recoverBuilds, publishBuild } from "./publication.js";

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
  project.assets = collectAssets(project.manifest);
  assertOutputSafe(project, output);
  recoverBuilds(output);
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
    verifyObservedInputs(project, snapshot);
    verifySnapshot(snapshot);
    const contract = portable(project.manifest);
    const inputs = [...snapshot.hashes]
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([file, hash]) =>
        portableInputs(project, file).map((input) => ({ ...input, hash })),
      );
    const directories = snapshot.trees.flatMap((tree) =>
      portableInputs(project, tree.directory).map((input) => ({
        ...input,
        files: tree.files,
        recursive: tree.recursive,
      })),
    );
    const environment = snapshot.environment;
    const files = Object.fromEntries(
      treeFiles(staging).map((file) => [
        path.relative(staging, file).replaceAll(path.sep, "/"),
        fileHash(file),
      ]),
    );
    const marker = parseBuildMarker({
      schema: 1,
      daraVersion: version,
      workspaceRoot:
        path.relative(project.root, project.workspace).replaceAll(path.sep, "/") || ".",
      contract,
      contractDigest: digest(contract),
      inputs,
      directories,
      environment,
      files,
    });
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
