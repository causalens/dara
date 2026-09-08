import fs from "node:fs";
import path from "node:path";
import semver from "semver";
import { ProjectError } from "./contract.mjs";
import { inside, readJson } from "./files.mjs";

function installedPackage(root, name) {
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

/** Collect concrete source targets from an export map without changing the checkout manifest. */
export function sourceExports(exports) {
  const targets = [];
  const visit = (value, source = false) => {
    if (typeof value === "string") {
      if (source) {
        targets.push(value);
      }
    } else if (Array.isArray(value)) {
      for (const item of value) {
        visit(item, source);
      }
    } else if (value && typeof value === "object") {
      for (const [key, item] of Object.entries(value)) {
        visit(item, source || key === "dara-source");
      }
    }
  };
  visit(exports);
  return targets;
}

/** Inspect reachable repository packages and validate local references against their real targets. */
export function workspaceGraph(root, workspace) {
  const packages = new Map();
  const inputs = new Set();
  const visit = (inputDirectory) => {
    const directory = fs.realpathSync(inputDirectory);
    if (packages.has(directory)) {
      return;
    }
    const manifestPath = path.join(directory, "package.json");
    const manifest = readJson(manifestPath);
    if (typeof manifest.name !== "string" || !manifest.name) {
      throw new ProjectError(
        "workspace.name",
        `${manifestPath} needs a package name`,
        "edit package.json",
      );
    }
    const entry = { root: directory, manifest, sources: sourceExports(manifest.exports) };
    packages.set(directory, entry);
    inputs.add(manifestPath);
    const dependencies = {
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.optionalDependencies,
    };
    for (const [name, reference] of Object.entries(dependencies)) {
      if (typeof reference !== "string") {
        throw new ProjectError(
          "dependency.reference",
          `${manifestPath}: ${name} needs a string specifier`,
        );
      }
      const local = /^(?:workspace|file|link):/.test(reference);
      const installed = installedPackage(directory, name);
      if (!installed) {
        if (local) {
          throw new ProjectError(
            "workspace.missing",
            `${manifest.name}: ${name} (${reference}) is not installed`,
            "run dara lock; build the package or add dara-source exports",
          );
        }
        continue;
      }
      const actual = readJson(installed);
      if (local && actual.name !== name) {
        throw new ProjectError(
          "workspace.name",
          `${manifest.name}: ${name} resolves to ${actual.name}`,
          "correct the dependency name or target",
        );
      }
      let declaredTarget;
      if (/^(?:file|link):/.test(reference)) {
        declaredTarget = path.resolve(directory, reference.replace(/^(?:file|link):/, ""));
        if (!fs.existsSync(declaredTarget) || !inside(workspace, fs.realpathSync(declaredTarget))) {
          throw new ProjectError(
            "workspace.target",
            `${manifest.name}: ${name} must target a file or package inside ${workspace}`,
            "edit the local dependency reference",
          );
        }
        if (fs.statSync(declaredTarget).isDirectory()) {
          const declared = readJson(path.join(declaredTarget, "package.json"));
          if (declared.name !== actual.name || declared.version !== actual.version) {
            throw new ProjectError(
              "workspace.stale",
              `${name}: installed ${actual.name}@${actual.version} differs from ${declared.name}@${declared.version} at ${declaredTarget}`,
              "run dara lock",
            );
          }
          inputs.add(path.join(declaredTarget, "package.json"));
        } else {
          inputs.add(declaredTarget);
        }
      }
      const target = path.dirname(installed);
      const repositoryPackage = !target.split(path.sep).includes("node_modules");
      if (reference.startsWith("workspace:")) {
        if (!repositoryPackage || !inside(workspace, target)) {
          throw new ProjectError(
            "workspace.target",
            `${name}: ${reference} does not resolve to a repository package`,
            "run dara lock",
          );
        }
        const range = reference.slice("workspace:".length);
        if (
          !["*", "^", "~"].includes(range) &&
          !range.startsWith(".") &&
          !semver.satisfies(actual.version, range)
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
        !semver.satisfies(actual.version, reference)
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

/** Resolve app self-references through its explicit export map, preferring the source condition. */
export function selfReference(root, packageJson, source) {
  if (
    !packageJson.name ||
    (source !== packageJson.name && !source.startsWith(packageJson.name + "/"))
  ) {
    return null;
  }
  const key = source === packageJson.name ? "." : "./" + source.slice(packageJson.name.length + 1);
  let entry = packageJson.exports?.[key];
  if (!entry) {
    const patterns = Object.entries(packageJson.exports ?? {}).filter(([pattern]) =>
      pattern.includes("*"),
    );
    patterns.sort(([a], [b]) => b.indexOf("*") - a.indexOf("*") || b.length - a.length);
    for (const [pattern, value] of patterns) {
      const [prefix, suffix] = pattern.split("*");
      if (key.startsWith(prefix) && key.endsWith(suffix)) {
        const match = key.slice(prefix.length, suffix ? -suffix.length : undefined);
        entry = JSON.parse(JSON.stringify(value).replaceAll("*", match));
        break;
      }
    }
  }
  const select = (value) => {
    if (typeof value === "string") {
      return value;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    return select(value["dara-source"] ?? value.import ?? value.default);
  };
  const selected = select(entry);
  const file = selected ? path.resolve(root, selected) : null;
  if (
    !selected?.startsWith("./") ||
    !file ||
    !inside(root, file) ||
    !fs.existsSync(file) ||
    !inside(root, fs.realpathSync(file))
  ) {
    throw new ProjectError(
      "source.self",
      `${source}: missing or invalid app export ${key}`,
      "edit package.json exports to point to a file inside the app",
    );
  }
  return file;
}
