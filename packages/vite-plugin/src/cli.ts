#!/usr/bin/env node
import path from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { checkTypes, buildProject } from "./build.js";
import { ProjectError, diagnostic } from "./contract.js";
import { serveProject } from "./dev.js";
import { initialize, loadProject } from "./project.js";
import { readJson } from "./files.js";

// Configuration may log while loading. Reserve stdout for the runner protocol.
console.log = console.error;
console.info = console.error;
console.debug = console.error;

const commandSchema = z.tuple([z.enum(["serve", "init", "check", "check-project", "build"])]);
try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      root: { type: "string" },
      "base-url": { type: "string", default: "" },
      "no-typecheck": { type: "boolean" },
      "no-deps-build": { type: "boolean" },
      token: { type: "string" },
    },
  });
  const root = path.resolve(values.root ?? process.cwd());
  const command = commandSchema.safeParse(positionals);
  if (!command.success) {
    throw new ProjectError(
      "command.unknown",
      `Expected one plugin operation: ${command.error.message}`,
      "dara check",
    );
  }
  const [operation] = command.data;
  if (operation === "serve") {
    await serveProject(root, {
      baseUrl: values["base-url"],
      noTypecheck: values["no-typecheck"] ?? false,
      ...(values.token === undefined ? {} : { token: values.token }),
    });
  } else {
    const created = operation === "init" ? initialize(root) : [];
    let raw;
    if (operation === "build") {
      raw = readJson(path.join(root, "node_modules/.dara/manifest.build.json"));
    } else {
      let data = "";
      for await (const chunk of process.stdin) {
        data += chunk;
      }
      raw = JSON.parse(data);
    }
    const project = await loadProject(root, raw, operation === "build" ? "build" : "serve");
    if (operation === "check") {
      await checkTypes(project);
    }
    const result =
      operation === "build"
        ? await buildProject(project, { noDepsBuild: values["no-deps-build"] ?? false })
        : { created, runtime: process.version };
    process.stdout.write(JSON.stringify(result) + "\n");
  }
} catch (error) {
  process.stdout.write(JSON.stringify([diagnostic(error)]) + "\n");
  process.exitCode = 1;
}
