import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ProjectError, errorMessage } from "./contract.js";

/** Write one file atomically; network installs and multi-file edits remain separate operations. */
export function atomicWrite(file: string, contents: string | Uint8Array) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, contents);
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

/** Parse a user-owned JSON file and associate failures with that file. */
export function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new ProjectError("project.file", `${file}: ${errorMessage(error)}`, `edit ${file}`);
  }
}

/** Test containment using path components, including on Windows. */
export function inside(root: string, file: string) {
  const relative = path.relative(root, file);
  return !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

/** Hash bytes rather than timestamps, so touched-but-unchanged files stay fresh. */
export function fileHash(file: string) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

/** Enumerate regular files deterministically, rejecting symlinks that escape the registered tree. */
export function treeFiles(root: string): string[] {
  if (!fs.existsSync(root)) {
    return [];
  }
  const files: string[] = [];
  const visited = new Set<string>();
  const walk = (current: string): void => {
    const real = fs.realpathSync(current);
    if (!inside(fs.realpathSync(root), real)) {
      throw new ProjectError(
        "asset.source",
        `${current} escapes ${root}`,
        "edit static registrations",
      );
    }
    const stat = fs.statSync(real);
    if (stat.isDirectory()) {
      if (visited.has(real)) {
        throw new ProjectError(
          "asset.source",
          `Cyclic directory link at ${current}`,
          "edit static registrations",
        );
      }
      visited.add(real);
      for (const name of fs.readdirSync(current).sort()) {
        walk(path.join(current, name));
      }
      visited.delete(real);
    } else if (stat.isFile()) {
      files.push(current);
    }
  };
  walk(root);
  return files;
}

/** Resolve the pnpm workspace without giving Dara ownership of repository settings. */
export function workspaceRoot(root: string) {
  let current = root;
  while (true) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return root;
    }
    current = parent;
  }
}

const packageSchema = z
  .object({
    name: z.string().optional(),
    version: z.string().optional(),
    dependencies: z.record(z.string()).optional(),
    devDependencies: z.record(z.string()).optional(),
    optionalDependencies: z.record(z.string()).optional(),
  })
  .passthrough();
export type PackageJson = z.infer<typeof packageSchema>;

/** Parse package metadata before dependency and toolchain decisions use it. */
export function readPackageJson(file: string): PackageJson {
  const result = packageSchema.safeParse(readJson(file));
  if (!result.success) {
    throw new ProjectError("project.file", `${file}: ${result.error.message}`, `edit ${file}`);
  }
  return result.data;
}
