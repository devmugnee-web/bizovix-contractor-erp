import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { LocalApplication } from "./application.mjs";
import { LocalError } from "./security.mjs";
import { readRequestBody } from "./request-body.mjs";

const secretMatches = (left, right) => typeof left === "string" && Buffer.byteLength(left) === Buffer.byteLength(right) && timingSafeEqual(Buffer.from(left), Buffer.from(right));

export async function startLocalServer(config, dependencies = {}) {
  if (!config.capability || !/^[\w-]{32,}$/.test(config.capability)) throw new Error("A strong local capability is required");
  const application = new LocalApplication(config, dependencies);
  let allowedOrigin = null;
  const server = http.createServer(async (request, response) => {
    let cleanupBody;
    const origin = request.headers.origin;
    const respond = (status, value) => {
      response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      response.end(JSON.stringify(value));
    };
    try {
      if (origin && origin !== allowedOrigin) throw new LocalError(403, "Local request origin is not authorized.");
      if (origin) {
        response.setHeader("Access-Control-Allow-Origin", origin);
        response.setHeader("Vary", "Origin");
      }
      if (request.method === "OPTIONS") {
        if (!origin || origin !== allowedOrigin) throw new LocalError(403, "Origin required.");
        response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Bizovix-Local-Capability");
        response.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
        response.writeHead(204); response.end(); return;
      }
      if (!secretMatches(request.headers["x-bizovix-local-capability"], config.capability)) throw new LocalError(403, "Local request is not authorized.");
      const url = new URL(request.url, "http://127.0.0.1");
      if (url.pathname === "/__desktop/health" && request.method === "GET") {
        respond(200, { instanceId: config.instanceId, status: "ready", storage: application.active ? "open" : "awaiting-sign-in", rollout: "master-data-pilot" }); return;
      }
      if (url.pathname === "/__desktop/backup-export" && request.method === "POST") {
        // Only the native supervisor knows this second capability. A renderer
        // may request a chooser through IPC but cannot supply a filesystem path
        // directly to the local HTTP service.
        if (origin || typeof config.controlCapability !== "string" || config.controlCapability.length < 32 ||
            !secretMatches(request.headers["x-bizovix-control-capability"], config.controlCapability)) throw new LocalError(403, "Native backup export is not authorized.");
        const bearer = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
        application.requireSession(bearer);
        const received = await readRequestBody(request, () => application.requireSession(bearer));
        cleanupBody = received.cleanup;
        const body = received.body;
        if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || typeof body.destinationDirectory !== "string") throw new LocalError(400, "Choose a backup folder through the desktop app.");
        respond(200, { success: true, data: await application.exportBackup(bearer, body.destinationDirectory) }); return;
      }
      if (!url.pathname.startsWith("/api/v1/") || request.url.startsWith("//")) throw new LocalError(404, "Route not found.");
      const route = `${url.pathname.slice("/api/v1".length)}${url.search}`;
      const bearer = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? "")?.[1];
      const received = await readRequestBody(request, () => application.requireSession(bearer));
      cleanupBody = received.cleanup;
      const { body, contentType } = received;
      const result = await application.handle(request.method, route, bearer, body, contentType ? { "Content-Type": contentType } : {});
      if (result.response) {
        result.assertSession?.();
        for (const name of ["content-type", "content-disposition"]) {
          const value = result.response.headers.get(name);
          if (value) response.setHeader(name, value);
        }
        response.setHeader("Cache-Control", "no-store");
        response.writeHead(result.response.status);
        if (result.response.body) {
          for await (const chunk of result.response.body) { result.assertSession?.(); response.write(chunk); }
        }
        response.end();
      } else if (result.data && Array.isArray(result.data.items) && typeof result.data.meta === "object") {
        // Match Nest's ResponseInterceptor so the shared paginated client sees
        // the same envelope over the local and cloud transports.
        respond(200, { success: true, data: result.data.items, meta: result.data.meta,
          ...(result.data.summary !== undefined ? { summary: result.data.summary } : {}) });
      } else respond(200, { success: true, data: result.data ?? null });
    } catch (error) {
      if (response.headersSent) { response.destroy(); return; }
      const status = error instanceof LocalError ? error.status
        : ["CATEGORY_NOT_FOUND", "MASTER_NOT_FOUND"].includes(error.code) ? 404
        : ["INVALID_INPUT", "INVALID_MASTER", "INVALID_MASTER_TYPE", "MASTER_UPDATE_UNSUPPORTED"].includes(error.code) ? 400
        : /CONFLICT|PENDING|DUPLICATE|COMMAND_RESOLVED/.test(error.code ?? "") ? 409 : 500;
      if (!request.complete) { response.setHeader("Connection", "close"); request.resume(); }
      respond(status, { success: false, code: error.code ?? "LOCAL_ERROR", message: status < 500 || error instanceof LocalError ? error.message : "The operation could not be completed. Existing data has been preserved." });
    } finally {
      await cleanupBody?.().catch(() => console.warn("Temporary upload cleanup failed."));
    }
  });
  server.requestTimeout = 120_000;
  server.headersTimeout = 10_000;
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(config.port ?? 0, "127.0.0.1", resolve); });
  const interval = setInterval(() => void application.sync().catch(() => undefined), 15_000);
  interval.unref();
  const backupInterval = setInterval(() => void application.backup().catch(() => undefined), 60_000);
  backupInterval.unref();
  return {
    application,
    port: server.address().port,
    allowOrigin(origin) {
      const value = new URL(origin);
      if (value.origin !== origin || value.protocol !== "http:" || value.hostname !== "127.0.0.1") throw new Error("Invalid local renderer origin");
      allowedOrigin = origin;
    },
    async close() {
      clearInterval(interval);
      clearInterval(backupInterval);
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await application.logout();
    },
  };
}
