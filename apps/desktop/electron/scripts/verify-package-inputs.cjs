const fs = require("node:fs");
const path = require("node:path");
const { validateVendorConfig } = require("../dist/runtime/paths.js");

const electronRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(electronRoot, "../../..");
const rendererRoot = path.join(electronRoot, "../renderer");
const required = [
  path.join(electronRoot, "dist/main.js"),
  path.join(electronRoot, "dist/preload.js"),
  path.join(electronRoot, "dist/document-preload.js"),
  path.join(electronRoot, "dist/runtime/renderer-runner.js"),
  path.join(rendererRoot, ".next/standalone/apps/desktop/renderer/server.js"),
  path.join(rendererRoot, ".next/standalone/apps/desktop/renderer/.next/required-server-files.json"),
  path.join(rendererRoot, ".next/static"),
  path.join(electronRoot, "../local-service/src/main.mjs"),
  path.join(electronRoot, "../local-service/package.json"),
  path.join(workspaceRoot, "packages/desktop-storage/src/index.mjs"),
  path.join(workspaceRoot, "packages/desktop-storage/package.json"),
];

const missing = required.filter((entry) => !fs.existsSync(entry));
if (missing.length) {
  console.error("Desktop package inputs are incomplete:");
  for (const entry of missing) console.error(path.relative(workspaceRoot, entry));
  process.exit(1);
}
try {
  const config = validateVendorConfig(JSON.parse(fs.readFileSync(path.join(electronRoot, "desktop-config.json"), "utf8")));
  if (!config.cloudApiUrl) console.warn("Pilot package: cloud activation is not configured. Configure the vendor URL, public key and issuer before customer distribution.");
} catch {
  console.error("Desktop vendor configuration is invalid; refusing to package.");
  process.exit(1);
}
console.log("Desktop package layout verified. Full ERP offline coverage and installer acceptance remain separate release gates.");
