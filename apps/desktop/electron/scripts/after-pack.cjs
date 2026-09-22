const fs = require("node:fs");
const path = require("node:path");

// Next's Windows pnpm standalone output can contain absolute junctions back to
// the checkout. Materialize only traced package files into ordinary directories;
// shipping those junctions would make the app depend on the developer's PC.
function excluded(name) {
  return /^\.env(?:\.|$)/i.test(name) || /\.(?:sqlite3?(?:-.+)?|db(?:-(?:wal|shm))?|pfx|p12|map)$/i.test(name) || ["storage", "backups"].includes(name);
}
function copyTree(source, destination, skipNodeModules = false) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (excluded(entry.name) || (skipNodeModules && entry.name === "node_modules")) continue;
    if (entry.isSymbolicLink()) throw new Error("Unexpected link inside a traced runtime package; refusing to package an external dependency");
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) copyTree(from, to, skipNodeModules);
    else fs.copyFileSync(from, to);
  }
}

function tracedPackages(standalone) {
  const store = path.join(standalone, "node_modules", ".pnpm");
  const packages = new Map();
  function register(directory, name, storeKey) {
    if (fs.lstatSync(directory).isSymbolicLink()) return;
    const manifest = path.join(directory, "package.json");
    // Asset-only traces (e.g. the OCR worker) may intentionally omit package.json.
    const encodedPrefix = `${name.replace(/\//g, "+")}@`;
    const version = fs.existsSync(manifest) ? JSON.parse(fs.readFileSync(manifest, "utf8")).version : storeKey.startsWith(encodedPrefix) ? storeKey.slice(encodedPrefix.length).split("_")[0] : undefined;
    if (!version) throw new Error(`Traced package version is unresolved: ${name}`);
    const previous = packages.get(name);
    // Flattening is safe for this traced build only when each module name has a
    // single version. Fail explicitly if a later dependency update changes that.
    if (previous && previous.version !== version) throw new Error(`Multiple traced versions need a dedicated packaging layout: ${name}`);
    // Equal versions under different peer contexts may still contain different
    // traced file subsets. Never silently keep just the first partial copy.
    if (previous && previous.directory !== directory) throw new Error(`Duplicate traced package needs an explicit file merge: ${name}`);
    if (!previous) packages.set(name, { directory, version });
  }
  for (const item of fs.readdirSync(store, { withFileTypes: true })) {
    if (!item.isDirectory() || item.name === "node_modules") continue;
    const dependencies = path.join(store, item.name, "node_modules");
    if (!fs.existsSync(dependencies)) continue;
    for (const dependency of fs.readdirSync(dependencies, { withFileTypes: true })) {
      if (dependency.isSymbolicLink()) continue;
      const directory = path.join(dependencies, dependency.name);
      if (dependency.name.startsWith("@")) {
        for (const scoped of fs.readdirSync(directory, { withFileTypes: true })) {
          if (scoped.isDirectory() && !scoped.isSymbolicLink()) register(path.join(directory, scoped.name), `${dependency.name}/${scoped.name}`, item.name);
        }
      } else if (dependency.isDirectory()) register(directory, dependency.name, item.name);
    }
  }
  if (!packages.has("next") || !packages.has("react") || !packages.has("react-dom")) throw new Error("Required traced renderer dependencies are absent");
  return packages;
}

async function afterPack(context) {
  const electronRoot = path.resolve(__dirname, "..");
  const rendererRoot = path.resolve(electronRoot, "../renderer");
  const standalone = path.join(rendererRoot, ".next", "standalone");
  const output = path.resolve(context.appOutDir);
  const resources = context.electronPlatformName === "darwin" ? path.join(output, `${context.packager.appInfo.productFilename}.app`, "Contents", "Resources") : path.join(output, "resources");
  const target = path.resolve(resources, "renderer");
  // Deletion is confined to this generated renderer resource subtree.
  if (!target.startsWith(output + path.sep) || path.basename(target) !== "renderer") throw new Error("Invalid generated renderer target");
  const packages = tracedPackages(standalone);
  fs.rmSync(target, { recursive: true, force: true });
  const appDirectory = path.join(target, "apps", "desktop", "renderer");
  copyTree(path.join(standalone, "apps", "desktop", "renderer"), appDirectory, true);
  for (const [name, value] of packages) copyTree(value.directory, path.join(appDirectory, "node_modules", name));
  copyTree(path.join(rendererRoot, ".next", "static"), path.join(appDirectory, ".next", "static"));
  if (fs.existsSync(path.join(rendererRoot, "public"))) copyTree(path.join(rendererRoot, "public"), path.join(appDirectory, "public"));
  console.log(`  • packaged ${packages.size} traced renderer dependencies without workspace junctions`);
}

module.exports = afterPack;
module.exports.tracedPackages = tracedPackages;
