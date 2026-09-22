const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { childEnvironment } = require("../dist/runtime/paths.js");

// Resolve without requiring Electron's package loader, which may download a
// missing binary. This probe must only use the already installed executable.
const electronPackage = path.dirname(require.resolve("electron/package.json"));
const marker = path.join(electronPackage, "path.txt");
if (!fs.existsSync(marker)) {
  console.error("Electron executable is unavailable; no runtime compatibility result.");
  process.exit(1);
}
const executable = path.join(electronPackage, "dist", fs.readFileSync(marker, "utf8").trim());
const result = spawnSync(executable, [path.join(__dirname, "sqlite-runtime-probe.cjs")], {
  env: childEnvironment({}), encoding: "utf8", windowsHide: true, timeout: 20_000,
});
if (result.status !== 0) {
  console.error("Electron SQLite runtime probe failed; no production readiness claim.");
  process.exit(1);
}
process.stdout.write(result.stdout);
