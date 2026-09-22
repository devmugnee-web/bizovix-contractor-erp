import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from "electron";
import path from "node:path";
import fs from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";
import { RUNTIME_INFO_CHANNEL, STORAGE_STATUS_CHANNEL, BACKUP_EXPORT_CHANNEL, isTrustedRendererUrl, isAllowedDocumentPopup, type DesktopRuntimeInfo } from "./runtime/contracts";
import { chooseAndExportBackup } from "./runtime/backup-export";
import { assertRuntimeResources, childEnvironment, packagedRuntimePaths, validateVendorConfig, type VendorConfig } from "./runtime/paths";
import { readStorageHealth, startOwnedRuntime, type OwnedRuntime } from "./runtime/supervisor";

const DEV_SERVER_URL = "http://localhost:3010";
const LOADING_PAGE = "data:text/html;charset=utf-8," + encodeURIComponent("<!doctype html><html><head><meta charset='utf-8'><meta http-equiv='Content-Security-Policy' content=\"default-src 'none'; style-src 'unsafe-inline'\"><title>Bizovix</title></head><body style='font-family:system-ui;background:#f4f7fb;color:#1e293b;display:grid;place-content:center;height:100vh;margin:0'><h2>Starting Bizovix...</h2><p>Your saved data stays on this PC.</p></body></html>");

let mainWindow: BrowserWindow | null = null;
let localService: OwnedRuntime | null = null;
let rendererService: OwnedRuntime | null = null;
let rendererUrl = "";
let capability = "";
let controlCapability = "";
let exportingBackup = false;
let instanceId = "";
let starting: Promise<void> | null = null;
let stoppingServices: Promise<void> | null = null;
let handlingFailure = false;
let quitting = false;
let quitReady = false;
let runtimeInfo: DesktopRuntimeInfo;

function log(event: string): void {
  try {
    const directory = path.join(app.getPath("userData"), "logs");
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, "desktop-runtime.log");
    if (fs.existsSync(file) && fs.statSync(file).size > 1_048_576) {
      fs.copyFileSync(file, path.join(directory, "desktop-runtime.previous.log"));
      fs.writeFileSync(file, "");
    }
    fs.appendFileSync(file, `${new Date().toISOString()} ${event.replace(/[^a-zA-Z0-9:_-]/g, "_").slice(0, 100)}\n`);
  } catch { /* Failure to log must never reset or remove application data. */ }
}

function vendorConfiguration(): VendorConfig {
  if (app.isPackaged) {
    const file = packagedRuntimePaths(process.resourcesPath).configFile;
    return validateVendorConfig(fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {});
  }
  return validateVendorConfig({
    cloudApiUrl: process.env.BIZOVIX_CLOUD_API_URL,
    cloudPublicKey: process.env.BIZOVIX_CLOUD_PUBLIC_KEY,
    cloudIssuer: process.env.BIZOVIX_CLOUD_ISSUER,
  }, true);
}

function validateSender(event: IpcMainInvokeEvent): void {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id ||
      event.senderFrame !== mainWindow.webContents.mainFrame || !rendererUrl ||
      !isTrustedRendererUrl(event.senderFrame.url, new URL(rendererUrl).origin)) {
    throw new Error("DESKTOP_IPC_FORBIDDEN");
  }
}

function stopServices(): Promise<void> {
  if (stoppingServices) return stoppingServices;
  const renderer = rendererService;
  const service = localService;
  rendererService = null;
  localService = null;
  rendererUrl = "";
  stoppingServices = (async () => {
    await renderer?.stop();
    await service?.stop();
  })().finally(() => { stoppingServices = null; });
  return stoppingServices;
}

async function startupFailure(): Promise<void> {
  if (handlingFailure || quitting) return;
  handlingFailure = true;
  log("desktop:startup-or-runtime-failed");
  // A service can exit while the other child is still starting. Wait for that
  // startup to settle before collecting owned handles or offering Retry.
  await starting;
  await stopServices();
  if (quitting) { handlingFailure = false; return; }
  if (mainWindow && !mainWindow.isDestroyed()) await mainWindow.loadURL(LOADING_PAGE).catch(() => {});
  const response = await dialog.showMessageBox({
    type: "error", title: "Bizovix could not start",
    message: "The local application could not start safely.",
    detail: "Your saved data has not been reset. You can retry, or close the app and send support the desktop-runtime.log file in the application's data folder.",
    buttons: ["Retry", "Close"], defaultId: 0, cancelId: 1,
  });
  handlingFailure = false;
  if (quitting) return;
  if (response.response === 0) void startWindow();
  else app.quit();
}

function newWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1024, minHeight: 700,
    title: "Bizovix Contractor ERP", autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false, contextIsolation: true, sandbox: true,
      additionalArguments: [app.isPackaged || process.env.BIZOVIX_ENABLE_LOCAL_SERVICE === "1" ? "--bizovix-local-service=1" : "--bizovix-local-service=0"],
    },
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    const origin = rendererUrl ? new URL(rendererUrl).origin : "";
    if (!origin || !isTrustedRendererUrl(window.webContents.getURL(), origin) || !isAllowedDocumentPopup(url, origin)) return { action: "deny" };
    // Existing receipt/bill printing uses about:blank + document.write; document
    // previews use same-origin blob URLs. Preserve those without the app bridge.
    return { action: "allow", overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences: {
      preload: path.join(__dirname, "document-preload.js"),
      nodeIntegration: false, contextIsolation: true, sandbox: true, additionalArguments: [],
    } } };
  });
  window.webContents.on("did-create-window", (child) => {
    child.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    child.webContents.on("will-navigate", (event, target) => {
      if (!rendererUrl || !isAllowedDocumentPopup(target, new URL(rendererUrl).origin)) event.preventDefault();
    });
  });
  window.webContents.on("will-navigate", (event, target) => {
    if (!rendererUrl || !isTrustedRendererUrl(target, new URL(rendererUrl).origin)) event.preventDefault();
  });
  window.webContents.on("will-attach-webview", (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.on("closed", () => { if (mainWindow === window) mainWindow = null; });
  return window;
}

async function initializeRuntime(): Promise<string> {
  const localEnabled = app.isPackaged || process.env.BIZOVIX_ENABLE_LOCAL_SERVICE === "1";
  runtimeInfo = {
    platform: process.platform, appVersion: app.getVersion(),
    mode: localEnabled ? "desktop-pilot" : "development",
    storageStatus: localEnabled ? "starting" : "disabled", cloudConfigured: false,
    offlineScope: localEnabled ? "categories-pilot" : "disabled",
  };
  if (!localEnabled) return DEV_SERVER_URL;

  const dataRoot = path.join(app.getPath("userData"), "local-data");
  fs.mkdirSync(dataRoot, { recursive: true });
  const config = vendorConfiguration();
  const resources = packagedRuntimePaths(process.resourcesPath);
  if (app.isPackaged) assertRuntimeResources(resources);
  const serviceEntry = app.isPackaged ? resources.localServiceEntry : path.resolve(__dirname, "../../local-service/src/main.mjs");
  capability = randomBytes(32).toString("hex");
  controlCapability = randomBytes(32).toString("hex");
  instanceId = randomUUID();
  const common = {
    executable: process.execPath, cwd: dataRoot, instanceId,
    onUnexpectedExit: () => { void startupFailure(); }, log,
  };
  localService = await startOwnedRuntime({
    ...common, args: [serviceEntry], kind: "local-service", capability,
    env: childEnvironment({
      PORT: "0", BIZOVIX_LOCAL_DATA_ROOT: dataRoot,
      BIZOVIX_LOCAL_INSTANCE_ID: instanceId, BIZOVIX_LOCAL_CAPABILITY: capability,
      BIZOVIX_LOCAL_CONTROL_CAPABILITY: controlCapability,
      BIZOVIX_CLOUD_API_URL: config.cloudApiUrl,
      BIZOVIX_CLOUD_PUBLIC_KEY: config.cloudPublicKey,
      BIZOVIX_CLOUD_ISSUER: config.cloudIssuer,
      ...(!app.isPackaged && process.env.BIZOVIX_ALLOW_INSECURE_LOCAL_CLOUD === "true" ? { BIZOVIX_ALLOW_INSECURE_LOCAL_CLOUD: "true" } : {}),
    }),
  });
  runtimeInfo.localApiUrl = `${localService.origin}/api/v1`;
  runtimeInfo.localCapability = capability;
  runtimeInfo.storageStatus = (await readStorageHealth(localService.origin, capability, instanceId)).storage;
  runtimeInfo.cloudConfigured = !!config.cloudApiUrl;

  let url = "http://127.0.0.1:3010";
  if (app.isPackaged) {
    rendererService = await startOwnedRuntime({
      ...common, args: [path.join(__dirname, "runtime", "renderer-runner.js")], kind: "renderer",
      env: childEnvironment({ BIZOVIX_RENDERER_DIR: resources.rendererDir, BIZOVIX_LOCAL_INSTANCE_ID: instanceId }),
    });
    url = rendererService.origin;
  }
  localService.send({ type: "allow-origin", origin: new URL(url).origin });
  // The pipe command is asynchronous. Confirm origin authorization before the
  // first renderer request, so fast startup cannot race the CORS allowlist.
  for (let attempt = 0; ; attempt += 1) {
    try {
      await readStorageHealth(localService.origin, capability, instanceId, new URL(url).origin);
      break;
    } catch {
      if (attempt >= 19) throw new Error("DESKTOP_ORIGIN_SETUP_FAILED");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  return url;
}

function startWindow(): Promise<void> {
  if (quitting) return Promise.resolve();
  if (starting) return starting;
  starting = (async () => {
    if (!mainWindow || mainWindow.isDestroyed()) mainWindow = newWindow();
    await mainWindow.loadURL(LOADING_PAGE);
    rendererUrl = rendererUrl || await initializeRuntime();
    if (!quitting && mainWindow && !mainWindow.isDestroyed()) await mainWindow.loadURL(rendererUrl);
  })().catch(() => {
    setImmediate(() => { void startupFailure(); });
  }).finally(() => { starting = null; });
  return starting;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  ipcMain.handle(RUNTIME_INFO_CHANNEL, (event) => { validateSender(event); return { ...runtimeInfo }; });
  ipcMain.handle(STORAGE_STATUS_CHANNEL, async (event) => {
    validateSender(event);
    if (!localService) return { status: "disabled", storage: "disabled" };
    return readStorageHealth(localService.origin, capability, instanceId);
  });
  ipcMain.handle(BACKUP_EXPORT_CHANNEL, async (event, accessToken: unknown) => {
    validateSender(event);
    if (!localService || !mainWindow) return { error: "Local backup is unavailable until the desktop service is ready." };
    if (exportingBackup) return { error: "A backup export is already open." };
    exportingBackup = true;
    const owner = mainWindow, service = localService;
    try {
      return await chooseAndExportBackup({
        accessToken, origin: service.origin, capability, controlCapability,
        assertCurrent: () => { validateSender(event); if (mainWindow !== owner || localService !== service) throw new Error("DESKTOP_EXPORT_OWNER_CHANGED"); },
        chooseDirectory: async () => {
          const selection = await dialog.showOpenDialog(owner, {
            title: "Choose where to export your backup", buttonLabel: "Export backup here",
            properties: ["openDirectory", "createDirectory"],
          });
          return selection.canceled ? null : selection.filePaths[0] ?? null;
        },
      });
    } catch {
      return { error: "The backup export did not complete. Existing data was preserved. Please retry." };
    } finally { exportingBackup = false; }
  });
  void app.whenReady().then(startWindow);
  app.on("activate", () => { if (!mainWindow) void startWindow(); });
  app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
  app.on("before-quit", (event) => {
    if (quitReady) return;
    event.preventDefault();
    if (quitting) return;
    quitting = true;
    void (async () => {
      await starting;
      await stopServices();
      quitReady = true;
      app.quit();
    })();
  });
}
