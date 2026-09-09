import fs from "node:fs";
import path from "node:path";
import { exports as resolveExports } from "resolve.exports";
import type { PackageJson } from "./files.js";
import { inside } from "./files.js";
import { ProjectError, errorMessage } from "./contract.js";

/** Resolve app exports with the same condition and pattern algorithm used by Vite. */
export function selfReference(
  root: string,
  packageJson: PackageJson,
  source: string,
  conditions = ["dara-source", "import"],
) {
  if (
    !packageJson.name ||
    (source !== packageJson.name && !source.startsWith(packageJson.name + "/"))
  ) {
    return null;
  }
  let selected;
  try {
    selected = resolveExports(packageJson, source, { conditions, unsafe: true })?.[0];
  } catch (error) {
    throw new ProjectError(
      "source.self",
      `${source}: ${errorMessage(error)}`,
      "edit package.json exports",
    );
  }
  const file = selected ? path.resolve(root, selected) : null;
  if (
    !selected?.startsWith("./") ||
    !file ||
    !inside(root, file) ||
    !fs.existsSync(file) ||
    !fs.statSync(file).isFile() ||
    !inside(root, fs.realpathSync(file))
  ) {
    throw new ProjectError(
      "source.self",
      `${source}: missing or invalid app export`,
      "edit package.json exports to point to a file inside the app",
    );
  }
  return file;
}
