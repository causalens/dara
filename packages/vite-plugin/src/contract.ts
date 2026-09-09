import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

export const version = z
  .object({ version: z.string() })
  .parse(JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))).version;

export interface Diagnostic {
  code: string;
  message: string;
  fix: string;
}

/** Additional inputs read by custom build plugins rather than ordinary module imports. */
export interface DaraOptions {
  inputs?: string[];
  directories?: string[];
  environment?: string[];
}

export const shared = [
  "@darajs/core",
  "react",
  "react-dom",
  "styled-components",
  "@tanstack/react-query",
  "recoil",
  "recoil-sync",
  "react-router",
];
export const virtualEntry = "virtual:dara-entry";
export const resolvedEntry = "\0virtual:dara-entry";

/** Diagnostic codes are stable across all four runners and the Python CLI. */
export class ProjectError extends Error {
  readonly diagnostic: Diagnostic;

  constructor(code: string, message: string, fix = "dara lock") {
    super(message);
    this.diagnostic = { code, message, fix };
  }
}

/** Describe an exception from user configuration or external tooling. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Preserve structured project failures and normalize errors at process boundaries. */
export function diagnostic(error: unknown): Diagnostic {
  return error instanceof ProjectError
    ? error.diagnostic
    : { code: "frontend.runner", message: errorMessage(error), fix: "dara check" };
}

/** Parse an import specifier without interpreting package code or trusting traversal paths. */
export function sourcePackage(source: unknown): string | null {
  if (typeof source !== "string" || source.includes("\\")) {
    throw new ProjectError(
      "source.invalid",
      `Invalid js_source: ${String(source)}`,
      "edit js_source",
    );
  }
  if (source.startsWith("./")) {
    if (path.posix.normalize(source).startsWith("js/")) {
      return null;
    }
  } else if (
    /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+(?:\/[\w./-]+)?$/.test(source) &&
    !source.startsWith(".") &&
    !source.split("/").some((p) => p === ".." || p === ".")
  ) {
    return source
      .split("/")
      .slice(0, source.startsWith("@") ? 2 : 1)
      .join("/");
  }
  throw new ProjectError(
    "source.invalid",
    `Invalid js_source: ${source}; expected a package import or ./js/ file`,
    "edit js_source",
  );
}

const source = z.string().superRefine((value, ctx) => {
  try {
    sourcePackage(value);
  } catch (error) {
    ctx.addIssue({ code: "custom", message: errorMessage(error) });
  }
});
const implementation = z.object({ name: z.string().min(1), source }).strict();
const requirement = z
  .object({
    name: z.string().min(1),
    section: z.enum(["dependencies", "devDependencies"]),
    specifier: z.string().min(1),
  })
  .strict();
const schema = z
  .object({
    schema: z.literal(1),
    configuration: z.string(),
    daraVersion: z.string(),
    packageRequirements: z.array(requirement),
    moduleDependencies: z.array(
      z.object({ python: z.string(), package: z.string(), source }).strict(),
    ),
    components: z.array(implementation),
    actions: z.array(implementation),
    auth: z.array(implementation).default([]),
    static: z.array(
      z.object({ package: z.string(), source: z.string(), target: z.string() }).strict(),
    ),
    appStatic: z.array(z.string()),
    favicon: z.string().nullable(),
    outDir: z.string(),
  })
  .strict();

/** Parse the complete manifest before acting on any registered sources or requirements. */
export type Manifest = z.infer<typeof schema>;

export function parseManifest(raw: unknown): Manifest {
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ProjectError(
      "manifest.schema",
      result.error.message,
      "upgrade matching Dara Python and JS packages",
    );
  }
  if (result.data.daraVersion !== version) {
    throw new ProjectError(
      "manifest.version",
      `Python Dara ${result.data.daraVersion} does not match plugin ${version}`,
    );
  }
  for (const key of ["components", "actions", "auth"] as const) {
    const seen = new Map<string, string>();
    for (const entry of result.data[key]) {
      if (seen.has(entry.name) && seen.get(entry.name) !== entry.source) {
        throw new ProjectError(
          "source.duplicate",
          `${entry.name} has multiple ${key} implementations`,
          "edit application registrations",
        );
      }
      seen.set(entry.name, entry.source);
    }
  }
  return result.data;
}

/** Hash canonical JSON identically to the Python marker validator. */
export function digest(value: unknown): string {
  const canonical = (item: unknown): unknown =>
    Array.isArray(item)
      ? item.map(canonical)
      : item && typeof item === "object"
        ? Object.fromEntries(
            Object.entries(item)
              .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
              .map(([key, member]) => [key, canonical(member)]),
          )
        : item;
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

/** Select the portable runtime contract, excluding machine-specific asset paths. */
export function portable(manifest: Manifest) {
  return Object.fromEntries(
    (
      [
        "schema",
        "daraVersion",
        "packageRequirements",
        "moduleDependencies",
        "components",
        "actions",
        "auth",
      ] satisfies (keyof Manifest)[]
    ).map((key) => [key, manifest[key]]),
  );
}

/** Build direct imports and maps; serialization prevents source and name injection. */
export function generateEntry(manifest: Manifest): string {
  const js = [
    "import bootstrap from '@darajs/core/bootstrap';",
    ...manifest.moduleDependencies.map((item) => `import ${JSON.stringify(item.source)};`),
    "import '/js/index.tsx';",
  ];
  const maps = [];
  let index = 0;
  for (const category of ["components", "actions", "auth"] as const) {
    const entries = [];
    for (const item of manifest[category]) {
      const binding = `implementation${index++}`;
      const specifier = item.source.startsWith("./") ? item.source.slice(1) : item.source;
      js.push(`import ${binding} from ${JSON.stringify(specifier)};`);
      // Computed keys also preserve a legal runtime name of __proto__.
      entries.push(`[${JSON.stringify(item.name)}]: ${binding}`);
    }
    maps.push(`${category}: {${entries.join(",")}}`);
  }
  js.push(`bootstrap({${maps.join(",")}});`);
  js.push(
    "if (import.meta.hot) import.meta.hot.on('dara:typecheck-clear', () => document.querySelector('vite-error-overlay')?.remove());",
  );
  return js.join("\n");
}
