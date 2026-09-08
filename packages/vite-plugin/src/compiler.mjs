import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { ProjectError } from "./contract.mjs";

/** Resolve TypeScript 7's native compiler from the app's locked platform package. */
export function compilerExecutable(root) {
  try {
    const appRequire = createRequire(path.join(root, "package.json"));
    const compilerPackage = appRequire.resolve("typescript/package.json");
    const compiler = JSON.parse(fs.readFileSync(compilerPackage, "utf8"));
    const platformPackage = `@typescript/typescript-${process.platform}-${process.arch}`;
    if (
      compiler.name !== "typescript" ||
      !compiler.version.startsWith("7.") ||
      !compiler.optionalDependencies?.[platformPackage]
    ) {
      throw new Error("The app requires the native TypeScript 7 compiler");
    }
    const platformManifest = createRequire(compilerPackage).resolve(
      `${platformPackage}/package.json`,
    );
    const native = JSON.parse(fs.readFileSync(platformManifest, "utf8"));
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
    throw new ProjectError("typescript.runner", error.message, "dara lock");
  }
}
