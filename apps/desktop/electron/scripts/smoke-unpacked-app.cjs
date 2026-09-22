const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { childEnvironment } = require("../dist/runtime/paths.js");

const unpackedRoot = path.resolve(process.argv[2] || path.join(__dirname, "../release/win-unpacked"));
const resources = path.join(unpackedRoot, "resources");
if (!fs.existsSync(path.join(resources, "app.asar"))) {
  console.error("An unpacked preview containing resources/app.asar is required.");
  process.exit(1);
}
const electronPackage = path.dirname(require.resolve("electron/package.json"));
const executable = path.join(electronPackage, "dist", fs.readFileSync(path.join(electronPackage, "path.txt"), "utf8").trim());
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bizovix-unpacked-smoke-"));
const screenshot = path.join(path.dirname(unpackedRoot), "desktop-login-smoke.png");
// Hidden-window capture depends on the Windows compositor. Keep it optional so
// functional DOM/transport assertions can be run independently of image capture.
const environment = childEnvironment({ BIZOVIX_SMOKE_DATA_ROOT: directory, BIZOVIX_SMOKE_RESOURCES: resources, BIZOVIX_SMOKE_SCREENSHOT: process.env.BIZOVIX_SMOKE_CAPTURE === "1" ? screenshot : undefined, BIZOVIX_SMOKE_STARTED_AT: String(Date.now()) });
environment.BIZOVIX_SMOKE_LOGIN_ONLY = process.env.BIZOVIX_SMOKE_LOGIN_ONLY;
environment.BIZOVIX_SMOKE_OFFSCREEN = process.env.BIZOVIX_SMOKE_OFFSCREEN;
delete environment.ELECTRON_RUN_AS_NODE;
try {
  const result = spawnSync(executable, [path.join(__dirname, "smoke-unpacked-harness.cjs")], {
    cwd: directory, env: environment, windowsHide: true, encoding: "utf8", timeout: 210_000,
  });
  // Only the harness's explicit machine-readable result is printed. Framework
  // diagnostics are not copied into customer-facing logs or proof output.
  const resultLine = result.stdout?.split(/\r?\n/).find((line) => line.startsWith('{"smoke":'));
  if (resultLine) console.log(resultLine);
  if (result.status !== 0 || !resultLine || JSON.parse(resultLine).smoke !== "passed") {
    console.error("Unpacked hidden-window smoke failed; this is not a customer-release result.");
    if (process.env.BIZOVIX_SMOKE_DIAGNOSTICS === "1") {
      console.error(JSON.stringify({ exitStatus: result.status, signal: result.signal, errorCode: result.error?.code }));
      console.error(result.stderr?.slice(0, 3000) || "No harness diagnostic output.");
      const trace = path.join(directory, "smoke-stages.log");
      if (fs.existsSync(trace)) console.error(fs.readFileSync(trace, "utf8"));
      const runtimeLog = path.join(directory, "logs", "desktop-runtime.log");
      if (fs.existsSync(runtimeLog)) console.error(fs.readFileSync(runtimeLog, "utf8"));
    }
    process.exitCode = 1;
  }
} finally {
  const resolved = path.resolve(directory);
  if (path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith("bizovix-unpacked-smoke-")) {
    try { fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 30, retryDelay: 100 }); }
    catch { console.error(JSON.stringify({ cleanup: "deferred", reason: "Windows still holds the isolated temporary smoke profile", directory: resolved, existingApplicationDataTouched: false })); }
  }
}
