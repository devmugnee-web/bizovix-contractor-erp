import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const turboBin = path.join(repositoryRoot, "node_modules", "turbo", "bin", "turbo");
const turboPackageJson = path.join(repositoryRoot, "node_modules", "turbo", "package.json");
const apiUrl = "http://127.0.0.1:4000/api/v1/auth/dev-login";
const rendererUrl = "http://127.0.0.1:3010/dashboard";
const startupTimeoutMs = Number(process.env.BIZOVIX_DEV_STARTUP_TIMEOUT_MS ?? 120_000);

function resolveNativeTurboBin() {
  const platform = process.platform === "win32" ? "windows" : process.platform;
  const architecture = process.arch === "x64" ? "64" : process.arch;
  if (!["windows", "darwin", "linux"].includes(platform) || !["64", "arm64"].includes(architecture)) {
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
    await new Promise((resolve) => setTimeout(resolve, 750));
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

async function main() {
  log("Checking the local API and renderer...");
  let apiReady = await settleOccupiedService("API", 4000, apiIsReady, 20_000);
  let rendererReady = await settleOccupiedService("Renderer", 3010, rendererIsReady, 45_000);

  if (apiReady) log("Reusing the healthy API on http://localhost:4000/api/v1");
  if (rendererReady) log("Reusing the healthy renderer on http://localhost:3010");
  if (apiReady && rendererReady) {
    log("Bizovix is ready: http://localhost:3010");
    log("Monitoring the running services. Press Ctrl+C to stop this command.");
    while (true) {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
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
    const args = nativeTurboBin
      ? ["run", "dev", ...filters]
      : [turboBin, "run", "dev", ...filters];
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: process.env,
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

  function stopRunners() {
    for (const runner of runners) {
      if (!runner.exited) runner.child.kill("SIGTERM");
    }
  }

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      shuttingDown = true;
      stopRunners();
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
  startRunner(initialFilters, initialLabels.join(" and "));

  const startupDeadline = Date.now() + startupTimeoutMs;
  while (Date.now() < startupDeadline) {
    [apiReady, rendererReady] = await Promise.all([apiIsReady(), rendererIsReady()]);
    if (apiReady && rendererReady) break;

    if (!apiReady && !launchedApi && (await portIsAvailable(4000))) {
      log("The reused API stopped during startup; recovering it automatically.");
      startRunner(["--filter=@bizovix/api"], "API");
      launchedApi = true;
    }
    if (!rendererReady && !launchedRenderer && (await portIsAvailable(3010))) {
      log("The reused renderer stopped during startup; recovering it automatically.");
      startRunner(["--filter=@bizovix/renderer"], "renderer");
      launchedRenderer = true;
    }

    if (runners.every((runner) => runner.exited)) break;
    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  [apiReady, rendererReady] = await Promise.all([apiIsReady(), rendererIsReady()]);
  if (!apiReady || !rendererReady) {
    stopRunners();
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

    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const [apiStillReady, rendererStillReady] = await Promise.all([
      apiIsReady(),
      rendererIsReady(),
    ]);
    if (!apiStillReady || !rendererStillReady) {
      stopRunners();
      throw new Error(
        `A local dev service stopped: API ${apiStillReady ? "ready" : "not ready"}, renderer ${
          rendererStillReady ? "ready" : "not ready"
        }.`,
      );
    }
  }
}

main().catch((error) => {
  process.stderr.write(`[dev] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
