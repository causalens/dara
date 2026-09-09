import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { readPackageJson } from "./files.js";
import { ProjectError, errorMessage } from "./contract.js";

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
