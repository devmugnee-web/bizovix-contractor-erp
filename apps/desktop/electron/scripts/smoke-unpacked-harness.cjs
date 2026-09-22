// Developer-only acceptance harness, deliberately excluded from packaged files.
// Runs the unpacked artifact's real main/preload/renderer/local-service code with
// isolated data and a hidden window. This is not a clean-Windows installation.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const electron = require("electron");
const { app } = electron;
// Optional visual-only mode uses Electron's software offscreen renderer when
// the Windows hidden-window compositor cannot capture a bitmap. Keep ordinary
// runtime acceptance separate; this mode does not measure native window timing.
const offscreenVisual = process.env.BIZOVIX_SMOKE_OFFSCREEN === "1";
let restoreElectronLoader = () => {};
if (offscreenVisual) {
  app.disableHardwareAcceleration();
  const NativeBrowserWindow = electron.BrowserWindow;
  const visualElectron = Object.create(electron);
  Object.defineProperty(visualElectron, "BrowserWindow", { value: class extends NativeBrowserWindow {
    constructor(options) {
      super({ ...options, show: false, webPreferences: { ...options.webPreferences, offscreen: true } });
      const contents = this.webContents;
      contents.setFrameRate(30);
      // The software offscreen API exposes frames through paint; capturePage
      // still uses the unavailable hidden-window Viz copy path on this host.
      contents.capturePage = () => new Promise((resolve, reject) => {
        const painted = (_event, _dirty, image) => { clearTimeout(timeout); resolve(image); };
        const timeout = setTimeout(() => { contents.removeListener("paint", painted); reject(new Error("OFFSCREEN_PAINT_TIMEOUT")); }, 3_000);
        contents.once("paint", painted);
        contents.startPainting();
        contents.invalidate();
      });
    }
  } });
  // Electron's own export is not configurable. Override only the test's module
  // loading boundary while the packaged main module obtains its dependencies.
  const Module = require("node:module");
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    return request === "electron" ? visualElectron : originalLoad.call(this, request, parent, isMain);
  };
  restoreElectronLoader = () => { Module._load = originalLoad; };
}
const resources = process.env.BIZOVIX_SMOKE_RESOURCES;
const dataRoot = process.env.BIZOVIX_SMOKE_DATA_ROOT;
const startedAt = Number(process.env.BIZOVIX_SMOKE_STARTED_AT) || Date.now();
if (!resources || !dataRoot) throw new Error("Smoke test paths are required");
const trace = (stage) => fs.appendFileSync(path.join(dataRoot, "smoke-stages.log"), `${Date.now() - startedAt}ms ${stage}\n`);
trace("harness-loaded");
app.setPath("userData", dataRoot);
app.setName("Bizovix isolated unpacked smoke");
Object.defineProperty(app, "isPackaged", { value: true });
Object.defineProperty(process, "resourcesPath", { value: resources });
trace("isolated-paths-configured");
void app.whenReady().then(() => trace("electron-ready"));
let finished = false;
let devLoginRequests = 0;
let checkingLogin = false;
let categoryFixture;
let masterDataFixture;
let organizationFixture;
let rendererRegressionFixture;
let loginReadyMs;
let loginScreenshot;
const timeout = setTimeout(() => finish(false, "timeout"), 180_000);
app.on("will-quit", () => { if (!finished) finish(false, "unexpected-app-quit"); });
function finish(passed, stage) {
  if (finished) return;
  finished = true;
  clearTimeout(timeout);
  console.log(JSON.stringify({ smoke: passed ? "passed" : "failed", stage, devLoginRequests, loginReadyMs, elapsedMs: Date.now() - startedAt, offscreenVisual, loginScreenshot, categoryFixture, masterDataFixture, organizationFixture, rendererRegressionFixture, scope: offscreenVisual ? "unpacked artifacts rendered with software offscreen BrowserWindow override; visual fixtures only, not native-window timing or installed Windows acceptance" : "unpacked artifacts under matching Electron runtime; hidden window and isolated data; not installed Windows acceptance" }));
  process.exitCode = passed ? 0 : 1;
  app.quit();
}
electron.dialog.showMessageBox = async () => { finish(false, "startup-dialog"); return { response: 1, checkboxChecked: false }; };
app.on("browser-window-created", (_event, window) => {
  trace("browser-window-created");
  // The native window is still inside its constructor when this event fires.
  // Wait until that constructor returns before invoking native window methods.
  setImmediate(() => {
    if (window.isDestroyed()) return;
    // Hidden Windows are compositor-throttled by default. Keep animation-frame
    // driven form focus active in this test, as it is in a visible product UI.
    window.webContents.setBackgroundThrottling(false);
    window.hide();
  });
  window.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    if (details.url.includes("/auth/dev-login")) devLoginRequests += 1;
    callback({ cancel: false });
  });
  window.webContents.on("did-finish-load", () => {
    if (checkingLogin || !window.webContents.getURL().startsWith("http://127.0.0.1:")) return;
    checkingLogin = true;
    trace("renderer-loaded");
    void (async () => {
      for (let attempt = 0; attempt < 100 && !finished; attempt += 1) {
        const state = await window.webContents.executeJavaScript(`(async () => {
          const runtime = await window.bizovix?.getRuntimeInfo();
          const storage = await window.bizovix?.getLocalStorageStatus();
          return { local: window.bizovix?.localServiceEnabled, mode: runtime?.mode,
            offlineScope: runtime?.offlineScope, configured: runtime?.cloudConfigured,
            storage: storage?.storage, pathname: location.pathname,
            passwordInput: !!document.querySelector('input[type="password"]'),
            hasCapability: typeof runtime?.localCapability === 'string' && runtime.localCapability.length >= 32,
            nodeVisible: typeof window.require !== 'undefined' };
        })()`).catch(() => null);
        if (!state) { await new Promise((resolve) => setTimeout(resolve, 100)); continue; }
        if (state.passwordInput && state.pathname === "/login") {
          assert.equal(state.local, true);
          assert.equal(state.mode, "desktop-pilot");
          assert.ok(["categories-pilot", "master-data-pilot"].includes(state.offlineScope));
          assert.equal(state.configured, false);
          assert.equal(state.storage, "awaiting-sign-in");
          assert.equal(state.hasCapability, true);
          assert.equal(state.nodeVisible, false);
          assert.equal(devLoginRequests, 0);
          assert.ok(fs.existsSync(path.join(dataRoot, "local-data")));
          loginReadyMs = Date.now() - startedAt;
          trace("real-login-assertions-passed");
          if (process.env.BIZOVIX_SMOKE_LOGIN_ONLY === "1") {
            finish(true, "real-login-secure-bridge-and-owned-local-services");
            return;
          }
          if (process.env.BIZOVIX_SMOKE_SCREENSHOT) {
            try {
              const screenshot = await window.webContents.capturePage();
              fs.writeFileSync(process.env.BIZOVIX_SMOKE_SCREENSHOT, screenshot.toPNG());
              loginScreenshot = { result: "captured" };
            } catch (error) { loginScreenshot = { result: "failed", reason: error.message }; }
          }
          const categoryScreenshot = process.env.BIZOVIX_SMOKE_SCREENSHOT ? path.join(path.dirname(process.env.BIZOVIX_SMOKE_SCREENSHOT), "desktop-category-review-fixture.png") : undefined;
          categoryFixture = await require("./category-ui-fixture.cjs")(window, categoryScreenshot, trace);
          masterDataFixture = await require("./master-data-ui-fixture.cjs")(window, trace);
          organizationFixture = await require("./organization-ui-fixture.cjs")(window, trace);
          rendererRegressionFixture = await require("./renderer-regression-fixture.cjs")(window, trace);
          finish(true, "real-login-secure-bridge-local-service-and-ui-fixtures");
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    })().catch((error) => { trace(`assertion:${error.name}:${error.message}`); console.error("SMOKE_ASSERTION", error.name, error.message); finish(false, "renderer-assertion"); });
  });
});
require(path.join(resources, "app.asar", "dist", "main.js"));
restoreElectronLoader();
trace("packaged-main-loaded");
