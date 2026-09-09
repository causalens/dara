import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

export const version = z
  .object({ version: z.string() })
  .parse(JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"))).version;

const diagnosticSchema = z
  .object({ code: z.string(), message: z.string(), fix: z.string() })
  .strict();

export type Diagnostic = z.infer<typeof diagnosticSchema>;

const runtimeStatusSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("waiting") }).strict(),
  z.object({ state: z.literal("ready"), runtime: z.string() }).strict(),
  z.object({ state: z.literal("blocked"), diagnostic: diagnosticSchema }).strict(),
]);

export type RuntimeStatus = z.infer<typeof runtimeStatusSchema>;

const optionsSchema = z
  .object({
    inputs: z.array(z.string().min(1)).default([]),
    directories: z.array(z.string().min(1)).default([]),
    environment: z.array(z.string().min(1)).default([]),
  })
  .strict();

/** Additional inputs read by custom build plugins rather than ordinary module imports. */
export type DaraOptions = z.input<typeof optionsSchema>;
export type ParsedDaraOptions = z.output<typeof optionsSchema>;

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

/** Normalize user declarations once at the public plugin boundary. */
export function parseOptions(value: unknown): ParsedDaraOptions {
  const result = optionsSchema.safeParse(value);
  if (!result.success) {
    throw new ProjectError("vite.options", result.error.message, "edit dara() input declarations");
  }
  return result.data;
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

const source = z
  .string()
  .refine(
    (value) =>
      !value.includes("\\") &&
      (value.startsWith("./")
        ? path.posix.normalize(value).startsWith("js/")
        : /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+(?:\/[\w./-]+)?$/.test(value) &&
          !value.startsWith(".") &&
          !value.split("/").some((part) => part === ".." || part === ".")),
    { message: "expected a package import or ./js/ file" },
  );

/** Parse an import specifier before extracting its package identity. */
export function sourcePackage(value: unknown): string | null {
  const result = source.safeParse(value);
  if (!result.success) {
    throw new ProjectError(
      "source.invalid",
      `Invalid js_source: ${result.error.message}`,
      "edit js_source",
    );
  }
  const specifier = result.data;
  return specifier.startsWith("./")
    ? null
    : specifier
        .split("/")
        .slice(0, specifier.startsWith("@") ? 2 : 1)
        .join("/");
}

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
    pythonPackages: z.record(z.string(), z.string()).default({}),
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
  const {
    schema: schemaVersion,
    daraVersion,
    packageRequirements,
    moduleDependencies,
    components,
    actions,
    auth,
  } = manifest;
  return {
    schema: schemaVersion,
    daraVersion,
    packageRequirements,
    moduleDependencies,
    components,
    actions,
    auth,
    static: manifest.static.map(({ package: owner, target }) => ({ package: owner, target })),
  };
}

const relativePath = z
  .string()
  .min(1)
  .refine(
    (value) =>
      !value.includes("\\") &&
      !value.includes(":") &&
      !path.posix.isAbsolute(value) &&
      path.posix.normalize(value) === value &&
      !value.split("/").includes(".."),
  );
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const rootName = z.string().regex(/^(app|workspace|favicon|asset:[0-9]+|appStatic:[0-9]+)$/);
const portableSchema = schema
  .pick({
    schema: true,
    daraVersion: true,
    packageRequirements: true,
    moduleDependencies: true,
    components: true,
    actions: true,
    auth: true,
  })
  .extend({
    static: z.array(z.object({ package: z.string(), target: z.string() }).strict()),
  })
  .strict();
const markerSchema = z
  .object({
    schema: z.literal(1),
    daraVersion: z.string(),
    workspaceRoot: z.string().regex(/^(\.|\.\.(?:\/\.\.)*)$/),
    contract: portableSchema,
    contractDigest: hash,
    inputs: z.array(
      z.object({ root: rootName, path: relativePath, hash: hash.nullable() }).strict(),
    ),
    directories: z.array(
      z
        .object({
          root: rootName,
          path: relativePath,
          files: z.array(relativePath),
          recursive: z.boolean().default(true),
        })
        .strict(),
    ),
    environment: z.record(z.string(), hash),
    files: z.record(relativePath, hash),
  })
  .strict();

/** Parse a complete private marker before publication or destructive recovery decisions. */
export function parseBuildMarker(value: unknown) {
  const result = markerSchema.safeParse(value);
  if (!result.success) {
    throw new ProjectError("build.marker", result.error.message, "dara build");
  }
  if (result.data.contractDigest !== digest(result.data.contract)) {
    throw new ProjectError("build.marker", "Build contract digest is invalid", "dara build");
  }
  if (result.data.daraVersion !== result.data.contract.daraVersion) {
    throw new ProjectError("build.marker", "Build marker versions are inconsistent", "dara build");
  }
  return result.data;
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
