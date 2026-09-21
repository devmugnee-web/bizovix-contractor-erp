import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { rm } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const turboBin = path.join(repositoryRoot, "node_modules", "turbo", "bin", "turbo");
const turboPackageJson = path.join(repositoryRoot, "node_modules", "turbo", "package.json");
const apiUrl = "http://127.0.0.1:4000/api/v1/auth/dev-login";
const rendererUrl = "http://127.0.0.1:3010/dashboard";
const apiBuildDirectory = path.join(repositoryRoot, "apps", "api", "dist");
const startupTimeoutMs = Number(process.env.BIZOVIX_DEV_STARTUP_TIMEOUT_MS ?? 300_000);
const lockFile = path.join(
  os.tmpdir(),
  `bizovix-dev-${createHash("sha256").update(repositoryRoot.toLowerCase()).digest("hex").slice(0, 12)}.lock`,
);
let lockFileDescriptor = null;

function resolveNativeTurboBin() {
  const platform = process.platform === "win32" ? "windows" : process.platform;
  const architecture = process.arch === "x64" ? "64" : process.arch;
  if (
    !["windows", "darwin", "linux"].includes(platform) ||
    !["64", "arm64"].includes(architecture)
  ) {
    return null;
  }

  try {
    const { version } = JSON.parse(readFileSync(turboPackageJson, "utf8"));
    const executable = process.platform === "win32" ? "turbo.exe" : "turbo";
    const nativeBin = path.join(
      repositoryRoot,
      "node_modules",
      ".pnpm",
      `@turbo+${platform}-${architecture}@${version}`,
      "node_modules",
      "@turbo",
      `${platform}-${architecture}`,
      "bin",
      executable,
    );
    return existsSync(nativeBin) ? nativeBin : null;
  } catch {
    return null;
  }
}

const nativeTurboBin = resolveNativeTurboBin();

function log(message) {
  process.stdout.write(`[dev] ${message}\n`);
}

function processIsRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

async function stopExistingLauncher(pid) {
  if (!processIsRunning(pid)) return;

  if (process.platform === "win32") {
    await new Promise((resolve, reject) => {
      const killer = spawn("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
      killer.once("error", reject);
      killer.once("exit", (code) => {
        if (code === 0 || !processIsRunning(pid)) resolve();
        else reject(new Error(`Could not stop the previous Bizovix launcher (PID ${pid}).`));
      });
    });
  } else {
    process.kill(pid, "SIGTERM");
  }

  const exitDeadline = Date.now() + 10_000;
  while (processIsRunning(pid) && Date.now() < exitDeadline) {
    await delay(250);
  }
  if (processIsRunning(pid)) {
    throw new Error(`Previous Bizovix launcher PID ${pid} did not stop.`);
  }
}

async function acquireDevLock() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      lockFileDescriptor = openSync(lockFile, "wx");
      writeFileSync(
        lockFileDescriptor,
        JSON.stringify({ pid: process.pid, repositoryRoot, startedAt: new Date().toISOString() }),
        "utf8",
      );
      process.once("exit", releaseDevLock);
      return;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;

      let owner = null;
      try {
        owner = JSON.parse(readFileSync(lockFile, "utf8"));
      } catch {
        // An invalid lock is treated as stale and replaced below.
      }

      if (processIsRunning(owner?.pid)) {
        if (path.resolve(owner?.repositoryRoot ?? "").toLowerCase() !== repositoryRoot.toLowerCase()) {
          throw new Error(`The Bizovix startup lock is owned by an unexpected process (PID ${owner.pid}).`);
        }

        log(
          `Taking over from the previous Bizovix launcher (PID ${owner.pid}) so this terminal owns the dev services...`,
        );
        await stopExistingLauncher(owner.pid);
      }

      rmSync(lockFile, { force: true });
    }
  }

  throw new Error("Could not acquire the Bizovix dev startup lock. Run pnpm dev again.");
}

function releaseDevLock() {
  if (lockFileDescriptor === null) return;

  const descriptor = lockFileDescriptor;
  lockFileDescriptor = null;
  try {
    closeSync(descriptor);
  } catch {
    // The descriptor may already be closed during process shutdown.
  }
  try {
    rmSync(lockFile, { force: true });
  } catch {
    // A later run will safely replace a stale lock owned by a stopped process.
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function clearStaleApiBuild() {
  if (!existsSync(apiBuildDirectory)) return;

  log("Clearing the generated API build from the previous run...");
  await rm(apiBuildDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
}

async function apiIsReady() {
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      signal: AbortSignal.timeout(3_000),
    });
    if (![200, 201].includes(response.status)) return false;
    const payload = await response.json().catch(() => null);
    return Boolean(payload?.success && payload?.data?.accessToken);
  } catch {
    return false;
  }
}

async function rendererIsReady() {
  try {
    const response = await fetch(rendererUrl, {
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status !== 200) return false;
    const html = await response.text();
    return html.includes("Bizovix Contractor ERP");
  } catch {
    return false;
  }
}

function portIsAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen({ host: "0.0.0.0", port, exclusive: true }, () => {
      server.close(() => resolve(true));
    });
  });
}

async function waitFor(check, timeoutMs, childState) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await check()) return true;
    if (childState?.exited) return false;
    await delay(750);
  }
  return false;
}

async function settleOccupiedService(name, port, check, waitMs) {
  if (await check()) return true;
  if (await portIsAvailable(port)) return false;

  log(`${name} port ${port} is occupied; waiting for the existing process to become ready...`);
  if (await waitFor(check, waitMs)) return true;
  throw new Error(
    `${name} port ${port} is occupied by an unhealthy or unrelated process. Close that process, then run pnpm dev again.`,
  );
}

async function runDev() {
  log("Checking the local API and renderer...");
  let apiReady = await settleOccupiedService("API", 4000, apiIsReady, 20_000);
  let rendererReady = await settleOccupiedService("Renderer", 3010, rendererIsReady, 45_000);

  if (apiReady) log("Reusing the healthy API on http://localhost:4000/api/v1");
  if (rendererReady) log("Reusing the healthy renderer on http://localhost:3010");
  if (apiReady && rendererReady) {
    log("Bizovix is ready: http://localhost:3010");
    log("Monitoring the running services. Press Ctrl+C to stop this command.");
    while (true) {
      await delay(5_000);
      const [apiStillReady, rendererStillReady] = await Promise.all([
        apiIsReady(),
        rendererIsReady(),
      ]);
      if (!apiStillReady || !rendererStillReady) {
        throw new Error(
          `A reused local service stopped: API ${apiStillReady ? "ready" : "not ready"}, renderer ${
            rendererStillReady ? "ready" : "not ready"
          }. Run pnpm dev again to recover it.`,
        );
      }
    }
  }

  const runners = [];
  let shuttingDown = false;
  let launchedApi = false;
  let launchedRenderer = false;

  function startRunner(filters, label) {
    log(`Starting ${label}...`);
    const command = nativeTurboBin ?? process.execPath;
    const args = nativeTurboBin ? ["run", "dev", ...filters] : [turboBin, "run", "dev", ...filters];
    const runnerEnvironment = {
      ...process.env,
      BIZOVIX_API_READY_TIMEOUT_MS:
        process.env.BIZOVIX_API_READY_TIMEOUT_MS ?? String(startupTimeoutMs + 30_000),
    };
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: runnerEnvironment,
      stdio: "inherit",
    });
    const state = { child, exited: false, code: null, signal: null, error: null };
    state.exit = new Promise((resolve) => {
      child.once("error", (error) => {
        state.exited = true;
        state.error = error;
        resolve();
      });
      child.once("exit", (code, signal) => {
        state.exited = true;
        state.code = code;
        state.signal = signal;
        resolve();
      });
    });
    runners.push(state);
  }

  async function stopRunner(runner) {
    if (runner.exited || !runner.child.pid) return;

    if (process.platform === "win32") {
      await new Promise((resolve) => {
        const killer = spawn("taskkill.exe", ["/PID", String(runner.child.pid), "/T", "/F"], {
          stdio: "ignore",
          windowsHide: true,
        });
        killer.once("error", () => {
          if (!runner.exited) runner.child.kill("SIGTERM");
          resolve();
        });
        killer.once("exit", resolve);
      });
    } else {
      try {
        process.kill(-runner.child.pid, "SIGTERM");
      } catch {
        if (!runner.exited) runner.child.kill("SIGTERM");
      }
    }

    await Promise.race([runner.exit, delay(5_000)]);
    if (!runner.exited) {
      try {
        if (process.platform === "win32") runner.child.kill("SIGKILL");
        else process.kill(-runner.child.pid, "SIGKILL");
      } catch {
        // The process may have exited between the readiness check and the kill call.
      }
    }
  }

  let stopPromise = null;
  function stopRunners() {
    stopPromise ??= Promise.all(runners.map((runner) => stopRunner(runner)));
    return stopPromise;
  }

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      shuttingDown = true;
      log("Stopping API and renderer...");
      void stopRunners();
    });
  }

  const initialFilters = [];
  const initialLabels = [];
  if (!apiReady) {
    initialFilters.push("--filter=@bizovix/api");
    initialLabels.push("API");
    launchedApi = true;
  }
  if (!rendererReady) {
    initialFilters.push("--filter=@bizovix/renderer");
    initialLabels.push("renderer");
    launchedRenderer = true;
  }
  if (launchedApi) await clearStaleApiBuild();
  startRunner(initialFilters, initialLabels.join(" and "));

  const apiStartupDeadline = Date.now() + startupTimeoutMs;
  let rendererStartupDeadline = apiReady ? Date.now() + startupTimeoutMs : null;
  while (true) {
    [apiReady, rendererReady] = await Promise.all([apiIsReady(), rendererIsReady()]);
    if (apiReady && rendererReady) break;

    if (apiReady && rendererStartupDeadline === null) {
      rendererStartupDeadline = Date.now() + startupTimeoutMs;
      log("API is ready; waiting for the renderer to finish starting...");
    }

    const activeDeadline = apiReady ? rendererStartupDeadline : apiStartupDeadline;
    if (Date.now() >= activeDeadline) break;

    if (!apiReady && !launchedApi && (await portIsAvailable(4000))) {
      log("The reused API stopped during startup; recovering it automatically.");
      await clearStaleApiBuild();
      startRunner(["--filter=@bizovix/api"], "API");
      launchedApi = true;
    }
    if (!rendererReady && !launchedRenderer && (await portIsAvailable(3010))) {
      log("The reused renderer stopped during startup; recovering it automatically.");
      startRunner(["--filter=@bizovix/renderer"], "renderer");
      launchedRenderer = true;
    }

    if (runners.every((runner) => runner.exited)) break;
    await delay(750);
  }

  [apiReady, rendererReady] = await Promise.all([apiIsReady(), rendererIsReady()]);
  if (!apiReady || !rendererReady) {
    await stopRunners();
    throw new Error(
      `Local startup failed: API ${apiReady ? "ready" : "not ready"}, renderer ${
        rendererReady ? "ready" : "not ready"
      }.`,
    );
  }

  log("Bizovix is ready: http://localhost:3010");
  while (runners.some((runner) => !runner.exited)) {
    await Promise.race(runners.filter((runner) => !runner.exited).map((runner) => runner.exit));
    if (shuttingDown) {
      await Promise.all(runners.map((runner) => runner.exit));
      return;
    }

    await delay(1_000);
    const [apiStillReady, rendererStillReady] = await Promise.all([
      apiIsReady(),
      rendererIsReady(),
    ]);
    if (!apiStillReady || !rendererStillReady) {
      await stopRunners();
      throw new Error(
        `A local dev service stopped: API ${apiStillReady ? "ready" : "not ready"}, renderer ${
          rendererStillReady ? "ready" : "not ready"
        }.`,
      );
    }
  }
}

async function main() {
  await acquireDevLock();
  const releaseLockOnSignal = () => releaseDevLock();
  process.once("SIGINT", releaseLockOnSignal);
  process.once("SIGTERM", releaseLockOnSignal);
  try {
    await runDev();
  } finally {
    process.off("SIGINT", releaseLockOnSignal);
    process.off("SIGTERM", releaseLockOnSignal);
    releaseDevLock();
  }
}

main().catch((error) => {
  process.stderr.write(`[dev] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
