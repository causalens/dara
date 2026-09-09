import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";
import { analyzeMigration } from "../dist/migration.js";
import { version } from "../dist/contract.js";

function fixture(t: TestContext) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dara-migration-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (name: string, contents: string) => {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
    return file;
  };
  const request = {
    schema: 1,
    version,
    root,
    sourceRoot: path.join(root, "js"),
    registrations: [{ module: null, name: "Counter" }],
  };
  return { root, write, request };
}

await test("migration parses TSX and semicolonless barrels without executing app configuration", async (t) => {
  const { root, write, request } = fixture(t);
  write("vite.config.ts", 'throw new Error("Do not load user configuration");');
  write(".env", "DARA_MIGRATION_SHOULD_NOT_LOAD=true");
  write(
    "js/index.tsx",
    'import "./setup"\nexport { Counter } from "./counter"\nexport type { Props } from "./counter"',
  );
  write("js/setup.ts", 'throw new Error("Do not execute modules");');
  const file = write(
    "js/counter.tsx",
    "export type Props = {}; const text = `outer ${`inner ${1}`}`; const pattern = /[{}]/; const Counter = () => <div>{text}</div>; export { Counter };",
  );
  const result = await analyzeMigration(request);
  assert.deepEqual(result.resolutions, [{ kind: "local", file, name: "Counter" }]);
  assert.equal(result.entry.kind, "ready");
  assert.equal(process.env["DARA_MIGRATION_SHOULD_NOT_LOAD"], undefined);
  assert.equal(fs.existsSync(path.join(root, "node_modules")), false);
  assert(result.inputs.some((input) => input.path === file));
});

await test("migration excludes ambient and type-only exports and malformed modules", async (t) => {
  const { write, request } = fixture(t);
  write("js/index.tsx", 'export { default as Counter } from "./counter";');
  for (const body of [
    "export default interface Counter {}",
    "declare const Counter: unknown; export default Counter;",
    "const text = `export default function Counter() {}`;",
    "export default function Counter( {",
  ]) {
    write("js/counter.tsx", body);
    const result = await analyzeMigration(request);
    assert.equal(result.resolutions[0]?.kind, "manual", body);
  }
});

await test("migration verifies package subpaths against both browser modes", async (t) => {
  const { write, request } = fixture(t);
  const packageRoot = "node_modules/@acme/widgets/";
  const manifest = {
    name: "@acme/widgets",
    type: "module",
    exports: {
      ".": "./index.js",
      "./counter": { browser: { development: "./counter.js", production: "./counter.js" } },
    },
  };
  write(packageRoot + "package.json", JSON.stringify(manifest));
  write(packageRoot + "index.js", 'export { default as Counter } from "./counter.js";');
  write(packageRoot + "counter.js", "export default function Counter() {}");
  write(packageRoot + "different.js", "export default function Different() {}");
  const input = { ...request, registrations: [{ module: "@acme/widgets", name: "Counter" }] };
  assert.deepEqual((await analyzeMigration(input)).resolutions, [
    { kind: "package", source: "@acme/widgets/counter" },
  ]);
  manifest.exports["./counter"].browser.production = "./different.js";
  write(packageRoot + "package.json", JSON.stringify(manifest));
  assert.equal((await analyzeMigration(input)).resolutions[0]?.kind, "manual");
});

await test("migration follows inherited JSONC options and reports missing presets", async (t) => {
  const { root, write, request } = fixture(t);
  const preset = write(
    "base.json",
    '{ /* retain comments */ "compilerOptions": { "allowImportingTsExtensions": true, }, }',
  );
  write("tsconfig.json", '{"extends": ["./base.json"], "compilerOptions": { "strict": true }}');
  const result = await analyzeMigration({ ...request, registrations: [] });
  assert.deepEqual(result.typescript, { kind: "ready", typedImports: true });
  assert(result.inputs.some((input) => input.path === preset));
  write("tsconfig.json", '{"extends":"missing-preset"}');
  const missing = await analyzeMigration({ ...request, registrations: [] });
  assert.equal(missing.typescript.kind, "manual");
  if (missing.typescript.kind === "manual") {
    assert(missing.typescript.message.includes(path.join(root, "tsconfig.json")));
    assert(missing.typescript.message.includes("missing-preset"));
  }
});

await test("migration rejects mismatched protocol versions before accessing sources", async () => {
  await assert.rejects(analyzeMigration({ schema: 2 }), /schema/);
});
