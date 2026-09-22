import path from "node:path";
import fs from "node:fs";
import { createPublicKey } from "node:crypto";

export function packagedRuntimePaths(resourcesPath: string) {
  return {
    rendererDir: path.join(resourcesPath, "renderer", "apps", "desktop", "renderer"),
    localServiceEntry: path.join(resourcesPath, "apps", "desktop", "local-service", "src", "main.mjs"),
    storageEntry: path.join(resourcesPath, "packages", "desktop-storage", "src", "index.mjs"),
    configFile: path.join(resourcesPath, "desktop-config.json"),
  };
}

export function assertRuntimeResources(paths: ReturnType<typeof packagedRuntimePaths>): void {
  const required = [
    path.join(paths.rendererDir, "server.js"),
    path.join(paths.rendererDir, ".next", "required-server-files.json"),
    path.join(paths.rendererDir, ".next", "static"),
    paths.localServiceEntry,
    paths.storageEntry,
  ];
  if (required.some((entry) => !fs.existsSync(entry))) throw new Error("DESKTOP_RESOURCES_MISSING");
}

export interface VendorConfig {
  cloudApiUrl?: string;
  cloudPublicKey?: string;
  cloudIssuer?: string;
}

export function validateVendorConfig(input: unknown, development = false): VendorConfig {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("DESKTOP_CONFIG_INVALID");
  const value = input as Record<string, unknown>;
  const fields = ["cloudApiUrl", "cloudPublicKey", "cloudIssuer"] as const;
  if (Object.keys(value).some((key) => !fields.includes(key as typeof fields[number]))) throw new Error("DESKTOP_CONFIG_UNKNOWN_FIELD");
  for (const name of fields) {
    if (value[name] !== undefined && typeof value[name] !== "string") throw new Error("DESKTOP_CONFIG_INVALID");
  }
  const config: VendorConfig = {};
  for (const name of fields) if (value[name]) config[name] = value[name] as string;
  const provided = Object.keys(config).length;
  if (provided !== 0 && provided !== 3) throw new Error("DESKTOP_CONFIG_INCOMPLETE");
  if (config.cloudApiUrl) {
    const url = new URL(config.cloudApiUrl);
    const localDev = development && url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
    if ((!localDev && url.protocol !== "https:") || url.username || url.password || url.hash || url.search) {
      throw new Error("DESKTOP_CLOUD_URL_INVALID");
    }
  }
  if (config.cloudPublicKey) {
    try {
      if (!config.cloudPublicKey.trim().startsWith("-----BEGIN PUBLIC KEY-----") || createPublicKey(config.cloudPublicKey).asymmetricKeyType !== "ed25519") {
        throw new Error("Invalid public verification key");
      }
    } catch { throw new Error("DESKTOP_PUBLIC_KEY_INVALID"); }
  }
  return config;
}

export function childEnvironment(extra: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  // Never forward a developer's database URL, JWT signing keys, proxy credentials,
  // NODE_OPTIONS, or unrelated cloud secrets into the packaged application.
  const allowed = new Set(["systemroot", "windir", "path", "temp", "tmp", "userprofile", "appdata", "localappdata", "homedrive", "homepath", "lang", "lc_all", "display", "wayland_display", "xdg_runtime_dir"]);
  const result: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (allowed.has(key.toLowerCase())) result[key] = value;
  }
  return { ...result, NODE_ENV: "production", ELECTRON_RUN_AS_NODE: "1", NEXT_TELEMETRY_DISABLED: "1", ...extra };
}
