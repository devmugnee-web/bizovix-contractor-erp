const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { randomUUID } = require("node:crypto");
const { childEnvironment } = require("../dist/runtime/paths.js");
const { startOwnedRuntime } = require("../dist/runtime/supervisor.js");

async function probe() {
  const packageRoot = path.dirname(require.resolve("electron/package.json"));
  const executable = path.join(packageRoot, "dist", fs.readFileSync(path.join(packageRoot, "path.txt"), "utf8").trim());
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bizovix-renderer-runtime-probe-"));
  const instanceId = randomUUID();
  let runtime;
  try {
    runtime = await startOwnedRuntime({
      executable,
      args: [path.resolve(__dirname, "../dist/runtime/renderer-runner.js")],
      cwd: directory,
      env: childEnvironment({ BIZOVIX_RENDERER_DIR: path.resolve(__dirname, "../../renderer/.next/standalone/apps/desktop/renderer"), BIZOVIX_LOCAL_INSTANCE_ID: instanceId }),
      instanceId, kind: "renderer", timeoutMs: 45_000,
      onUnexpectedExit() {}, log(event) { console.log(event); },
    });
    console.log(JSON.stringify({ result: "passed", port: runtime.port, origin: runtime.origin, checks: ["electron-node-runtime", "standalone-monorepo-config", "owned-ephemeral-listener", "http-readiness"], scope: "existing build startup; not fresh installer or full offline ERP" }));
  } finally {
    await runtime?.stop();
    const resolved = path.resolve(directory);
    if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith("bizovix-renderer-runtime-probe-")) fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}
void probe().catch((error) => { console.error(error.message); process.exitCode = 1; });
