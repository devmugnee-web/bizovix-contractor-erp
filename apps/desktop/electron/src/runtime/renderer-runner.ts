import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createInterface } from "node:readline";

// Executes under the packaged Electron Node runtime, not the renderer or main
// process. Use the pinned Next server API because generated standalone server.js
// converts PORT=0 to 3000; startServer itself supports an OS-assigned port.
async function run(): Promise<void> {
  const rendererDir = process.env.BIZOVIX_RENDERER_DIR;
  const instanceId = process.env.BIZOVIX_LOCAL_INSTANCE_ID;
  if (!rendererDir || !instanceId) throw new Error("DESKTOP_RENDERER_CONFIG_MISSING");
  const manifest = JSON.parse(fs.readFileSync(path.join(rendererDir, ".next", "required-server-files.json"), "utf8"));
  const config = manifest.config;
  if (!config || config.output !== "standalone") throw new Error("DESKTOP_RENDERER_BUILD_INVALID");
  // Match generated standalone server.js: Turbopack's Windows manifest loading
  // depends on cwd matching the server directory, including across drive letters.
  process.chdir(rendererDir);
  // Installation resources stay read-only; retain in-memory caches and disable
  // Next's ISR/image disk cache. Customer data belongs exclusively in userData.
  config.experimental = { ...config.experimental, isrFlushToDisk: false };
  process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(config);
  process.env.NODE_ENV = "production";
  process.env.NEXT_TELEMETRY_DISABLED = "1";
  const requireRenderer = createRequire(path.join(rendererDir, "server.js"));
  requireRenderer("next");
  const { startServer } = requireRenderer("next/dist/server/lib/start-server");
  await startServer({ dir: rendererDir, isDev: false, hostname: "127.0.0.1", port: 0, allowRetry: false });
  const port = Number(process.env.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("DESKTOP_RENDERER_PORT_INVALID");
  process.stdout.write(`${JSON.stringify({ type: "ready", port, instanceId })}\n`);
  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    process.emit("SIGTERM", "SIGTERM");
  };
  const input = createInterface({ input: process.stdin });
  input.on("line", (line) => {
    try { if (JSON.parse(line).type === "shutdown") close(); } catch { /* Reject malformed control messages. */ }
  });
  input.on("close", close);
}

void run().catch(() => {
  // Do not expose build configuration or inherited secrets in child output.
  process.stderr.write("DESKTOP_RENDERER_START_FAILED\n");
  process.exit(1);
});
