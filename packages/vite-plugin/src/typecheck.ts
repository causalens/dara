import type { CompilerProject } from "./compiler.js";
import type { ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import type { ErrorPayload, HotPayload } from "vite";
import type { Diagnostic } from "./contract.js";
import { spawn } from "node:child_process";
import { compilerArguments, compilerExecutable } from "./compiler.js";
import { ProjectError, diagnostic } from "./contract.js";

/** The event and message protocol consumed by the checker, independent of Vite's transport. */
export interface TypecheckServer {
  ws: {
    send(payload: HotPayload): void;
    on(
      event: "connection",
      listener: (client: { send(payload: HotPayload): void }) => void,
    ): unknown;
    off(
      event: "connection",
      listener: (client: { send(payload: HotPayload): void }) => void,
    ): unknown;
  };
  watcher: {
    on(event: "all", listener: (event: string, file: string) => void): unknown;
    off(event: "all", listener: (event: string, file: string) => void): unknown;
  };
}

interface CompilerProcess {
  child: ChildProcessByStdio<null, Readable, Readable>;
  closed: Promise<void>;
}

/** Stop a direct native compiler within a bounded grace period. */
async function stopCompiler(process: CompilerProcess | undefined) {
  if (!process) {
    return;
  }
  process.child.kill("SIGTERM");
  const escalation = setTimeout(() => process.child.kill("SIGKILL"), 1000);
  let deadline: ReturnType<typeof setTimeout> | undefined;
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
export function startTypecheck(
  project: CompilerProject,
  server: TypecheckServer,
  blocked: (diagnostic: Diagnostic) => void,
) {
  const { root } = project;
  const executable = compilerExecutable(root);
  const compilerArgs = compilerArguments(project, "dev");
  let stopped = false;
  let mode = "watch";
  let running: CompilerProcess | undefined;
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastError: ErrorPayload | undefined;
  const connected = (client: { send(payload: HotPayload): void }) => {
    if (lastError) {
      client.send(lastError);
    }
  };
  server.ws.on("connection", connected);
  const publish = (output: string, success: boolean) => {
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
    const args = [...compilerArgs];
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
    const owned = {
      child,
      closed: new Promise<void>((resolve) => child.once("close", () => resolve())),
    };
    running = owned;
    let output = "";
    let spawnError: Error | undefined;
    const report = (data: Buffer) => {
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
        void stopCompiler(owned).catch((error: unknown) => blocked(diagnostic(error)));
      } else if (watching && mode === "watch") {
        // Pipe chunks can combine multiple compilations or split a summary.
        // Consume each completed report so the last compilation owns the overlay.
        let summary;
        while (
          (summary = /Found (\d+) errors?\. Watching for file changes\.(?:\r?\n|$)/.exec(output))
        ) {
          const end = summary.index + summary[0].length;
          publish(output.slice(0, end), summary[1] === "0");
          output = output.slice(end);
        }
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
  const changed = (_event: string, file: string) => {
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
