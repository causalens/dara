import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test, type TestContext } from "node:test";
import { getTsconfig, type TsConfigJson } from "get-tsconfig";
import { compilerArguments, compilerExecutable, type CompilerProject } from "../dist/compiler.js";

function fixture(t: TestContext) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "dara-native-types-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "node_modules"));
  fs.mkdirSync(path.join(root, "js"));
  fs.writeFileSync(path.join(root, "package.json"), '{"name":"typecheck-app","type":"module"}');
  // The monorepo pins TypeScript 7 under this alias for Dara's native compiler.
  fs.symlinkSync(
    fs.realpathSync(new URL("../../dara-core/node_modules/@typescript/native", import.meta.url)),
    path.join(root, "node_modules/typescript"),
    "dir",
  );
  fs.symlinkSync(
    fs.realpathSync(new URL("../node_modules/vite", import.meta.url)),
    path.join(root, "node_modules/vite"),
    "dir",
  );
  fs.writeFileSync(path.join(root, "js/index.tsx"), "export {};\n");
  const config = {
    extends: fs.realpathSync(new URL("../tsconfig.json", import.meta.url)),
    include: ["js"],
  };
  const project = (overrides: TsConfigJson = {}, sourceFiles: string[] = []) => {
    fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({ ...config, ...overrides }));
    const typescript = getTsconfig(root);
    assert(typescript);
    return { root, typescript, sourceFiles: new Set(sourceFiles) };
  };
  return { root, project };
}

function check(project: CompilerProject, mode?: string) {
  return spawnSync(compilerExecutable(project.root), compilerArguments(project, mode), {
    cwd: project.root,
    encoding: "utf8",
  });
}

await test("native checks include registered workspace source without an app JS import", (t) => {
  const { root, project } = fixture(t);
  const library = fs.mkdtempSync(path.join(path.dirname(root), "dara-registered-library-"));
  t.after(() => fs.rmSync(library, { recursive: true, force: true }));
  const file = path.join(library, "counter.ts");
  fs.writeFileSync(file, 'const count: number = "wrong"; export default () => count;');
  const current = project({}, [file]);
  const before = fs.readFileSync(path.join(root, "tsconfig.json"));
  const result = check(current);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /counter.ts.*TS2322/);
  assert.deepEqual(fs.readFileSync(path.join(root, "tsconfig.json")), before);
  fs.writeFileSync(file, "const count: number = 1; export default () => count;");
  assert.equal(check(current).status, 0);
});

await test("the original configDir, include, exclude and explicit files retain their meaning", (t) => {
  const { root, project } = fixture(t);
  fs.writeFileSync(path.join(root, "js/bad.ts"), 'export const bad: number = "wrong";');
  fs.writeFileSync(path.join(root, "js/ignored.ts"), 'export const ignored: boolean = "wrong";');
  const current = project({
    include: ["${configDir}/js"],
    exclude: ["${configDir}/js/ignored.ts"],
    files: ["${configDir}/js/index.tsx"],
    compilerOptions: { rootDir: "${configDir}" },
  });
  const result = check(current);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /bad.ts.*TS2322/);
  assert.doesNotMatch(result.stdout, /ignored.ts|TS6059/);
});

await test("custom typeRoots and existing ambient types coexist with registrations", (t) => {
  const { root, project } = fixture(t);
  fs.mkdirSync(path.join(root, "typings/custom"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "typings/custom/index.d.ts"),
    "declare const ambientCount: number;\n",
  );
  fs.writeFileSync(path.join(root, "js/index.tsx"), "export const count: number = ambientCount;\n");
  const file = path.join(root, "registered.ts");
  fs.writeFileSync(file, 'export const broken: number = "wrong";');
  const current = project(
    {
      compilerOptions: {
        types: ["vite/client", "custom"],
        typeRoots: ["${configDir}/node_modules", "${configDir}/typings"],
      },
    },
    [file],
  );
  const result = check(current);
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /registered.ts.*TS2322/);
  assert.doesNotMatch(result.stdout, /ambientCount|TS2688/);
});

await test("registration refresh removes old roots and keeps development separate from build", (t) => {
  const { root, project } = fixture(t);
  const file = path.join(root, "registered.ts");
  fs.writeFileSync(file, 'export const broken: number = "wrong";');
  const current = project({}, [file]);
  assert.notEqual(check(current, "dev").status, 0);
  const development = fs.readFileSync(path.join(root, "node_modules/.dara/registrations.dev.d.ts"));
  current.sourceFiles.clear();
  assert.equal(check(current, "build").status, 0);
  assert.deepEqual(
    fs.readFileSync(path.join(root, "node_modules/.dara/registrations.dev.d.ts")),
    development,
  );
  assert.equal(check(current, "dev").status, 0);
});
