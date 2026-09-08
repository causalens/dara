import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

export const version = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url)),
).version;
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
  constructor(code, message, fix = "dara lock") {
    super(message);
    this.diagnostic = { code, message, fix };
  }
}

/** Parse an import specifier without interpreting package code or trusting traversal paths. */
export function sourcePackage(source) {
  if (typeof source !== "string" || source.includes("\\")) {
    throw new ProjectError("source.invalid", `Invalid js_source: ${source}`, "edit js_source");
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
    return source.startsWith("@") ? source.split("/").slice(0, 2).join("/") : source.split("/")[0];
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
    ctx.addIssue({ code: "custom", message: error.message });
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
export function parseManifest(raw) {
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
  for (const key of ["components", "actions", "auth"]) {
    const seen = new Map();
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
export function digest(value) {
  const canonical = (item) =>
    Array.isArray(item)
      ? item.map(canonical)
      : item && typeof item === "object"
        ? Object.fromEntries(
            Object.keys(item)
              .sort()
              .map((key) => [key, canonical(item[key])]),
          )
        : item;
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

/** Select the portable runtime contract, excluding machine-specific asset paths. */
export function portable(manifest) {
  return Object.fromEntries(
    [
      "schema",
      "daraVersion",
      "packageRequirements",
      "moduleDependencies",
      "components",
      "actions",
      "auth",
    ].map((key) => [key, manifest[key]]),
  );
}

/** Build direct imports and maps; serialization prevents source and name injection. */
export function generateEntry(manifest) {
  const js = [
    "import bootstrap from '@darajs/core/bootstrap';",
    ...manifest.moduleDependencies.map((item) => `import ${JSON.stringify(item.source)};`),
    "import '/js/index.tsx';",
  ];
  const maps = [];
  let index = 0;
  for (const category of ["components", "actions", "auth"]) {
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
