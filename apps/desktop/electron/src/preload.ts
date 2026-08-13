import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("bizovix", {
  platform: process.platform,
  appVersion: process.env.npm_package_version ?? "1.0.0",
});
