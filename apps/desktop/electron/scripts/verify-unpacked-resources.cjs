const fs = require("node:fs");
const path = require("node:path");
const { packagedRuntimePaths, assertRuntimeResources, validateVendorConfig } = require("../dist/runtime/paths.js");

const directory = path.resolve(process.argv[2] || path.join(__dirname, "../release/win-unpacked"));
const resources = path.join(directory, "resources");
const runtimePaths = packagedRuntimePaths(resources);
assertRuntimeResources(runtimePaths);
validateVendorConfig(JSON.parse(fs.readFileSync(runtimePaths.configFile, "utf8")));
const forbidden = [];
function inspect(current) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const full = path.join(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Unpacked resources unexpectedly contain a symlink");
    if (entry.isDirectory()) inspect(full);
    else if (/^\.env(?:\.|$)/i.test(entry.name) || /\.(?:sqlite3?(?:-.+)?|db(?:-(?:wal|shm))?|pfx|p12|map)$/i.test(entry.name)) forbidden.push(path.relative(resources, full));
  }
}
inspect(resources);
if (forbidden.length) {
  console.error("Refusing unpacked acceptance: environment, database, private signing files or source maps were included.");
  for (const name of forbidden) console.error(name);
  process.exit(1);
}
console.log(JSON.stringify({ result: "passed", checks: ["monorepo-server-static-local-service-storage-layout", "vendor-config-schema", "no-env-database-private-signing-files-or-source-maps"], scope: "resource layout and filename exclusion; not a comprehensive secret-content audit" }));
