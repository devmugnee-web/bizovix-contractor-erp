import { app, BrowserWindow } from "electron";
import path from "path";
import net from "net";
import { spawn, type ChildProcess } from "child_process";

const DEV_SERVER_URL = "http://localhost:3010";
const PROD_PORT = 3010;

let nextServerProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;

function waitForServer(port: number, timeoutMs = 15000): Promise<void> {
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.connect({ port, host: "localhost" }, () => {
        socket.end();
        resolve();
      });
      socket.on("error", () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error("Timed out waiting for the Next.js server to start"));
          return;
        }
        setTimeout(tryConnect, 300);
      });
    };
    tryConnect();
  });
}

async function resolveAppUrl(): Promise<string> {
  if (!app.isPackaged) {
    return DEV_SERVER_URL;
  }

  const standaloneDir = path.join(process.resourcesPath, "renderer");
  const serverEntry = path.join(standaloneDir, "server.js");

  nextServerProcess = spawn(process.execPath, [serverEntry], {
    cwd: standaloneDir,
    env: {
      ...process.env,
      PORT: String(PROD_PORT),
      NODE_ENV: "production",
      ELECTRON_RUN_AS_NODE: "1",
    },
    stdio: "inherit",
  });

  await waitForServer(PROD_PORT);
  return `http://localhost:${PROD_PORT}`;
}

async function createWindow(): Promise<void> {
  const url = await resolveAppUrl();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "Bizovix Contractor ERP",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  await mainWindow.loadURL(url);
}

app.whenReady().then(createWindow);

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});

app.on("window-all-closed", () => {
  nextServerProcess?.kill();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  nextServerProcess?.kill();
});
