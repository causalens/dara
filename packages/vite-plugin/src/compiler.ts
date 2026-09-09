import type { Project } from "./project.js";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { readPackageJson } from "./files.js";
import { ProjectError, errorMessage } from "./contract.js";
import { atomicWrite } from "./files.js";

export type CompilerProject = Pick<Project, "root" | "sourceFiles"> & {
  typescript: Pick<Project["typescript"], "config">;
};

/** Add registered source modules through a private type entry without replacing the user's project. */
export function compilerArguments(project: CompilerProject, mode = "check") {
  const { root, sourceFiles, typescript } = project;
  const files = [...sourceFiles]
    .filter((file) => /\.(?:[cm]?ts|tsx)$/.test(file))
    .sort((left, right) => left.localeCompare(right));
  const entry = `./node_modules/.dara/registrations.${mode}.d.ts`;
  const filename = path.join(root, entry);
  const contents =
    files.map((file) => `import ${JSON.stringify(file.replaceAll("\\", "/"))};\n`).join("") ||
    "export {};\n";
  if (!fs.existsSync(filename) || fs.readFileSync(filename, "utf8") !== contents) {
    atomicWrite(filename, contents);
  }
  // The loader requires an explicit effective types list including vite/client.
  // Appending our entry therefore preserves every ambient type the app selected.
  const types = [...(typescript.config.compilerOptions?.types ?? []), filename];
  return [
    "--project",
    path.join(root, "tsconfig.json"),
    "--noEmit",
    "--pretty",
    "false",
    "--types",
    types.join(","),
  ];
}

/** Resolve TypeScript 7's native compiler from the app's locked platform package. */
export function compilerExecutable(root: string): string {
  try {
    const appRequire = createRequire(path.join(root, "package.json"));
    const compilerPackage = appRequire.resolve("typescript/package.json");
    const compiler = readPackageJson(compilerPackage);
    const platformPackage = `@typescript/typescript-${process.platform}-${process.arch}`;
    if (
      compiler.name !== "typescript" ||
      !compiler.version?.startsWith("7.") ||
      !compiler.optionalDependencies?.[platformPackage]
    ) {
      throw new Error("The app requires the native TypeScript 7 compiler");
    }
    const platformManifest = createRequire(compilerPackage).resolve(
      `${platformPackage}/package.json`,
    );
    const native = readPackageJson(platformManifest);
    if (native.name !== platformPackage || native.version !== compiler.version) {
      throw new Error(`Native compiler package must be ${platformPackage}@${compiler.version}`);
    }
    // TypeScript 7 distributes one native executable per platform in lib/tsc.
    // Run it directly so pnpm and Node launcher processes cannot orphan a watcher.
    const executable = path.join(
      path.dirname(platformManifest),
      "lib",
      process.platform === "win32" ? "tsc.exe" : "tsc",
    );
    if (!fs.statSync(executable).isFile()) {
      throw new Error(`Missing native compiler: ${executable}`);
    }
    return executable;
  } catch (error) {
    throw new ProjectError("typescript.runner", errorMessage(error), "dara lock");
  }
}
