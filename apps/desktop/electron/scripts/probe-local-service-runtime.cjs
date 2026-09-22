const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomBytes, randomUUID } = require("node:crypto");
const { childEnvironment } = require("../dist/runtime/paths.js");
const { startOwnedRuntime, readStorageHealth } = require("../dist/runtime/supervisor.js");

async function probe() {
  const packageRoot = path.dirname(require.resolve("electron/package.json"));
  const executable = path.join(packageRoot, "dist", fs.readFileSync(path.join(packageRoot, "path.txt"), "utf8").trim());
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bizovix-local-runtime-probe-"));
  const capability = randomBytes(32).toString("hex");
  const instanceId = randomUUID();
  let runtime;
  try {
    runtime = await startOwnedRuntime({
      executable, args: [path.resolve(__dirname, "../../local-service/src/main.mjs")], cwd: directory,
      env: childEnvironment({ PORT: "0", BIZOVIX_LOCAL_DATA_ROOT: directory, BIZOVIX_LOCAL_INSTANCE_ID: instanceId, BIZOVIX_LOCAL_CAPABILITY: capability }),
      instanceId, capability, kind: "local-service", timeoutMs: 20_000,
      onUnexpectedExit() {}, log() {},
    });
    assert.equal((await readStorageHealth(runtime.origin, capability, instanceId)).storage, "awaiting-sign-in");
    assert.equal((await fetch(`${runtime.origin}/__desktop/health`)).status, 403);
    await assert.rejects(readStorageHealth(runtime.origin, capability, instanceId, "http://127.0.0.1:49998"));
    runtime.send({ type: "allow-origin", origin: "http://127.0.0.1:49998" });
    for (let attempt = 0; ; attempt += 1) {
      try { await readStorageHealth(runtime.origin, capability, instanceId, "http://127.0.0.1:49998"); break; }
      catch (error) { if (attempt > 20) throw error; await new Promise((resolve) => setTimeout(resolve, 25)); }
    }
    console.log(JSON.stringify({ result: "passed", checks: ["actual-local-service-under-electron", "missing-cloud-safe-start", "protected-health", "origin-denied-before-approval", "origin-approved-over-owned-pipe"], scope: "isolated unactivated profile; not cloud activation or complete ERP" }));
  } finally {
    await runtime?.stop();
    const resolved = path.resolve(directory);
    if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith("bizovix-local-runtime-probe-")) fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}
void probe().catch((error) => { console.error(error.message); process.exitCode = 1; });
