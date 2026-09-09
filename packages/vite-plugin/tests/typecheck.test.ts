import assert from "node:assert/strict";
import type { HotPayload } from "vite";
import { ProjectError, type Diagnostic } from "../dist/contract.js";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { startTypecheck } from "../dist/typecheck.js";
import { compilerExecutable } from "../dist/compiler.js";

class TestSocket extends EventEmitter {
  send: (message: HotPayload) => void = () => {};
}

function compilerFixture(
  root: string,
  platform: NodeJS.Platform = process.platform,
  arch = process.arch,
) {
  const name = `@typescript/typescript-${platform}-${arch}`;
  const compiler = path.join(root, "node_modules/typescript");
  const native = path.join(root, "node_modules", name);
  fs.mkdirSync(compiler, { recursive: true });
  fs.mkdirSync(path.join(native, "lib"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), "{}");
  fs.writeFileSync(
    path.join(compiler, "package.json"),
    JSON.stringify({
      name: "typescript",
      version: "7.0.2",
      optionalDependencies: { [name]: "7.0.2" },
      bin: { tsc: "bin/tsc" },
    }),
  );
  fs.writeFileSync(
    path.join(native, "package.json"),
    JSON.stringify({ name, version: "7.0.2", os: [platform], cpu: [arch] }),
  );
  // There is deliberately no bin/tsc launcher: invoking one fails this fixture.
  return path.join(native, "lib", platform === "win32" ? "tsc.exe" : "tsc");
}

async function until(predicate: () => boolean) {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, "compiler should respond within five seconds");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

await test(
  "native watch failure switches to checks that recover on Vite changes",
  { skip: process.platform === "win32" },
  async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dara-watch-fallback-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.writeFileSync(
      compilerFixture(root),
      `#!${process.execPath}
const fs = require('node:fs');
if (process.argv.includes('--watch')) {
  console.error('error starting FSEvents stream');
  setInterval(() => {}, 50);
} else if (!fs.existsSync('fixed')) {
  console.error('index.ts(1,1): error TS2322: incompatible type');
  process.exitCode = 1;
}
`,
      { mode: 0o755 },
    );
    const ws = new TestSocket();
    const watcher = new EventEmitter();
    const sent: HotPayload[] = [];
    ws.send = (message) => sent.push(message);
    const errors: Diagnostic[] = [];
    const stop = startTypecheck(root, { ws, watcher }, (error) => errors.push(error));
    try {
      await until(() => sent.some((message) => message.type === "error"));
      fs.writeFileSync(path.join(root, "fixed"), "");
      watcher.emit("all", "change", path.join(root, "js/index.ts"));
      await until(() =>
        sent.some(
          (message) => message.type === "custom" && message.event === "dara:typecheck-clear",
        ),
      );
      assert.deepEqual(errors, []);
    } finally {
      await stop();
    }
    assert.equal(watcher.listenerCount("all"), 0);
  },
);

await test("native compiler adapter selects locked Windows, macOS and Linux packages", () => {
  const descriptor = Object.getOwnPropertyDescriptor(process, "platform");
  assert(descriptor);
  try {
    for (const platform of ["win32", "darwin", "linux"] as const) {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "dara-compiler-"));
      try {
        const executable = compilerFixture(root, platform);
        fs.writeFileSync(executable, "native compiler fixture");
        Object.defineProperty(process, "platform", { value: platform });
        assert.equal(compilerExecutable(root), fs.realpathSync(executable));
        fs.rmSync(executable);
        assert.throws(
          () => compilerExecutable(root),
          (error) =>
            error instanceof ProjectError &&
            error.diagnostic.code === "typescript.runner" &&
            error.diagnostic.fix === "dara lock",
        );
      } finally {
        Object.defineProperty(process, "platform", descriptor);
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  } finally {
    Object.defineProperty(process, "platform", descriptor);
  }
});

await test(
  "type checker replays existing errors, clears them and stops its compiler process",
  { skip: process.platform === "win32" },
  async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dara-typecheck-"));
    t.after(() => {
      fs.rmSync(root, { recursive: true, force: true });
    });
    // A real process speaks the compiler's watch protocol so the test exercises
    // asynchronous output, late browser connections and process shutdown together.
    fs.writeFileSync(
      compilerFixture(root),
      `#!${process.execPath}
const fs = require('node:fs');
fs.writeFileSync('compiler.pid', String(process.pid));
console.log('index.tsx(1,1): error TS2322: incompatible type');
console.log('Found 1 error. Watching for file changes.');
setInterval(() => {
  if (fs.existsSync('fixed')) {
    fs.unlinkSync('fixed');
    console.log('Found 0 errors. Watching for file changes.');
  }
}, 20);
`,
      { mode: 0o755 },
    );
    const ws = new TestSocket();
    const sent: HotPayload[] = [];
    ws.send = (message) => sent.push(message);
    const errors: Diagnostic[] = [];
    const stop = startTypecheck(root, { ws, watcher: new EventEmitter() }, (diagnostic) =>
      errors.push(diagnostic),
    );
    try {
      await until(() => sent.length > 0);
      assert.equal(sent[0]?.type, "error");
      const replay: HotPayload[] = [];
      const client = { send: (message: HotPayload) => replay.push(message) };
      ws.emit("connection", client);
      assert.deepEqual(replay, [sent[0]], "a late browser sees the current failure");
      fs.writeFileSync(path.join(root, "fixed"), "");
      await until(() =>
        sent.some(
          (message) => message.type === "custom" && message.event === "dara:typecheck-clear",
        ),
      );
      ws.emit("connection", client);
      assert.equal(replay.length, 1, "the old diagnostic is not replayed after recovery");
    } finally {
      await stop();
    }
    assert.deepEqual(errors, [], "intentional shutdown is not a checker failure");
    assert.equal(ws.listenerCount("connection"), 0);
    const pid = Number(fs.readFileSync(path.join(root, "compiler.pid"), "utf8"));
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  },
);

await test(
  "checker shutdown escalates stubborn native processes and handles early exit",
  { skip: process.platform === "win32" },
  async (t) => {
    for (const stubborn of [false, true]) {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "dara-checker-exit-"));
      t.after(() => fs.rmSync(root, { recursive: true, force: true }));
      fs.writeFileSync(
        compilerFixture(root),
        `#!${process.execPath}
const fs = require('node:fs');
${stubborn ? "process.on('SIGTERM', () => {}); setInterval(() => {}, 50);" : "process.exitCode = 1;"}
fs.writeFileSync('compiler.pid', String(process.pid));
`,
        { mode: 0o755 },
      );
      const ws = new TestSocket();
      ws.send = () => {};
      const errors: Diagnostic[] = [];
      const stop = startTypecheck(root, { ws, watcher: new EventEmitter() }, (error) =>
        errors.push(error),
      );
      await until(() => fs.existsSync(path.join(root, "compiler.pid")));
      const pid = Number(fs.readFileSync(path.join(root, "compiler.pid"), "utf8"));
      if (!stubborn) {
        await until(() => errors.length > 0);
      }
      const started = Date.now();
      await stop();
      assert.ok(Date.now() - started < 2500, "shutdown is bounded even if TERM is ignored");
      assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
      assert.equal(errors.length, stubborn ? 0 : 1);
    }
  },
);
