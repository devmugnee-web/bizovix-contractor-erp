const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");
const ts = require("typescript");
const { QueryClient } = require("@tanstack/react-query");

const sourceRoot = path.resolve(__dirname, "../src");
const success = (data) => Response.json({ success: true, data });
const denied = (desktop) => Response.json(desktop ? { success: false, code: "LOCAL_REQUEST_FAILED", message: "Please sign in." } : { success: false, message: "Unauthorized" }, { status: 401 });
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

// Load the actual TypeScript sources in a fresh browser-like context per test.
// No build artifacts, network credentials, application database, or React renderer are used.
function fixture(fetchImpl, desktop = false, suppliedQueryClient) {
  const values = new Map(), cache = new Map();
  const queryClient = suppliedQueryClient ?? { clears: 0, user: null, clear() { this.clears++; }, setQueryData(_key, user) { this.user = user; } };
  const window = { localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) } };
  if (desktop) window.bizovix = { localServiceEnabled: true, getRuntimeInfo: async () => ({ localApiUrl: "http://127.0.0.1:45123/api/v1", localCapability: "local-capability" }) };
  const context = vm.createContext({ window, crypto: webcrypto, fetch: fetchImpl, Response, URL, Blob, FormData, Headers });
  function load(file) {
    const absolute = path.resolve(sourceRoot, file.endsWith(".ts") ? file : `${file}.ts`);
    assert.ok(absolute.startsWith(`${sourceRoot}${path.sep}`));
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const module = { exports: {} }; cache.set(absolute, module);
    const javascript = ts.transpileModule(fs.readFileSync(absolute, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const requireLocal = (name) => {
      if (name === "@tanstack/react-query") return { useMutation: (options) => options, useQuery: (options) => options, useQueryClient: () => queryClient };
      assert.ok(name.startsWith("."), `Unexpected runtime dependency: ${name}`);
      return load(path.relative(sourceRoot, path.resolve(path.dirname(absolute), name)));
    };
    vm.runInContext(`(function(require,module,exports){${javascript}\n})`, context, { filename: absolute })(requireLocal, module, module.exports);
    return module.exports;
  }
  const tokens = load("token-storage").tokenStorage;
  tokens.setTokens("access-a", "refresh-a");
  return { ...load("http-client"), tokens, queryClient, auth: () => load("hooks/use-auth") };
}

for (const desktop of [false, true]) {
  test(`${desktop ? "desktop" : "cloud"}: only an explicit guard denial refreshes and retries the original mutation`, async () => {
    let writes = 0, refreshes = 0, effects = 0;
    const f = fixture(async (url, options) => {
      if (url.endsWith("/auth/refresh")) { refreshes++; return success({ accessToken: "access-a2", refreshToken: "refresh-a2" }); }
      writes++;
      if (desktop) assert.equal(options.headers["X-Bizovix-Local-Capability"], "local-capability");
      if (options.headers.Authorization === "Bearer access-a") return denied(desktop);
      effects++; assert.equal(options.body, '{"amount":"100.00"}'); return success({ saved: true });
    }, desktop);
    const session = f.tokens.snapshot().sessionId;
    assert.equal((await f.apiRequest("/receipts", { method: "POST", body: { amount: "100.00" } })).saved, true);
    assert.equal(writes, 2); assert.equal(refreshes, 1); assert.equal(effects, 1);
    assert.equal(f.tokens.snapshot().sessionId, session);
  });

  test(`${desktop ? "desktop" : "cloud"}: a committed old-account mutation is never replayed or allowed to clear the new account`, async () => {
    const started = deferred(), reply = deferred(); let writes = 0, refreshes = 0;
    const f = fixture(async (url) => {
      if (url.endsWith("/auth/refresh")) { refreshes++; return success({ accessToken: "wrong", refreshToken: "wrong" }); }
      writes++; started.resolve(); await reply.promise; return denied(desktop);
    }, desktop);
    const pending = f.apiRequest("/receipts", { method: "POST", body: { amount: "100.00" } });
    const rejected = assert.rejects(pending, { code: "SESSION_CHANGED" });
    await started.promise; f.tokens.setTokens("access-b", "refresh-b"); reply.resolve(); await rejected;
    assert.equal(writes, 1); assert.equal(refreshes, 0);
    assert.equal(f.tokens.getAccessToken(), "access-b"); assert.equal(f.tokens.getRefreshToken(), "refresh-b");
  });
}

test("unknown business 401 responses never replay JSON or binary mutations", async () => {
  for (const desktop of [false, true]) for (const binary of [false, true]) {
    let calls = 0;
    const f = fixture(async () => { calls++; return Response.json({ success: false, message: "Additional business verification required" }, { status: 401 }); }, desktop);
    await assert.rejects((binary ? f.apiRequestBlob : f.apiRequest)("/receipts", { method: "POST", body: { amount: 100 } }), { status: 401 });
    assert.equal(calls, 1);
  }
});

test("network failure after dispatch never refreshes, retries, or clears credentials", async () => {
  let calls = 0;
  const f = fixture(async () => { calls++; throw new TypeError("Response lost after commit"); }, true);
  await assert.rejects(f.apiRequest("/receipts", { method: "POST", body: { amount: 100 } }), /lost after commit/);
  assert.equal(calls, 1); assert.equal(f.tokens.getAccessToken(), "access-a");
});

test("concurrent denied requests share one refresh rotation", async () => {
  const started = deferred(), release = deferred(); let refreshes = 0, effects = 0;
  const f = fixture(async (url, options) => {
    if (url.endsWith("/auth/refresh")) { refreshes++; started.resolve(); await release.promise; return success({ accessToken: "access-a2", refreshToken: "refresh-a2" }); }
    if (options.headers.Authorization === "Bearer access-a") return denied(false);
    effects++; return success({ saved: true });
  });
  const requests = [1, 2].map((id) => f.apiRequest("/receipts", { method: "POST", body: { id } }));
  await started.promise; await new Promise(setImmediate); release.resolve(); await Promise.all(requests);
  assert.equal(refreshes, 1); assert.equal(effects, 2);
});

test("a late refresh cannot overwrite or clear the new account or retry the old mutation", async () => {
  const started = deferred(), release = deferred(); let writes = 0;
  const f = fixture(async (url) => {
    if (url.endsWith("/auth/refresh")) { started.resolve(); await release.promise; return success({ accessToken: "stale-a2", refreshToken: "stale-a2" }); }
    writes++; return denied(false);
  });
  const pending = f.apiRequest("/receipts", { method: "POST", body: { amount: 100 } });
  const rejected = assert.rejects(pending, { code: "SESSION_CHANGED" });
  await started.promise; f.tokens.setTokens("access-b", "refresh-b"); release.resolve(); await rejected;
  assert.equal(writes, 1); assert.equal(f.tokens.getAccessToken(), "access-b"); assert.equal(f.tokens.getRefreshToken(), "refresh-b");
});

test("a delayed old-token denial reuses the completed rotation within the same session", async () => {
  const started = deferred(), release = deferred(); let refreshes = 0;
  const f = fixture(async (url, options) => {
    if (url.endsWith("/auth/refresh")) { refreshes++; return success({ accessToken: "access-a2", refreshToken: "refresh-a2" }); }
    if (options.headers.Authorization !== "Bearer access-a") return success({ saved: true });
    if (url.endsWith("/slow")) { started.resolve(); await release.promise; }
    return denied(false);
  });
  const slow = f.apiRequest("/slow"); await started.promise;
  await f.apiRequest("/fast"); release.resolve(); await slow;
  assert.equal(refreshes, 1);
});

test("binary data arriving after account switch is discarded", async () => {
  let controller; const started = deferred();
  const f = fixture(async () => { started.resolve(); return new Response(new ReadableStream({ start(value) { controller = value; } })); }, true);
  const pending = f.apiRequestBlob("/documents/file"), rejected = assert.rejects(pending, { code: "SESSION_CHANGED" });
  await started.promise; await new Promise(setImmediate); f.tokens.setTokens("access-b", "refresh-b");
  controller.enqueue(Buffer.from("old account confidential data")); controller.close(); await rejected;
  assert.equal(f.tokens.getAccessToken(), "access-b");
});

test("late logout and superseded login callbacks cannot replace a newer login", () => {
  const f = fixture(async () => { throw new Error("No network expected"); }, true), auth = f.auth();
  const logout = auth.useLogout(), logoutContext = logout.onMutate();
  const loginA = auth.useLogin(), contextA = loginA.onMutate();
  const loginB = auth.useLogin(), contextB = loginB.onMutate();
  const newer = { accessToken: "access-b", refreshToken: "refresh-b", user: { id: "b" } };
  loginB.onSuccess(newer, {}, contextB);
  loginA.onSuccess({ accessToken: "access-a-late", refreshToken: "refresh-a-late", user: { id: "a" } }, {}, contextA);
  logout.onSettled(null, null, undefined, logoutContext);
  assert.equal(f.tokens.getAccessToken(), "access-b"); assert.equal(f.queryClient.user.id, "b"); assert.equal(f.queryClient.clears, 1);
});

test("failed login does not refresh or clear an existing session", async () => {
  let calls = 0;
  const f = fixture(async () => { calls++; return denied(false); });
  await assert.rejects(f.apiRequest("/auth/login", { method: "POST", skipAuth: true, body: { email: "wrong", password: "wrong" } }), { status: 401 });
  assert.equal(calls, 1); assert.equal(f.tokens.getAccessToken(), "access-a");
});

test("logout still clears its account cache if authentication failure already removed its tokens", () => {
  const f = fixture(async () => { throw new Error("No network expected"); }, true);
  const logout = f.auth().useLogout(), context = logout.onMutate();
  f.tokens.clear();
  logout.onSettled(null, new Error("Unauthorized"), undefined, context);
  assert.equal(f.queryClient.clears, 1);
  assert.equal(f.tokens.getAccessToken(), null);
});

for (const mode of ["web", "desktop", "development"]) {
  test(`${mode} login removes prior-account query data before caching the new user`, async () => {
    const client = new QueryClient();
    client.setQueryData(["receipts"], [{ organizationId: "org-a", amount: "12500.00" }]);
    client.setQueryData(["auth", "me"], { id: "a" });
    const result = { accessToken: "access-b", refreshToken: "refresh-b", user: { id: "b", organizationId: "org-b" } };
    const f = fixture(async () => success(result), mode === "desktop", client);
    try {
      const auth = f.auth(), login = mode === "development" ? auth.useDevLogin() : auth.useLogin();
      const context = login.onMutate(), payload = { email: "b@example.invalid", password: "test-password" };
      const response = await login.mutationFn(payload);
      login.onSuccess(response, payload, context);
      assert.equal(client.getQueryData(["receipts"]), undefined);
      assert.equal(client.getQueryData(["auth", "me"]).id, "b");
      assert.equal(client.getQueryCache().getAll().length, 1);
      assert.equal(f.tokens.getAccessToken(), "access-b");
    } finally { client.clear(); }
  });
}

test("an HTTP 401 logout clears the real query cache even after the transport clears tokens", async () => {
  const client = new QueryClient();
  client.setQueryData(["receipts"], [{ organizationId: "org-a", amount: "12500.00" }]);
  const f = fixture(async () => Response.json({ success: false, message: "Session revoked" }, { status: 401 }), false, client);
  try {
    const logout = f.auth().useLogout(), context = logout.onMutate();
    let failure;
    try { await logout.mutationFn(); } catch (error) { failure = error; }
    assert.equal(failure.status, 401);
    assert.equal(f.tokens.getAccessToken(), null);
    assert.ok(client.getQueryData(["receipts"]), "The hook still owns cache cleanup after transport denial");
    logout.onSettled(undefined, failure, undefined, context);
    assert.equal(client.getQueryCache().getAll().length, 0);
  } finally { client.clear(); }
});
