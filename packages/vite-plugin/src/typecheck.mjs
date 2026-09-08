import path from "node:path";
import { spawn } from "node:child_process";
import { compilerExecutable } from "./compiler.mjs";
import { ProjectError } from "./contract.mjs";

/** Stop a direct native compiler within a bounded grace period. */
async function stopCompiler(process) {
  if (!process) {
    return;
  }
  process.child.kill("SIGTERM");
  const escalation = setTimeout(() => process.child.kill("SIGKILL"), 1000);
  let deadline;
  try {
    await Promise.race([
      process.closed,
      new Promise((_, reject) => {
        deadline = setTimeout(
          () =>
            reject(
              new ProjectError(
                "typescript.shutdown",
                "Compiler did not stop after SIGKILL",
                "stop the compiler process before restarting development",
              ),
            ),
          2000,
        );
      }),
    ]);
  } finally {
    clearTimeout(escalation);
    clearTimeout(deadline);
  }
}

/** Own compiler checks, replay diagnostics and use Vite changes if native watching fails. */
export function startTypecheck(root, server, blocked) {
  const executable = compilerExecutable(root);
  let stopped = false;
  let mode = "watch";
  let running;
  let pending = false;
  let timer;
  let lastError;
  const connected = (client) => {
    if (lastError) {
      client.send(lastError);
    }
  };
  server.ws.on("connection", connected);
  const publish = (output, success) => {
    if (success) {
      lastError = undefined;
      server.ws.send({ type: "custom", event: "dara:typecheck-clear", data: {} });
    } else {
      lastError = { type: "error", err: { message: output, stack: "", plugin: "Dara TypeScript" } };
      server.ws.send(lastError);
    }
  };
  const run = () => {
    if (stopped) {
      return;
    }
    if (running) {
      pending = true;
      return;
    }
    pending = false;
    const watching = mode === "watch";
    const args = ["--project", path.join(root, "tsconfig.json"), "--noEmit", "--pretty", "false"];
    if (watching) {
      args.push("--watch", "--preserveWatchOutput");
    }
    const child = spawn(executable, args, {
      cwd: root,
      env: process.env,
      // Stay in the runner's process group so Python's forced shutdown owns us.
      detached: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const owned = { child, closed: new Promise((resolve) => child.once("close", resolve)) };
    running = owned;
    let output = "";
    let spawnError;
    const report = (data) => {
      const chunk = data.toString();
      process.stderr.write(`[typescript] ${chunk}`);
      output += chunk;
      if (
        watching &&
        mode === "watch" &&
        /error starting FSEvents stream|EMFILE|ENOSPC/.test(output)
      ) {
        mode = "check";
        pending = true;
        process.stderr.write(
          "[typescript] Native watching failed; using Vite changes for serialized type checks.\n",
        );
        void stopCompiler(owned).catch((error) => blocked(error.diagnostic));
      } else if (watching && mode === "watch" && /Found \d+ errors?\. Watching/.test(output)) {
        publish(output, output.includes("Found 0 errors"));
        output = "";
      }
    };
    child.stdout.on("data", report);
    child.stderr.on("data", report);
    child.on("error", (error) => {
      spawnError = error;
    });
    child.on("close", (code) => {
      running = undefined;
      if (stopped) {
        return;
      }
      if (spawnError || (watching && mode === "watch")) {
        blocked({
          code: "typescript.runner",
          message: spawnError?.message ?? `TypeScript watcher exited ${code}`,
          fix: "dara dev",
        });
        return;
      }
      if (!watching) {
        publish(output, code === 0);
      }
      if (pending) {
        run();
      }
    });
  };
  const changed = (_event, file) => {
    if (mode === "check" && /\.(?:[cm]?tsx?|json)$/.test(file)) {
      clearTimeout(timer);
      timer = setTimeout(run, 150);
    }
  };
  server.watcher.on("all", changed);
  run();
  return async () => {
    stopped = true;
    clearTimeout(timer);
    server.ws.off("connection", connected);
    server.watcher.off("all", changed);
    await stopCompiler(running);
  };
}
