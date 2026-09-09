import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getTsconfig } from "get-tsconfig";
import { createServer, defaultClientConditions, parseSync, type ViteDevServer } from "vite";
import { z } from "zod";
import { errorMessage, version } from "./contract.js";
import { selfReference } from "./exports.js";
import { inside } from "./files.js";

const registrationSchema = z
  .object({
    module: z
      .string()
      .regex(/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/)
      .nullable(),
    name: z.string().min(1),
  })
  .strict();
const requestSchema = z
  .object({
    schema: z.literal(1),
    version: z.literal(version),
    root: z.string().refine(path.isAbsolute, "must be an absolute app path"),
    sourceRoot: z.string().refine(path.isAbsolute, "must be an absolute source path"),
    registrations: z.array(registrationSchema),
  })
  .strict();
const resolutionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("local"), file: z.string(), name: z.string() }).strict(),
  z.object({ kind: z.literal("package"), source: z.string() }).strict(),
  z.object({ kind: z.literal("manual"), message: z.string() }).strict(),
]);
export const migrationAnalysisSchema = z
  .object({
    schema: z.literal(1),
    version: z.literal(version),
    entry: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("absent") }).strict(),
      z.object({ kind: z.literal("ready"), file: z.string() }).strict(),
      z.object({ kind: z.literal("manual"), file: z.string(), message: z.string() }).strict(),
    ]),
    typescript: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("ready"), typedImports: z.boolean() }).strict(),
      z.object({ kind: z.literal("manual"), message: z.string() }).strict(),
    ]),
    resolutions: z.array(resolutionSchema),
    inputs: z.array(
      z.object({ path: z.string(), realpath: z.string(), text: z.string().nullable() }).strict(),
    ),
    directories: z.array(
      z.object({ path: z.string(), entries: z.array(z.string()).nullable() }).strict(),
    ),
  })
  .strict();
type Resolution = z.infer<typeof resolutionSchema>;
type ParsedModule = ReturnType<typeof parseSync>;
type Statement = ParsedModule["program"]["body"][number];
type Export = { source: string; name: string };

/** Record the bytes and directory entries used to choose a migration source. */
class Inputs {
  modules = new Map<string, ParsedModule | null>();
  files = new Map<string, { path: string; realpath: string; text: string | null }>();
  directories = new Map<string, { path: string; entries: string[] | null }>();

  /** Keep the original bytes and symlink identity for Python's compare-before-write check. */
  read(file: string): string | null {
    const absolute = path.resolve(file);
    const previous = this.files.get(absolute);
    if (previous) {
      return previous.text;
    }
    const exists = fs.existsSync(absolute);
    const record = {
      path: absolute,
      realpath: exists ? fs.realpathSync(absolute) : absolute,
      text: exists ? fs.readFileSync(absolute, "utf8") : null,
    };
    this.files.set(absolute, record);
    return record.text;
  }

  /** Remember absent directories and candidate names, including unselected source extensions. */
  directory(directory: string): void {
    const absolute = path.resolve(directory);
    if (!this.directories.has(absolute)) {
      this.directories.set(absolute, {
        path: absolute,
        entries: fs.existsSync(absolute) ? fs.readdirSync(absolute).sort() : null,
      });
    }
  }

  /** Record package metadata that can change the meaning of a relative import. */
  ancestors(directory: string): void {
    for (let current = directory; ; current = path.dirname(current)) {
      this.read(path.join(current, "package.json"));
      if (path.dirname(current) === current) {
        break;
      }
    }
  }
}

function parseModule(file: string, inputs: Inputs): ParsedModule | null {
  if (inputs.modules.has(file)) {
    return inputs.modules.get(file) ?? null;
  }
  const text = inputs.read(file);
  const parsed = text === null ? null : parseSync(file, text);
  const result = parsed && parsed.errors.length === 0 ? parsed : null;
  inputs.modules.set(file, result);
  return result;
}

/** Apply the supported-barrel policy to an AST; Oxc supplies the actual export identities. */
function entryExports(parsed: ParsedModule | null): Map<string, Export> | null {
  if (
    !parsed ||
    parsed.program.body.some(
      (statement) =>
        statement.type !== "ImportDeclaration" &&
        statement.type !== "EmptyStatement" &&
        !(statement.type === "ExportNamedDeclaration" && !statement.declaration),
    )
  ) {
    return null;
  }
  const exports = new Map<string, Export>();
  for (const statement of parsed.module.staticExports) {
    for (const entry of statement.entries) {
      if (entry.isType) {
        continue;
      }
      if (
        !entry.moduleRequest ||
        entry.exportName.kind !== "Name" ||
        entry.importName.kind !== "Name" ||
        entry.exportName.name === null ||
        entry.importName.name === null
      ) {
        return null;
      }
      const name = entry.exportName.name;
      if (exports.has(name)) {
        return null;
      }
      exports.set(name, { source: entry.moduleRequest.value, name: entry.importName.name });
    }
  }
  return exports;
}

function runtimeNames(statement: Statement): string[] {
  if ("declare" in statement && statement.declare) {
    return [];
  }
  if (statement.type === "VariableDeclaration") {
    return statement.declarations.flatMap(({ id }) => (id.type === "Identifier" ? [id.name] : []));
  }
  if (statement.type === "FunctionDeclaration" || statement.type === "ClassDeclaration") {
    return statement.id ? [statement.id.name] : [];
  }
  return [];
}

function hasExport(file: string, name: string, inputs: Inputs): boolean {
  const parsed = parseModule(file, inputs);
  if (!parsed) {
    return false;
  }
  // Oxc identifies exports and type-only syntax. Local binding classification also
  // excludes ambient declarations forwarded by an otherwise value-shaped export.
  const bindings = new Set(
    parsed.program.body.flatMap((statement) => {
      if (statement.type === "ImportDeclaration") {
        return statement.importKind === "type"
          ? []
          : statement.specifiers.flatMap((specifier) =>
              specifier.type === "ImportSpecifier" && specifier.importKind === "type"
                ? []
                : [specifier.local.name],
            );
      }
      if (statement.type === "ExportDefaultDeclaration") {
        return statement.declaration.type === "FunctionDeclaration" ||
          statement.declaration.type === "ClassDeclaration"
          ? runtimeNames(statement.declaration)
          : [];
      }
      return runtimeNames(
        statement.type === "ExportNamedDeclaration" && statement.declaration
          ? statement.declaration
          : statement,
      );
    }),
  );
  return parsed.module.staticExports.some((statement) =>
    statement.entries.some((entry) => {
      const exported = entry.exportName.kind === "Default" ? "default" : entry.exportName.name;
      if (entry.isType || entry.moduleRequest || exported !== name) {
        return false;
      }
      return (
        entry.localName.kind === "None" ||
        (entry.localName.name !== null && bindings.has(entry.localName.name))
      );
    }),
  );
}

/** Analyze legacy sources through Vite/Oxc without loading application configuration or modules. */
export async function analyzeMigration(
  raw: unknown,
): Promise<z.infer<typeof migrationAnalysisSchema>> {
  const request = requestSchema.parse(raw);
  const root = fs.realpathSync(request.root);
  const inputs = new Inputs();
  const servers: ViteDevServer[] = [];
  try {
    inputs.ancestors(root);
    for (const mode of ["development", "production"]) {
      servers.push(
        await createServer({
          root,
          mode,
          configFile: false,
          envFile: false,
          plugins: [],
          logLevel: "silent",
          resolve: {
            conditions: [
              "dara-source",
              ...defaultClientConditions.map((condition) =>
                condition === "development|production" ? mode : condition,
              ),
            ],
          },
          server: { middlewareMode: true, watch: null, hmr: false },
          optimizeDeps: { noDiscovery: true, include: [], entries: [] },
        }),
      );
    }
    async function resolve(source: string, importer: string, mode = 0): Promise<string | null> {
      inputs.ancestors(path.dirname(importer));
      if (source.startsWith(".") || path.isAbsolute(source)) {
        const candidate = path.resolve(path.dirname(importer), source);
        inputs.ancestors(path.dirname(candidate));
        inputs.directory(path.dirname(candidate));
        if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
          inputs.directory(candidate);
          // Directory package mains can introduce another resolution context.
          // Require an explicit implementation file before rewriting that import.
          if (inputs.read(path.join(candidate, "package.json")) !== null) {
            return null;
          }
        }
      }
      const client = servers[mode]?.environments["client"];
      if (!client) {
        throw new Error("Vite client resolver is unavailable");
      }
      try {
        const result = await client.pluginContainer.resolveId(source, importer);
        if (!result || result.external || result.id.includes("?") || !path.isAbsolute(result.id)) {
          return null;
        }
        return fs.existsSync(result.id) && fs.statSync(result.id).isFile()
          ? fs.realpathSync(result.id)
          : null;
      } catch {
        return null;
      }
    }
    const entry = await resolve("./index", path.join(request.sourceRoot, "__dara_migration__.js"));
    const exports =
      entry === null
        ? new Map<string, Export>()
        : inside(request.sourceRoot, entry)
          ? entryExports(parseModule(entry, inputs))
          : null;
    const packageFields = z
      .object({ name: z.string(), exports: z.unknown().optional() })
      .passthrough();

    async function packageSource(module: string, name: string): Promise<string | null> {
      const candidates = [root];
      for (let directory = root; ; directory = path.dirname(directory)) {
        candidates.push(path.join(directory, "node_modules", module));
        if (path.dirname(directory) === directory) {
          break;
        }
      }
      let packageRoot: string | undefined;
      let packageJson: z.infer<typeof packageFields> | undefined;
      let publicSources: string[] = [];
      for (const directory of candidates) {
        const text = inputs.read(path.join(directory, "package.json"));
        if (text === null) {
          continue;
        }
        const parsed = packageFields.safeParse(JSON.parse(text));
        if (!parsed.success || parsed.data.name !== module) {
          continue;
        }
        packageRoot = directory;
        packageJson = parsed.data;
        const fields = z.record(z.unknown()).safeParse(parsed.data.exports);
        publicSources = fields.success
          ? Object.keys(fields.data)
              .filter((key) => key.startsWith("./") && !key.includes("*"))
              .map((key) => module + key.slice(1))
          : [];
        break;
      }
      if (!packageRoot || !packageJson) {
        return null;
      }
      const resolvedPackage = { root: fs.realpathSync(packageRoot), manifest: packageJson };
      const selected = (source: string, mode: number) => {
        try {
          return selfReference(resolvedPackage.root, resolvedPackage.manifest, source, [
            ...(servers[mode]?.config.resolve.conditions ?? []),
            "import",
          ]);
        } catch {
          return null;
        }
      };
      const implementations: string[] = [];
      const importer = path.join(root, "js/index.tsx");
      for (let mode = 0; mode < servers.length; mode++) {
        const barrel = await resolve(module, importer, mode);
        if (barrel !== selected(module, mode)) {
          return null;
        }
        const exported = barrel ? entryExports(parseModule(barrel, inputs))?.get(name) : undefined;
        if (!barrel || exported?.name !== "default" || !exported.source.startsWith(".")) {
          return null;
        }
        const file = await resolve(exported.source, barrel, mode);
        if (!file || !hasExport(file, "default", inputs)) {
          return null;
        }
        implementations.push(file);
      }
      for (const source of publicSources) {
        const resolved = await Promise.all(
          servers.map((_, mode) => resolve(source, importer, mode)),
        );
        if (
          resolved.every(
            (file, index) => file === implementations[index] && file === selected(source, index),
          )
        ) {
          return source;
        }
      }
      return null;
    }

    const resolutions: Resolution[] = [];
    for (const registration of request.registrations) {
      if (registration.module !== null) {
        const source = await packageSource(registration.module, registration.name);
        resolutions.push(
          source
            ? { kind: "package", source }
            : {
                kind: "manual",
                message: `Inspect ${JSON.stringify(registration.module)} and set js_source to a verified default-export component/action subpath. Install the package first if its exports are not available locally.`,
              },
        );
        continue;
      }
      const exported = exports?.get(registration.name);
      if (!entry || !exported) {
        resolutions.push({
          kind: "manual",
          message: `No unique explicit re-export for ${JSON.stringify(registration.name)}; add a default-export implementation and literal js_source.`,
        });
        continue;
      }
      const file = exported.source.startsWith(".") ? await resolve(exported.source, entry) : null;
      if (!file || !inside(request.sourceRoot, file) || !hasExport(file, exported.name, inputs)) {
        resolutions.push({
          kind: "manual",
          message: `Cannot prove export ${JSON.stringify(exported.name)} from ${JSON.stringify(exported.source)}; add js_source manually.`,
        });
        continue;
      }
      resolutions.push({ kind: "local", file, name: exported.name });
    }

    const appConfig = path.join(root, "tsconfig.json");
    // Preparation initializes an absent app config from this version's packaged preset.
    const tsconfig =
      inputs.read(appConfig) === null
        ? fileURLToPath(new URL("../tsconfig.json", import.meta.url))
        : appConfig;
    let typescript: z.infer<typeof migrationAnalysisSchema>["typescript"] = {
      kind: "ready",
      typedImports: true,
    };
    {
      const cache = new Map<string, unknown>();
      try {
        typescript = {
          kind: "ready",
          typedImports:
            getTsconfig(path.dirname(tsconfig), path.basename(tsconfig), cache)?.config
              .compilerOptions?.allowImportingTsExtensions === true,
        };
      } catch (error) {
        typescript = {
          kind: "manual",
          message: `Cannot load ${tsconfig}: ${errorMessage(error)}. Install the referenced preset or correct its extends path before migrating typed imports.`,
        };
      }
      for (const [key, value] of cache) {
        if (key.startsWith("readFileSync:") && key.endsWith(":utf8") && typeof value === "string") {
          const file = key.slice(13, -5);
          const actual = inputs.read(file);
          if (actual !== value) {
            throw new Error(`${file} changed during migration analysis`);
          }
        }
      }
    }
    return {
      schema: 1,
      version,
      entry:
        entry === null
          ? { kind: "absent" }
          : exports !== null
            ? { kind: "ready", file: entry }
            : {
                kind: "manual",
                file: entry,
                message:
                  "Entry contains executable statements or ambiguous exports. Move implementations into separate modules and leave explicit re-exports plus setup/style imports in the entry.",
              },
      typescript,
      resolutions,
      inputs: [...inputs.files.values()],
      directories: [...inputs.directories.values()],
    };
  } catch (error) {
    throw new Error(`Cannot analyze migration sources: ${errorMessage(error)}`, { cause: error });
  } finally {
    await Promise.all(servers.map((server) => server.close()));
  }
}
