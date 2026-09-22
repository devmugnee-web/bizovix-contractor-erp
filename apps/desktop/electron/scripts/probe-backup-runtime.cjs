const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { childEnvironment } = require("../dist/runtime/paths.js");

// Exercise new backup/rekey/renewal behavior with the unpacked executable's own
// Node/SQLite runtime. Tests create only isolated profiles; they use source
// fixtures whose runtime source files are separately hash-checked against resources.
const executable = path.resolve(process.argv[2] || path.join(__dirname, "../release/win-unpacked/Bizovix Contractor ERP.exe"));
if (!fs.existsSync(executable)) throw new Error("Build an unpacked Windows preview before the bundled backup probe");
const fixture = path.resolve(__dirname, "../../local-service/test/local-service.test.mjs");
const result = spawnSync(executable, ["--test", "--test-reporter=spec", "--test-name-pattern=backup|rekeys|renewal", fixture], {
  env: childEnvironment({}), cwd: path.dirname(fixture), encoding: "utf8", windowsHide: true, timeout: 120_000,
});
process.stdout.write(result.stdout || "");
if (result.status !== 0) {
  process.stderr.write(result.stderr || "Bundled backup probe did not finish successfully.\n");
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ result: "passed", scope: "backup, renewal and rekey source regression fixtures under the unpacked Electron executable; isolated data, not installed Windows acceptance" }));
}
