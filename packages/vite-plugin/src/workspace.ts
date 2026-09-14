import fs from "node:fs";
import path from "node:path";
import semver from "semver";
import { z } from "zod";
import { ProjectError } from "./contract.js";
import { inside, readJson } from "./files.js";

function installedPackage(root: string, name: string) {
  let directory = root;
  while (true) {
    const file = path.join(directory, "node_modules", name, "package.json");
    if (fs.existsSync(file)) {
      return fs.realpathSync(file);
    }
    const parent = path.dirname(directory);
    if (directory === parent) {
      return null;
    }
    directory = parent;
  }
}

const packageName = z.string().regex(/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/);
const dependencies = z.record(packageName, z.string());
const packageFields = z
  .object({
    name: packageName,
    version: z.string().optional(),
    dependencies: dependencies.default({}),
    devDependencies: dependencies.default({}),
    optionalDependencies: dependencies.default({}),
  })
  .passthrough();

function readPackage(file: string) {
  const parsed = packageFields.safeParse(readJson(file));
  if (!parsed.success) {
    throw new ProjectError(
      "workspace.manifest",
      `${file}: ${parsed.error.message}`,
      "edit package.json",
    );
  }
  return parsed.data;
}

function declaredTarget(directory: string, reference: string, workspace: string) {
  const target = path.resolve(directory, reference.slice(reference.indexOf(":") + 1));
  if (!fs.existsSync(target) || !inside(workspace, fs.realpathSync(target))) {
    throw new ProjectError(
      "workspace.target",
      `${reference} must target a file or package inside ${workspace}`,
      "edit the local dependency reference",
    );
  }
  return fs.realpathSync(target);
}

/** Inspect reachable repository packages and validate local references against their real targets. */
export function workspaceGraph(root: string, workspace: string) {
  const packages = new Map<string, { root: string; manifest: z.infer<typeof packageFields> }>();
  const inputs = new Set<string>();
  const visit = (inputDirectory: string) => {
    const directory = fs.realpathSync(inputDirectory);
    if (packages.has(directory)) {
      return;
    }
    const manifestPath = path.join(directory, "package.json");
    const manifest = readPackage(manifestPath);
    const entry = { root: directory, manifest };
    packages.set(directory, entry);
    inputs.add(manifestPath);
    // pnpm's app... closure includes development dependencies for every selected
    // package, which production needs in order to run those packages' build scripts.
    const references = {
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.optionalDependencies,
    };
    for (const [name, reference] of Object.entries(references)) {
      const local = /^(?:workspace|file|link):/.test(reference);
      const installed = installedPackage(directory, name);
      if (!installed) {
        if (local && !(name in manifest.optionalDependencies)) {
          throw new ProjectError(
            "workspace.missing",
            `${manifest.name}: ${name} (${reference}) is not installed`,
            "run dara lock; build the package or add dara-source exports",
          );
        }
        continue;
      }
      const actual = readPackage(installed);
      const target = path.dirname(installed);
      const workspaceReference = reference.startsWith("workspace:")
        ? reference.slice("workspace:".length)
        : null;
      const alias = workspaceReference?.match(/^((?:@[^/]+\/)?[^@]+)@(.+)$/);
      const expectedName = alias ? alias[1] : name;
      if (local && actual.name !== expectedName) {
        throw new ProjectError(
          "workspace.name",
          `${manifest.name}: ${name} resolves to ${actual.name}`,
          "correct the dependency name or target",
        );
      }
      if (/^(?:file|link):/.test(reference) || workspaceReference?.startsWith(".")) {
        const declared = declaredTarget(directory, reference, workspace);
        const isDirectory = fs.statSync(declared).isDirectory();
        if (
          (reference.startsWith("link:") || workspaceReference !== null) &&
          (!isDirectory || declared !== target)
        ) {
          throw new ProjectError(
            "workspace.target",
            `${name}: ${reference} resolves to ${target}, expected ${declared}`,
            "run dara lock",
          );
        }
        if (isDirectory) {
          const declaredManifest = readPackage(path.join(declared, "package.json"));
          if (
            declaredManifest.name !== actual.name ||
            declaredManifest.version !== actual.version
          ) {
            throw new ProjectError(
              "workspace.stale",
              `${name}: installed ${actual.name}@${actual.version} differs from ${declaredManifest.name}@${declaredManifest.version} at ${declared}`,
              "run dara lock",
            );
          }
          inputs.add(path.join(declared, "package.json"));
        } else {
          inputs.add(declared);
        }
      }
      const repositoryPackage = !target.split(path.sep).includes("node_modules");
      if (workspaceReference !== null) {
        if (!repositoryPackage || !inside(workspace, target)) {
          throw new ProjectError(
            "workspace.target",
            `${name}: ${reference} does not resolve to a repository package`,
            "run dara lock",
          );
        }
        const range = alias?.[2] ?? workspaceReference;
        if (
          !["*", "^", "~"].includes(range) &&
          !range.startsWith(".") &&
          (!actual.version || !semver.satisfies(actual.version, range))
        ) {
          throw new ProjectError(
            "workspace.version",
            `${name}@${actual.version} does not satisfy ${reference}`,
            "align workspace package versions",
          );
        }
      } else if (
        repositoryPackage &&
        !local &&
        !reference.startsWith("catalog:") &&
        (!actual.version || !semver.satisfies(actual.version, reference))
      ) {
        throw new ProjectError(
          "workspace.version",
          `${name}@${actual.version} does not satisfy ${reference}`,
          "align workspace package versions",
        );
      }
      if (repositoryPackage) {
        if (!inside(workspace, target)) {
          throw new ProjectError(
            "workspace.target",
            `${name} resolves outside ${workspace}`,
            "keep linked packages inside the workspace",
          );
        }
        visit(target);
      }
    }
  };
  visit(root);
  return { packages: [...packages.values()], inputs };
}
