const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function load(bridge) {
  const values = new Map([
    ["bizovix_access_token", "a".repeat(43)],
    ["bizovix_refresh_token", "r".repeat(43)],
    ["bizovix_session_id", "session-a"],
  ]);
  const window = { bizovix: bridge, localStorage: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  } };
  const compile = file => ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = vm.createContext({ window, crypto: { randomUUID: () => "session-generated" }, URL, Error, console });
  const tokenModule = { exports: {} };
  vm.runInContext(`(function(exports,module){${compile(path.join(__dirname, "../src/token-storage.ts"))}\n})(module.exports,module)`, vm.createContext({ ...context, module: tokenModule }));
  const desktopModule = { exports: {} };
  const desktopContext = vm.createContext({ ...context, module: desktopModule, require: name => {
    if (name === "./token-storage") return tokenModule.exports;
    throw new Error(`Unexpected import ${name}`);
  } });
  vm.runInContext(`(function(exports,module,require){${compile(path.join(__dirname, "../src/desktop-runtime.ts"))}\n})(module.exports,module,require)`, desktopContext);
  return { api: desktopModule.exports, values };
}

test("desktop backup export sends only the current access token through the native bridge", async () => {
  let received;
  const f = load({ localServiceEnabled: true, exportBackup: async token => { received = token; return { directory: "D:\\Backups\\backup-1", pendingCount: 2 }; } });
  const result = await f.api.exportDesktopBackup();
  assert.equal(received, "a".repeat(43));
  assert.equal(result.directory, "D:\\Backups\\backup-1");
});

test("desktop backup export rejects a result after the browser session changes", async () => {
  const f = load({ localServiceEnabled: true, exportBackup: async () => {
    f.values.set("bizovix_session_id", "session-b");
    return { directory: "D:\\Backups\\stale" };
  } });
  await assert.rejects(f.api.exportDesktopBackup(), /sign-in changed/);
});

test("browser mode cannot invoke the native backup chooser", async () => {
  const f = load(undefined);
  assert.equal(f.api.canExportDesktopBackup(), false);
  await assert.rejects(f.api.exportDesktopBackup(), /desktop app/);
});
