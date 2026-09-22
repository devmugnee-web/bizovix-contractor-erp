const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const electronRoot = path.resolve(__dirname, "..");
const workspace = path.resolve(electronRoot, "../../..");
const snapshotFile = path.join(electronRoot, "release/build-inputs.snapshot.json");
const sourceRoots = ["apps/desktop/renderer/src", "apps/desktop/electron/src", "apps/desktop/local-service/src",
  "packages/types/src", "packages/validation/src", "packages/api-client/src", "packages/ui/src",
  "packages/utils/src", "packages/desktop-storage/src", "packages/config"];
const manifestRoots = ["apps/desktop/renderer", "apps/desktop/electron", "apps/desktop/local-service",
  "packages/types", "packages/validation", "packages/api-client", "packages/ui", "packages/utils", "packages/desktop-storage"];
const inputs = new Set(["pnpm-lock.yaml", "package.json", "apps/desktop/renderer/next.config.ts",
  "apps/desktop/renderer/tailwind.config.ts", "apps/desktop/renderer/postcss.config.mjs",
  "apps/desktop/electron/electron-builder.yml", "apps/desktop/electron/desktop-config.json"]);
function collect(relative) {
  for (const entry of fs.readdirSync(path.join(workspace, relative), { withFileTypes: true })) {
    if (["node_modules", "dist", ".next"].includes(entry.name)) continue;
    if (entry.isSymbolicLink()) throw new Error("Unexpected source link; cannot establish a fixed build-input snapshot");
    const name = path.join(relative, entry.name);
    if (entry.isDirectory()) collect(name);
    else inputs.add(name);
  }
}
for (const sourceRoot of sourceRoots) collect(sourceRoot);
for (const manifestRoot of manifestRoots) for (const name of ["package.json", "tsconfig.json"]) inputs.add(path.join(manifestRoot, name));
const hashes = {};
for (const relative of [...inputs].sort()) {
  const filename = path.join(workspace, relative);
  if (fs.existsSync(filename)) hashes[relative.replaceAll(path.sep, "/")] = crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}
const digest = crypto.createHash("sha256").update(JSON.stringify(hashes)).digest("hex");
if (process.argv[2] === "capture") {
  fs.mkdirSync(path.dirname(snapshotFile), { recursive: true });
  fs.writeFileSync(snapshotFile, JSON.stringify({ capturedAt: new Date().toISOString(), digest, hashes }, null, 2));
} else {
  const expected = JSON.parse(fs.readFileSync(snapshotFile, "utf8"));
  const changed = [...new Set([...Object.keys(expected.hashes), ...Object.keys(hashes)])].filter((name) => expected.hashes[name] !== hashes[name]);
  if (changed.length) {
    console.error(JSON.stringify({ result: "failed", reason: "Build inputs changed since the captured snapshot", changed }));
    process.exit(1);
  }
}
console.log(JSON.stringify({ result: "passed", mode: process.argv[2] === "capture" ? "captured" : "unchanged", sourceFiles: Object.keys(hashes).length, sourceTreeSHA256: digest }));
