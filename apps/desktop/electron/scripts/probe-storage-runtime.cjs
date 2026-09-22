const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { childEnvironment } = require("../dist/runtime/paths.js");

// The test fixtures import workspace source. Run artifact byte-parity checks
// before/after this probe; do not describe this as tests imported from resources.
const root = path.resolve(__dirname, "..");
const workspace = path.resolve(root, "../../..");
const executable = path.resolve(process.argv[2] || path.join(root, "release/win-unpacked/Bizovix Contractor ERP.exe"));
if (!fs.existsSync(executable)) throw new Error("Build an unpacked Windows preview before the bundled storage probe");
const fixtures = [
  "packages/desktop-storage/test/desktop-store.test.mjs",
  "packages/desktop-storage/test/masters.test.mjs",
  "packages/desktop-storage/test/organizations.test.mjs",
  "apps/desktop/local-service/test/local-service.test.mjs",
  "apps/desktop/local-service/test/backup-export.test.mjs",
].map((filename) => path.join(workspace, filename));
const result = spawnSync(executable, ["--test", "--test-isolation=none", "--test-reporter=spec", ...fixtures], {
  env: childEnvironment({}), cwd: workspace, encoding: "utf8", windowsHide: true, timeout: 180_000,
});
process.stdout.write(result.stdout || "");
if (result.status !== 0) {
  process.stderr.write(result.stderr || "Bundled storage probe did not finish successfully.\n");
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ result: "passed", scope: "Workspace storage/local-service test fixtures and imports under the unpacked Electron executable's Node/SQLite runtime; separately byte-matched to staged source; isolated data, not installed Windows acceptance" }));
}
