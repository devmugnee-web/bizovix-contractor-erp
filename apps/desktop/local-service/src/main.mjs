import path from "node:path";
import readline from "node:readline";
import { startLocalServer } from "./server.mjs";

const rootDirectory = process.env.BIZOVIX_LOCAL_DATA_ROOT;
if (!rootDirectory || !path.isAbsolute(rootDirectory)) throw new Error("An absolute application-owned data directory is required");
const service = await startLocalServer({
  rootDirectory,
  port: Number(process.env.PORT ?? 0),
  capability: process.env.BIZOVIX_LOCAL_CAPABILITY,
  controlCapability: process.env.BIZOVIX_LOCAL_CONTROL_CAPABILITY,
  instanceId: process.env.BIZOVIX_LOCAL_INSTANCE_ID,
  cloudApiUrl: process.env.BIZOVIX_CLOUD_API_URL,
  cloudPublicKey: process.env.BIZOVIX_CLOUD_PUBLIC_KEY,
  cloudIssuer: process.env.BIZOVIX_CLOUD_ISSUER,
  allowInsecureLocalCloud: process.env.BIZOVIX_ALLOW_INSECURE_LOCAL_CLOUD === "true",
});
process.stdout.write(`${JSON.stringify({ type: "ready", port: service.port, instanceId: process.env.BIZOVIX_LOCAL_INSTANCE_ID })}\n`);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await service.close();
  process.exit(0);
}
const input = readline.createInterface({ input: process.stdin });
input.on("line", (line) => {
  try {
    const value = JSON.parse(line);
    if (value.type === "shutdown") void stop();
    else if (value.type === "allow-origin") service.allowOrigin(value.origin);
  } catch { process.stderr.write("Invalid desktop supervisor message.\n"); }
});
input.on("close", () => void stop());
process.on("SIGTERM", () => void stop());
process.on("SIGINT", () => void stop());
