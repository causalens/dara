import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ProjectError, errorMessage, parseBuildMarker } from "./contract.js";
import { fileHash, treeFiles } from "./files.js";

function complete(directory: string) {
  try {
    if (!fs.lstatSync(directory).isDirectory()) {
      return false;
    }
    const marker = parseBuildMarker(
      JSON.parse(fs.readFileSync(path.join(directory, ".dara-build.json"), "utf8")),
    );
    const files = treeFiles(directory).filter(
      (file) => file !== path.join(directory, ".dara-build.json"),
    );
    return (
      typeof marker.files["index.html"] === "string" &&
      files.length === Object.keys(marker.files).length &&
      files.every(
        (file) =>
          marker.files[path.relative(directory, file).replaceAll(path.sep, "/")] === fileHash(file),
      )
    );
  } catch {
    return false;
  }
}

/** Inspect all recovery candidates before mutating any, preserving unverified backups for review. */
export function recoverBuilds(output: string) {
  const parent = path.dirname(output);
  if (!fs.existsSync(parent)) {
    return;
  }
  const name = path.basename(output);
  const siblings = fs.readdirSync(parent).flatMap((entry) => {
    const kind = entry.startsWith(`${name}.dara-staging-`)
      ? "staging"
      : entry.startsWith(`${name}.dara-backup-`)
        ? "backup"
        : null;
    if (!kind) {
      return [];
    }
    const directory = path.join(parent, entry);
    return [
      {
        directory,
        kind,
        complete: complete(directory),
        realDirectory: fs.lstatSync(directory).isDirectory(),
      },
    ];
  });
  const valid = siblings.filter((entry) => entry.complete);
  const unknown = siblings.find(
    (entry) => !entry.realDirectory || (entry.kind === "backup" && !entry.complete),
  );
  if (unknown) {
    throw new ProjectError(
      "build.recovery",
      `Unverified backup retained at ${unknown.directory}`,
      "inspect and relocate this backup before rebuilding",
    );
  }
  let restored;
  const [candidate] = valid;
  if (!fs.existsSync(output) && valid.length === 1 && candidate) {
    restored = candidate.directory;
  } else if (valid.length && !complete(output)) {
    throw new ProjectError(
      "build.recovery",
      `Recoverable output needs review: ${valid.map((entry) => entry.directory).join(", ")}. Output is absent or incomplete at ${output}`,
      "restore the intended build at the output path, then run dara build",
    );
  }
  if (restored) {
    fs.renameSync(restored, output);
  }
  for (const entry of siblings) {
    if (entry.directory !== restored) {
      fs.rmSync(entry.directory, { recursive: true, force: true });
    }
  }
}

/** Publish a completed directory, restoring the previous output if the final rename fails. */
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
