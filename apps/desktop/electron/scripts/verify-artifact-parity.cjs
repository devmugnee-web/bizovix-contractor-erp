const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { createRequire } = require("node:module");
const builderRequire = createRequire(require.resolve("electron-builder/package.json"));
const asar = createRequire(builderRequire.resolve("app-builder-lib/package.json"))("@electron/asar");
const { tracedPackages } = require("./after-pack.cjs");

const root = path.resolve(__dirname, "..");
const workspace = path.resolve(root, "../../..");
const unpacked = path.resolve(process.argv[2] || path.join(root, "release/win-unpacked"));
const resources = path.join(unpacked, "resources");
const renderer = path.resolve(root, "../renderer");
const standalone = path.join(renderer, ".next/standalone");
const packages = tracedPackages(standalone);
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const fileHash = (filename) => hash(fs.readFileSync(filename));
function files(directory, relative = "") {
  return fs.readdirSync(path.join(directory, relative), { withFileTypes: true }).flatMap((entry) => {
    assert.equal(entry.isSymbolicLink(), false, "Artifact must not contain filesystem links");
    const filename = path.join(relative, entry.name);
    return entry.isDirectory() ? files(directory, filename) : [filename];
  });
}
function equalFile(source, packaged) {
  assert.equal(fileHash(packaged), fileHash(source), `Packaged file differs: ${path.relative(resources, packaged)}`);
}

let runtimeSourceFiles = 0;
for (const base of ["apps/desktop/local-service/src", "packages/desktop-storage/src"]) {
  for (const filename of files(path.join(workspace, base))) {
    equalFile(path.join(workspace, base, filename), path.join(resources, base, filename));
    runtimeSourceFiles += 1;
  }
}
let electronCompiledFiles = 0;
for (const filename of files(path.join(root, "dist")).filter((name) => !name.endsWith(".map"))) {
  assert.equal(hash(asar.extractFile(path.join(resources, "app.asar"), path.join("dist", filename))), fileHash(path.join(root, "dist", filename)));
  electronCompiledFiles += 1;
}

const packagedRenderer = path.join(resources, "renderer/apps/desktop/renderer");
let rendererFiles = 0;
for (const filename of files(packagedRenderer)) {
  const parts = filename.split(path.sep);
  let source;
  if (parts[0] === "node_modules") {
    const scoped = parts[1].startsWith("@");
    const name = scoped ? `${parts[1]}/${parts[2]}` : parts[1];
    source = path.join(packages.get(name).directory, ...parts.slice(scoped ? 3 : 2));
  } else if (parts[0] === "public" || (parts[0] === ".next" && parts[1] === "static")) {
    source = path.join(renderer, filename);
  } else source = path.join(standalone, "apps/desktop/renderer", filename);
  equalFile(source, path.join(packagedRenderer, filename));
  rendererFiles += 1;
}

const artifactFiles = files(unpacked).sort();
const artifactHash = crypto.createHash("sha256");
// electron-builder adds this known NSIS helper to a prepackaged Windows tree.
// Keep a second digest to compare the application before/after that addition.
const applicationHash = crypto.createHash("sha256");
let unpackedBytes = 0;
for (const filename of artifactFiles) {
  const full = path.join(unpacked, filename);
  unpackedBytes += fs.statSync(full).size;
  const relative = filename.replaceAll(path.sep, "/");
  const digest = fileHash(full);
  artifactHash.update(relative).update("\0").update(digest).update("\n");
  if (relative !== "resources/elevate.exe") applicationHash.update(relative).update("\0").update(digest).update("\n");
}
console.log(JSON.stringify({ result: "passed", runtimeSourceFiles, electronCompiledFiles, rendererFiles,
  buildId: fs.readFileSync(path.join(packagedRenderer, ".next/BUILD_ID"), "utf8"),
  unpackedFiles: artifactFiles.length, unpackedBytes, unpackedTreeSHA256: artifactHash.digest("hex"),
  applicationTreeSHA256: applicationHash.digest("hex"),
  scope: "Byte parity with current source and compiled inputs; filename-sorted tree SHA256, not installer acceptance" }));
