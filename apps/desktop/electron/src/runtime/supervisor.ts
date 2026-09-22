import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { validateReadyMessage } from "./contracts";

export interface OwnedRuntime {
  child: ChildProcessWithoutNullStreams;
  port: number;
  origin: string;
  send(message: object): void;
  stop(): Promise<void>;
}

export interface RuntimeOptions {
  executable: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  instanceId: string;
  kind: "local-service" | "renderer";
  capability?: string;
  timeoutMs?: number;
  onUnexpectedExit(): void;
  log(event: string): void;
}

export async function readStorageHealth(origin: string, capability: string, instanceId?: string, rendererOrigin?: string, timeoutMs = 4_000): Promise<{ status: string; storage: string }> {
  const response = await fetch(`${origin}/__desktop/health`, {
    headers: { "X-Bizovix-Local-Capability": capability, ...(rendererOrigin ? { Origin: rendererOrigin } : {}) },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "error",
  });
  if (!response.ok) throw new Error("DESKTOP_SERVICE_HEALTH_FAILED");
  const body = await response.json() as Record<string, unknown>;
  if (body.status !== "ready" || (instanceId && body.instanceId !== instanceId)) {
    throw new Error("DESKTOP_SERVICE_IDENTITY_FAILED");
  }
  return { status: "ready", storage: typeof body.storage === "string" ? body.storage : "ready" };
}

export function startOwnedRuntime(options: RuntimeOptions): Promise<OwnedRuntime> {
  return new Promise((resolve, reject) => {
    const child = spawn(options.executable, options.args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let settled = false;
    let ready = false;
    let stopping = false;
    let checking = false;
    let output = "";
    const startupBudget = options.timeoutMs ?? 45_000;
    const deadline = performance.now() + startupBudget;
    const remainingBudget = () => Math.max(1, Math.ceil(deadline - performance.now()));
    const timeout = setTimeout(() => fail(checking ? "DESKTOP_HEALTH_TIMEOUT" : "DESKTOP_START_TIMEOUT"), startupBudget);
    const fail = (code: string) => {
      if (settled) return;
      settled = true;
      stopping = true;
      clearTimeout(timeout);
      options.log(`${options.kind}:${code}`);
      const error = new Error(code);
      if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
        reject(error);
        return;
      }
      const killTimeout = setTimeout(() => reject(error), 2_000);
      child.once("close", () => { clearTimeout(killTimeout); reject(error); });
      child.kill();
    };
    child.on("error", () => fail("DESKTOP_PROCESS_START_FAILED"));
    child.stdin.on("error", () => { /* Exit/error handlers own lifecycle; never log pipe contents. */ });
    child.on("exit", () => {
      if (!settled) fail("DESKTOP_PROCESS_EXITED_DURING_START");
      else if (ready && !stopping) {
        options.log(`${options.kind}:unexpected-exit`);
        options.onUnexpectedExit();
      }
    });
    // Child output may contain customer details, filesystem paths or framework
    // diagnostics. Drain it, but persist only our fixed lifecycle event codes.
    child.stderr.resume();
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (settled || checking) return;
      output += chunk;
      if (output.length > 65_536) return fail("DESKTOP_HANDSHAKE_TOO_LARGE");
      let newline: number;
      while ((newline = output.indexOf("\n")) >= 0) {
        const line = output.slice(0, newline);
        output = output.slice(newline + 1);
        let parsed: unknown;
        try { parsed = JSON.parse(line); } catch { continue; }
        const message = validateReadyMessage(parsed, options.instanceId);
        if (!message) continue;
        checking = true;
        const origin = `http://127.0.0.1:${message.port}`;
        void (async () => {
          try {
            if (options.kind === "local-service") {
              if (!options.capability) throw new Error("DESKTOP_CAPABILITY_MISSING");
              await readStorageHealth(origin, options.capability, options.instanceId, undefined, remainingBudget());
            } else {
              // A cold Next render can legitimately take more than ten seconds.
              // Readiness shares the original bounded startup deadline rather
              // than introducing a shorter, contradictory first-request limit.
              const response = await fetch(`${origin}/`, { signal: AbortSignal.timeout(remainingBudget()), redirect: "manual" });
              await response.body?.cancel();
              if (response.status >= 500) {
                options.log(`renderer:http-status-${response.status}`);
                throw new Error("DESKTOP_RENDERER_HEALTH_FAILED");
              }
            }
            if (settled || child.exitCode !== null || child.signalCode !== null) return fail("DESKTOP_PROCESS_EXITED_DURING_START");
            settled = true;
            ready = true;
            clearTimeout(timeout);
            options.log(`${options.kind}:ready`);
            resolve({
              child,
              port: message.port,
              origin,
              send(value) {
                if (!child.stdin.destroyed && !stopping) child.stdin.write(`${JSON.stringify(value)}\n`);
              },
              async stop() {
                if (stopping) return;
                stopping = true;
                if (child.exitCode !== null || child.signalCode !== null) return;
                await new Promise<void>((done) => {
                  let killTimeout: NodeJS.Timeout | undefined;
                  const timer = setTimeout(() => {
                    child.kill();
                    killTimeout = setTimeout(done, 2_000);
                  }, 5_000);
                  child.once("close", () => { clearTimeout(timer); clearTimeout(killTimeout); done(); });
                  if (!child.stdin.destroyed) child.stdin.end(`${JSON.stringify({ type: "shutdown" })}\n`);
                  else child.kill();
                });
                options.log(`${options.kind}:stopped`);
              },
            });
          } catch (error) {
            if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
              fail("DESKTOP_HEALTH_TIMEOUT");
              return;
            }
            if (error instanceof Error && /^[A-Z_]+$/.test(error.message)) options.log(`${options.kind}:${error.message}`);
            fail("DESKTOP_HEALTH_CHECK_FAILED");
          }
        })();
        break;
      }
    });
  });
}
