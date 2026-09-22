const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID, generateKeyPairSync } = require("node:crypto");
const { isTrustedRendererUrl, isAllowedDocumentPopup, validateReadyMessage } = require("../dist/runtime/contracts.js");
const { validateVendorConfig, childEnvironment } = require("../dist/runtime/paths.js");
const { startOwnedRuntime } = require("../dist/runtime/supervisor.js");
const { chooseAndExportBackup } = require("../dist/runtime/backup-export.js");

test("runtime bridge accepts only the exact local origin and no credential URLs", () => {
  const origin = "http://127.0.0.1:48123";
  assert.equal(isTrustedRendererUrl(`${origin}/dashboard`, origin), true);
  for (const target of ["http://127.0.0.1:4000", "http://127.0.0.1.evil.test:48123", "https://127.0.0.1:48123", "http://user@127.0.0.1:48123", "data:text/html,test"]) {
    assert.equal(isTrustedRendererUrl(target, origin), false, target);
  }
});

test("startup rejects forged instance IDs and malformed ports", () => {
  for (const port of [0, -1, 65536, 2.5, "3010"]) assert.equal(validateReadyMessage({ type: "ready", instanceId: "owned", port }, "owned"), null);
  assert.equal(validateReadyMessage({ type: "ready", instanceId: "other", port: 3010 }, "owned"), null);
});

test("receipt printing and local document previews survive without allowing external popups", () => {
  const origin = "http://127.0.0.1:48123";
  assert.equal(isAllowedDocumentPopup("about:blank", origin), true);
  assert.equal(isAllowedDocumentPopup(`blob:${origin}/document-id`, origin), true);
  assert.equal(isAllowedDocumentPopup("blob:https://untrusted.test/document-id", origin), false);
  assert.equal(isAllowedDocumentPopup("https://untrusted.test", origin), false);
});

test("vendor endpoints require a complete pinned configuration and HTTPS outside development", () => {
  assert.deepEqual(validateVendorConfig({}), {});
  assert.throws(() => validateVendorConfig({ cloudApiUrl: "https://example.test" }), /INCOMPLETE/);
  const keys = generateKeyPairSync("ed25519");
  const config = { cloudApiUrl: "http://127.0.0.1:4012/api/v1", cloudIssuer: "fixture", cloudPublicKey: keys.publicKey.export({ type: "spki", format: "pem" }) };
  assert.throws(() => validateVendorConfig(config), /URL_INVALID/);
  assert.equal(validateVendorConfig(config, true).cloudApiUrl, config.cloudApiUrl);
  assert.throws(() => validateVendorConfig({ ...config, cloudApiUrl: "https://secret:password@example.test" }), /URL_INVALID/);
  assert.throws(() => validateVendorConfig({ ...config, cloudPrivateKey: "must-not-ship" }, true), /UNKNOWN_FIELD/);
  assert.throws(() => validateVendorConfig({ ...config, cloudPublicKey: keys.privateKey.export({ type: "pkcs8", format: "pem" }) }, true), /PUBLIC_KEY_INVALID/);
});

test("child environment excludes database credentials and injection options", () => {
  const original = { DATABASE_URL: process.env.DATABASE_URL, JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET, NODE_OPTIONS: process.env.NODE_OPTIONS };
  try {
    process.env.DATABASE_URL = "do-not-forward";
    process.env.JWT_ACCESS_SECRET = "do-not-forward";
    process.env.NODE_OPTIONS = "--inspect";
    const environment = childEnvironment({ BIZOVIX_LOCAL_CAPABILITY: "explicit" });
    assert.equal(environment.DATABASE_URL, undefined);
    assert.equal(environment.JWT_ACCESS_SECRET, undefined);
    assert.equal(environment.NODE_OPTIONS, undefined);
    assert.equal(environment.BIZOVIX_LOCAL_CAPABILITY, "explicit");
  } finally {
    for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test("native backup export validates the session, uses a chooser path and sends both private capabilities", async () => {
  const calls = [], destination = "D:\\User Backups";
  let assertions = 0;
  const result = await chooseAndExportBackup({
    accessToken: "a".repeat(43), origin: "http://127.0.0.1:48123",
    capability: "renderer-capability", controlCapability: "native-control-capability",
    assertCurrent() { assertions += 1; },
    async chooseDirectory() { return destination; },
    async fetchImpl(url, options) {
      calls.push({ url, options });
      if (calls.length === 1) return new Response(JSON.stringify({ success: true, data: {} }), { status: 200 });
      return Response.json({ success: true, data: { directory: `${destination}\\backup-1`, pendingCount: 2, rejectedCount: 1 } });
    },
  });
  assert.equal(result.directory, `${destination}\\backup-1`);
  assert.equal(assertions, 2);
  assert.equal(calls[0].url, "http://127.0.0.1:48123/api/v1/desktop/status");
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${"a".repeat(43)}`);
  assert.equal(calls[1].url, "http://127.0.0.1:48123/__desktop/backup-export");
  assert.equal(calls[1].options.headers["X-Bizovix-Local-Capability"], "renderer-capability");
  assert.equal(calls[1].options.headers["X-Bizovix-Control-Capability"], "native-control-capability");
  assert.deepEqual(JSON.parse(calls[1].options.body), { destinationDirectory: destination });
});

test("native backup export does not open the chooser for invalid or unauthorized sessions and cancellation writes nothing", async () => {
  let requests = 0, choices = 0;
  const common = {
    origin: "http://127.0.0.1:48123", capability: "renderer", controlCapability: "native", assertCurrent() {},
    async chooseDirectory() { choices += 1; return null; },
  };
  assert.deepEqual(await chooseAndExportBackup({ ...common, accessToken: "short", async fetchImpl() { requests += 1; return new Response(null, { status: 200 }); } }), { error: "Sign in before exporting a backup." });
  assert.equal(requests, 0); assert.equal(choices, 0);
  assert.deepEqual(await chooseAndExportBackup({ ...common, accessToken: "a".repeat(43), async fetchImpl() { requests += 1; return new Response(null, { status: 401 }); } }), { error: "Sign in again before exporting a backup." });
  assert.equal(requests, 1); assert.equal(choices, 0);
  assert.deepEqual(await chooseAndExportBackup({ ...common, accessToken: "a".repeat(43), async fetchImpl() { requests += 1; return new Response(null, { status: 200 }); } }), { cancelled: true });
  assert.equal(requests, 2); assert.equal(choices, 1);
});

const serviceScript = `
const http = require('node:http');
const readline = require('node:readline');
const instanceId = process.env.BIZOVIX_LOCAL_INSTANCE_ID;
const server = http.createServer((req, res) => {
  if (req.headers['x-bizovix-local-capability'] !== 'test-capability') {res.writeHead(403);res.end();return;}
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({status:'ready',instanceId:process.env.WRONG_HEALTH === '1' ? 'wrong' : instanceId,storage:'no-profile'}));
});
server.listen(0, '127.0.0.1', () => console.log(JSON.stringify({type:'ready',port:server.address().port,instanceId})));
const close = () => server.close(() => process.exit(0));
const input = readline.createInterface({input:process.stdin});
input.on('line', line => {if(JSON.parse(line).type === 'shutdown') close();});
input.on('close', close);
`;

function options(extra = {}) {
  return { executable: process.execPath, args: ["-e", serviceScript], cwd: process.cwd(), env: { ...process.env, BIZOVIX_LOCAL_INSTANCE_ID: "test-instance" }, instanceId: "test-instance", kind: "local-service", capability: "test-capability", timeoutMs: 5_000, onUnexpectedExit() {}, log() {}, ...extra };
}

test("owned runtime uses a bound ephemeral port, authenticates health and shuts down its child", async () => {
  const runtime = await startOwnedRuntime(options());
  assert.ok(runtime.port > 0);
  assert.equal((await fetch(`${runtime.origin}/__desktop/health`)).status, 403);
  await runtime.stop();
  assert.notEqual(runtime.child.exitCode, null);
});

test("a healthy-looking service with the wrong identity is not accepted", async () => {
  await assert.rejects(startOwnedRuntime(options({ env: { ...process.env, BIZOVIX_LOCAL_INSTANCE_ID: "test-instance", WRONG_HEALTH: "1" } })), /HEALTH_CHECK_FAILED/);
});

test("a crashed startup and forged readiness fail without attaching another service", async () => {
  await assert.rejects(startOwnedRuntime(options({ args: ["-e", "process.exit(1)"] })), /EXITED_DURING_START/);
  await assert.rejects(startOwnedRuntime(options({ args: ["-e", `console.log(JSON.stringify({type:'ready',port:3010,instanceId:'${randomUUID()}'})); setInterval(()=>{},1000);`], timeoutMs: 150 })), /START_TIMEOUT/);
});

function rendererOptions({ delay = 0, status = 200, exitOnRequest = false, timeoutMs = 15_000 } = {}) {
  const script = `
const http=require('node:http'); const readline=require('node:readline');
const server=http.createServer((_request,response)=>{
  if (${JSON.stringify(exitOnRequest)}) { process.exit(1); return; }
  setTimeout(()=>{response.writeHead(${status});response.end('ready');},${delay});
});
server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({type:'ready',port:server.address().port,instanceId:process.env.BIZOVIX_LOCAL_INSTANCE_ID})));
readline.createInterface({input:process.stdin}).on('line',()=>server.close(()=>process.exit(0)));
`;
  return options({ kind: "renderer", args: ["-e", script], timeoutMs });
}

test("a cold healthy renderer can complete its first request after ten seconds within the startup budget", async () => {
  const runtime = await startOwnedRuntime(rendererOptions({ delay: 10_250 }));
  await runtime.stop();
  assert.notEqual(runtime.child.exitCode, null);
});

test("slow readiness still stops at the original bounded startup deadline", async () => {
  await assert.rejects(startOwnedRuntime(rendererOptions({ delay: 5_000, timeoutMs: 500 })), /DESKTOP_HEALTH_TIMEOUT/);
});

test("a real renderer error or child exit during readiness is never accepted as healthy", async () => {
  await assert.rejects(startOwnedRuntime(rendererOptions({ status: 503 })), /DESKTOP_HEALTH_CHECK_FAILED/);
  await assert.rejects(startOwnedRuntime(rendererOptions({ exitOnRequest: true })), /DESKTOP_PROCESS_EXITED_DURING_START|DESKTOP_HEALTH_CHECK_FAILED/);
});
