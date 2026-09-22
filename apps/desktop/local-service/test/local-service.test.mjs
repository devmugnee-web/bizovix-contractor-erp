import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import { DesktopStore } from "../../../../packages/desktop-storage/src/index.mjs";
import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { LocalApplication } from "../src/application.mjs";
import { startLocalServer } from "../src/server.mjs";
import { canonicalJson, verifyOfflineGrant, vaultLocation, unlockVault } from "../src/security.mjs";
import { latestProfileBackup, restoreProfileBackup, verifyProfileBackup } from "../src/backups.mjs";
import { containsPattern, queryOrganizations } from "../src/organization-queries.mjs";

const permissionList = ["masters.read", "vendor.create", "vendor.update"];
function fixture({ masters = false, organizations = false } = {}) {
  const rootDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "bizovix-local-test-"));
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const cloud = { offline: false, denyLogin: false, denyCommands: false, loseReply: false, applied: 0, time: Date.now(), categories: new Map(), receipts: new Map(),
    masterRecords: { uom: new Map(), paymentTerm: new Map(), organizationMaster: new Map() }, masterApplied: { uom: 0, paymentTerm: 0, organizationMaster: 0 }, masterReceipts: new Map(), masterRequests: [], proxyRequests: [],
    capabilities: ["masterCategory.create", "masterCategory.update", ...(masters ? ["uom.read", "uom.create", "uom.update", "paymentTerm.read", "paymentTerm.create", "paymentTerm.update"] : []), ...(organizations ? ["organizationMaster.read", "organizationMaster.create", "organizationMaster.list"] : [])] };
  const config = { rootDirectory, cloudApiUrl: "http://127.0.0.1:49999/api/v1", cloudPublicKey: publicKey.export({ type: "spki", format: "pem" }), cloudIssuer: "bizovix-test", allowInsecureLocalCloud: true, capability: "c".repeat(64), instanceId: randomUUID() };
  const user = { id: "user-a", organizationId: "org-a", email: "a@example.invalid", name: "Test A", roleName: "Admin", permissions: [...permissionList, ...(masters ? ["uom.manage", "payment_terms.manage"] : [])] };
  const success = (data) => Response.json({ success: true, data });
  const reject = (status, message) => Response.json({ success: false, message }, { status });
  const fetchImpl = async (input, options = {}) => {
    if (cloud.offline) throw new TypeError("Disconnected");
    const route = new URL(input).pathname.replace("/api/v1/", "");
    const body = options.body && typeof options.body === "string" ? JSON.parse(options.body) : undefined;
    if (cloud.pauseStatus && route.startsWith("desktop-sync/")) return reject(cloud.pauseStatus, "Desktop sync is not enabled");
    if (route === "auth/login") {
      if (cloud.denyLogin || body.password !== (cloud.password ?? "test-password")) return reject(401, "Invalid login");
      return success({ user, accessToken: "cloud-access-secret", refreshToken: "cloud-refresh-secret" });
    }
    if (route === "auth/refresh") return success({ user, accessToken: "cloud-access-secret", refreshToken: "cloud-refresh-secret" });
    if (route === "desktop-sync/register") {
      const payload = { formatVersion: 1, issuer: config.cloudIssuer, audience: "bizovix-desktop", deviceId: body.deviceId, organizationId: user.organizationId, userId: user.id, user, permissions: user.permissions, capabilities: cloud.capabilities, issuedAt: new Date(cloud.time).toISOString(), expiresAt: new Date(cloud.time + 3600_000).toISOString() };
      const grant = { payload, signature: sign(null, Buffer.from(canonicalJson(payload)), privateKey).toString("base64url") };
      return success({ deviceId: body.deviceId, grant });
    }
    if (route === "desktop-sync/snapshot") return success({ categories: [...cloud.categories.values()], cursor: `epoch:${cloud.applied}` });
    if (route === "desktop-sync/changes") return success({ changes: [...cloud.categories.values()].map((category) => ({ kind: "upsert", category })), cursor: `epoch:${cloud.applied}`, hasMore: false });
    if (route.startsWith("desktop-sync/masters/")) {
      const entityType = body?.entityType ?? new URL(input).searchParams.get("entityType");
      cloud.masterRequests.push({ route, body });
      const rows = cloud.masterRecords[entityType];
      if (!rows) return reject(400, "Unknown master type");
      const cursor = () => `${entityType}:${cloud.masterApplied[entityType]}`;
      const queryIndex = entityType === "organizationMaster" ? { queryIndex: {
        formatVersion: 1,
        orderedIds: [...rows.values()].sort((a, b) => a.shortName.localeCompare(b.shortName) || a.id.localeCompare(b.id)).map((record) => record.id),
        caseMappings: Array.from({ length: 26 }, (_, index) => [String.fromCharCode(65 + index), String.fromCharCode(97 + index)]),
      } } : {};
      if (route.endsWith("/snapshot")) return success({ entityType, schemaVersion: 1, records: [...rows.values()], cursor: cursor(), ...queryIndex });
      if (route.endsWith("/changes") && entityType === "organizationMaster" && cloud.failOrganizationPull) throw new TypeError("Disconnected after organization acknowledgement");
      if (route.endsWith("/changes")) return success({ entityType, changes: [...rows.values()].map((record) => ({ kind: "upsert", record })), cursor: cursor(), hasMore: false, ...queryIndex });
      if (route.endsWith("/commands")) {
        if (cloud.denyCommands) return reject(403, "Permission revoked");
        if (cloud.masterReceipts.has(body.operationId)) return success(cloud.masterReceipts.get(body.operationId));
        if (entityType === "organizationMaster" && cloud.rejectOrganizationName === body.payload.shortName) return reject(409, "Organization short name already exists");
        const existing = rows.get(body.entityId);
        if (body.commandType.endsWith("update") && existing?.version !== body.expectedVersion) return reject(409, "Master record changed on another device");
        const record = { ...body.payload, id: body.entityId, version: (existing?.version ?? 0) + 1, createdAt: existing?.createdAt ?? new Date(cloud.time).toISOString(), updatedAt: new Date(cloud.time).toISOString() };
        rows.set(record.id, record); cloud.masterApplied[entityType] += 1;
        const receipt = { entityType, operationId: body.operationId, record, cursor: cursor() };
        cloud.masterReceipts.set(body.operationId, receipt);
        if (cloud.loseMasterReply) { cloud.loseMasterReply = false; throw new TypeError("Lost master acknowledgement after commit"); }
        return success(receipt);
      }
    }
    if (route === "desktop-sync/commands") {
      if (cloud.denyCommands) return reject(403, "Permission revoked");
      if (cloud.receipts.has(body.operationId)) return success(cloud.receipts.get(body.operationId));
      const existing = cloud.categories.get(body.entityId);
      if (body.commandType.endsWith("update") && existing?.version !== body.expectedVersion) return reject(409, "Category changed on another device");
      const category = { ...body.payload, id: body.entityId, version: (existing?.version ?? 0) + 1, createdAt: existing?.createdAt ?? new Date(cloud.time).toISOString(), updatedAt: new Date(cloud.time).toISOString() };
      cloud.categories.set(category.id, category);
      cloud.applied++;
      const receipt = { operationId: body.operationId, category, cursor: `epoch:${cloud.applied}` };
      cloud.receipts.set(body.operationId, receipt);
      if (cloud.loseReply) { cloud.loseReply = false; throw new TypeError("Lost response after commit"); }
      return success(receipt);
    }
    cloud.proxyRequests.push({ route, query: new URL(input).search, method: options.method });
    return success({ untouchedCloudRoute: route });
  };
  return {
    config, cloud, privateKey, publicKey, user, fetchImpl,
    app: () => new LocalApplication(config, { fetchImpl, now: () => cloud.time }),
    cleanup() {
      assert.equal(path.dirname(rootDirectory), path.resolve(os.tmpdir()));
      assert.ok(path.basename(rootDirectory).startsWith("bizovix-local-test-"));
      fs.rmSync(rootDirectory, { recursive: true, force: true });
    },
  };
}
const credentials = { email: "a@example.invalid", password: "test-password" };
const category = (name) => ({ type: "MATERIAL", name, description: "", isActive: true });

test("JWT-only organization members bootstrap, save offline, restart, and recover a lost cloud receipt without master permissions", async () => {
  const f = fixture({ organizations: true }); let app = f.app();
  try {
    f.user.permissions = [];
    f.cloud.capabilities = ["organizationMaster.read", "organizationMaster.create"];
    let login = await app.login(credentials);
    assert.deepEqual(app.status().offlineModules, ["organizations"]);
    assert.equal(app.active.store.readCursor(), null);
    f.cloud.offline = true;
    const saved = (await app.handle("POST", "/organizations", login.accessToken, { shortName: " BWDB ", fullName: " Bangladesh Water Development Board " })).data;
    assert.equal(saved.shortName, " BWDB "); assert.equal(saved.organizationId, f.user.organizationId);
    assert.equal(saved.syncStatus, "PENDING");
    assert.deepEqual((await app.handle("GET", "/organizations", login.accessToken)).data, []);
    assert.equal((await app.handle("GET", `/desktop/organization-drafts/${saved.id}`, login.accessToken)).data.operationId, saved.operationId);
    assert.deepEqual((await app.handle("GET", "/desktop/organization-drafts", login.accessToken)).data.map((row) => row.id), [saved.id]);
    await assert.rejects(app.handle("GET", "/organizations/all?includeLocal=true", login.accessToken), { status: 403 });
    await app.backup({ force: true });
    const backup = path.join(path.dirname(app.active.store.status().databasePath), "backups", app.active.lastBackup.id);
    assert.equal((await verifyProfileBackup(backup)).storage.pendingCount, 1);
    await app.logout(); app = f.app(); login = await app.login(credentials);
    assert.equal((await app.handle("GET", `/desktop/organization-drafts/${saved.id}`, login.accessToken)).data.operationId, saved.operationId);
    f.cloud.offline = false; f.cloud.loseMasterReply = true;
    await app.sync(); assert.equal(app.status().storage.pendingCount, 1);
    await app.sync(); assert.equal(app.status().lastSyncError, null);
    assert.equal(app.status().storage.pendingCount, 0); assert.equal(f.cloud.masterApplied.organizationMaster, 1);
    assert.equal(app.active.store.readCursor(), null, "organization-only sync does not bootstrap category data");
    const requests = f.cloud.masterRequests.filter((entry) => entry.body?.operationId === saved.operationId);
    assert.equal(requests.length, 2); assert.deepEqual(requests[0].body, requests[1].body);
    const accepted = (await app.handle("GET", "/organizations?search=BW", login.accessToken)).data;
    assert.equal(accepted[0].id, saved.id); assert.equal(accepted[0].syncStatus, "SYNCED");
    assert.deepEqual((await app.handle("GET", "/desktop/organization-drafts", login.accessToken)).data, []);
  } finally { await app.logout(); f.cleanup(); }
});

test("organization queries exclude drafts before caps and counts, preserve raw search and default pagination, and allow explicit management drafts", async () => {
  const f = fixture({ organizations: true }); const app = f.app();
  try {
    for (let index = 0; index < 105; index += 1) {
      const record = { id: randomUUID(), shortName: `Org${String(index).padStart(3, "0")}`, fullName: `Organization ${index}`, version: 1, createdAt: new Date(f.cloud.time).toISOString(), updatedAt: new Date(f.cloud.time).toISOString() };
      f.cloud.masterRecords.organizationMaster.set(record.id, record);
    }
    const login = await app.login(credentials); f.cloud.offline = true;
    for (let index = 0; index < 25; index += 1) await app.handle("POST", "/organizations", login.accessToken, { shortName: `Org!draft${index}`, fullName: "Offline Organization" });
    const typeahead = (await app.handle("GET", "/organizations", login.accessToken)).data;
    assert.equal(typeahead.length, 100); assert.ok(typeahead.every((row) => row.syncStatus === "SYNCED"));
    const search = (await app.handle("GET", "/organizations?search=%20ORG%20", login.accessToken)).data;
    assert.equal(search.length, 20); assert.equal(search[0].shortName, "Org000");
    assert.deepEqual((await app.handle("GET", "/organizations?search=o", login.accessToken)).data, []);
    const page = (await app.handle("GET", "/organizations/all", login.accessToken)).data;
    assert.equal(page.items.length, 8); assert.deepEqual(page.meta, { page: 1, limit: 8, total: 105, totalPages: 14 });
    const secondPage = (await app.handle("GET", "/organizations/all?page=2&limit=10", login.accessToken)).data;
    assert.equal(secondPage.items[0].shortName, "Org010");
    const management = (await app.handle("GET", "/organizations/all?includeLocal=true&limit=200", login.accessToken)).data;
    assert.equal(management.meta.total, 130); assert.equal(management.items.filter((row) => row.syncStatus === "PENDING").length, 25);
    assert.equal((await app.handle("GET", "/organizations/all?search=%20Org%20", login.accessToken)).data.meta.total, 0, "paginated search retains spaces");
    for (const query of ["page=0", "limit=1.5", "page=1&page=2", "includeLocal=1", "bogus=value", "search=a&search=b", "page=9007199254740991&limit=8"]) {
      await assert.rejects(app.handle("GET", `/organizations/all?${query}`, login.accessToken), { status: 400 });
    }
  } finally { await app.logout(); f.cleanup(); }
});

test("organization rejected creates retain identity and require explicit revision; accepted records cannot be edited", async () => {
  const f = fixture({ organizations: true }); const app = f.app();
  try {
    const login = await app.login(credentials);
    const saved = (await app.handle("POST", "/organizations", login.accessToken, { shortName: "Duplicate", fullName: "Retained local value" })).data;
    await assert.rejects(app.handle("PATCH", `/desktop/organization-drafts/${saved.id}`, login.accessToken, { shortName: "Too early", fullName: "Pending" }), (error) => /PENDING|RESOLVED/.test(error.code));
    f.cloud.rejectOrganizationName = "Duplicate"; await app.sync();
    const rejected = (await app.handle("GET", `/desktop/organization-drafts/${saved.id}`, login.accessToken)).data;
    assert.equal(rejected.syncStatus, "REJECTED"); assert.equal(rejected.fullName, "Retained local value");
    assert.deepEqual((await app.handle("GET", "/organizations", login.accessToken)).data, []);
    const revised = (await app.handle("PATCH", `/desktop/organization-drafts/${saved.id}`, login.accessToken, { shortName: "Reviewed", fullName: "Retained local value" })).data;
    assert.equal(revised.id, saved.id); assert.equal(revised.createdAt, saved.createdAt);
    assert.notEqual(revised.operationId, saved.operationId);
    const queued = app.active.store.pendingMasterCommands("organizationMaster")[0];
    assert.equal(queued.commandType, "organizationMaster.create"); assert.equal(queued.expectedVersion, null);
    await app.sync(); assert.equal(app.status().storage.pendingCount, 0); assert.equal(app.status().storage.rejectedCount, 0);
    await assert.rejects(app.handle("PATCH", `/desktop/organization-drafts/${saved.id}`, login.accessToken, { shortName: "Illegal edit", fullName: "Do not change" }), (error) => /RESOLVED|UPDATE_UNSUPPORTED/.test(error.code));
    assert.equal(f.cloud.masterRecords.organizationMaster.get(saved.id).shortName, "Reviewed");
    await assert.rejects(app.handle("GET", `/desktop/organization-drafts/${randomUUID()}`, login.accessToken), { status: 404 });
  } finally { await app.logout(); f.cleanup(); }
});

test("old organization grants proxy ordinary routes without the local hint and cannot use local draft recovery", async () => {
  const f = fixture(); const app = f.app();
  try {
    const login = await app.login(credentials);
    assert.equal(app.status().organizationDraftRecoveryAvailable, false);
    const result = await app.handle("GET", "/organizations/all?includeLocal=true&page=2&search=Road", login.accessToken);
    assert.equal((await result.response.json()).data.untouchedCloudRoute, "organizations/all");
    assert.equal(f.cloud.proxyRequests.at(-1).query, "?page=2&search=Road");
    await assert.rejects(app.handle("GET", `/desktop/organization-drafts/${randomUUID()}`, login.accessToken), { status: 403 });
    await assert.rejects(app.handle("GET", "/desktop/organization-drafts", login.accessToken), { status: 403 });
    await assert.rejects(app.handle("PATCH", `/desktop/organization-drafts/${randomUUID()}`, login.accessToken, { shortName: "X", fullName: "X" }), { status: 403 });
    assert.equal(f.cloud.proxyRequests.length, 1);
  } finally { await app.logout(); f.cleanup(); }
});

test("organization recovery list survives restart and remains profile-bound without master-list permission", async () => {
  const f = fixture({ organizations: true }); let app = f.app();
  try {
    f.user.permissions = []; f.cloud.capabilities = ["organizationMaster.read", "organizationMaster.create"];
    let login = await app.login(credentials);
    const saved = (await app.handle("POST", "/organizations", login.accessToken, { shortName: "Recover", fullName: "Preserve this draft" })).data;
    app.active.store.rejectMasterCommand(saved.operationId, "CONFLICT", "Review required");
    await app.logout(); f.cloud.offline = true; app = f.app(); login = await app.login(credentials);
    const drafts = (await app.handle("GET", "/desktop/organization-drafts", login.accessToken)).data;
    assert.equal(drafts.length, 1); assert.equal(drafts[0].operationId, saved.operationId); assert.equal(drafts[0].syncStatus, "REJECTED");
    await app.logout(); f.cloud.offline = false;
    f.user.email = "b@example.invalid"; f.user.id = "user-b"; f.user.organizationId = "org-b";
    login = await app.login({ ...credentials, email: f.user.email });
    assert.deepEqual((await app.handle("GET", "/desktop/organization-drafts", login.accessToken)).data, []);
    await assert.rejects(app.handle("GET", `/desktop/organization-drafts/${saved.id}`, login.accessToken), { status: 404 });
  } finally { await app.logout(); f.cleanup(); }
});

test("organization draft recovery survives an ACK followed by failed pull and offline restart without a query index", async () => {
  const f = fixture({ organizations: true }); let app = f.app();
  try {
    f.user.permissions = []; f.cloud.capabilities = ["organizationMaster.read", "organizationMaster.create"];
    let login = await app.login(credentials);
    const rejected = (await app.handle("POST", "/organizations", login.accessToken, { shortName: "Duplicate", fullName: "Keep my draft" })).data;
    f.cloud.rejectOrganizationName = "Duplicate"; await app.sync();
    const accepted = (await app.handle("POST", "/organizations", login.accessToken, { shortName: "Accepted", fullName: "Cloud accepted" })).data;
    f.cloud.failOrganizationPull = true; await app.sync();
    assert.ok(app.status().lastSyncError);
    assert.equal(f.cloud.masterApplied.organizationMaster, 1);
    assert.equal(app.active.store.readOrganizationQueryIndex(), null);
    assert.ok(!app.status().offlineModules.includes("organizations"), "accepted search remains unavailable until cloud order is refreshed");
    await assert.rejects(app.handle("GET", "/organizations", login.accessToken), { status: 503, code: "MODULE_BOOTSTRAP_REQUIRED" });
    await assert.rejects(app.handle("POST", "/organizations", login.accessToken, { shortName: "Fresh", fullName: "Wait for bootstrap" }), { status: 503 });
    await app.logout(); f.cloud.offline = true; app = f.app(); login = await app.login(credentials);
    const drafts = (await app.handle("GET", "/desktop/organization-drafts", login.accessToken)).data;
    assert.deepEqual(drafts.map((row) => [row.id, row.syncStatus]), [[rejected.id, "REJECTED"]]);
    assert.equal(app.status().organizationDraftRecoveryAvailable, true);
    assert.equal((await app.handle("GET", `/desktop/organization-drafts/${rejected.id}`, login.accessToken)).data.fullName, "Keep my draft");
    assert.equal((await app.handle("GET", `/desktop/organization-drafts/${accepted.id}`, login.accessToken)).data.syncStatus, "SYNCED");
    await assert.rejects(app.handle("PATCH", `/desktop/organization-drafts/${accepted.id}`, login.accessToken, { shortName: "Illegal", fullName: "Do not edit accepted" }), { code: "COMMAND_RESOLVED" });
    const revised = (await app.handle("PATCH", `/desktop/organization-drafts/${rejected.id}`, login.accessToken, { shortName: "Corrected", fullName: "Keep my draft" })).data;
    assert.equal(revised.id, rejected.id); assert.equal(revised.createdAt, rejected.createdAt);
    assert.notEqual(revised.operationId, rejected.operationId); assert.equal(revised.syncStatus, "PENDING");
    assert.equal(app.active.store.readOrganizationQueryIndex(), null, "draft recovery does not manufacture a query policy");
    await app.backup({ force: true });
    const backup = path.join(path.dirname(app.active.store.status().databasePath), "backups", app.active.lastBackup.id);
    assert.equal((await verifyProfileBackup(backup)).storage.pendingCount, 1);
    await app.logout(); app = f.app(); login = await app.login(credentials);
    assert.equal((await app.handle("GET", "/desktop/organization-drafts", login.accessToken)).data[0].operationId, revised.operationId);
    f.cloud.offline = false; f.cloud.failOrganizationPull = false; await app.sync();
    assert.equal(app.status().lastSyncError, null); assert.equal(app.status().storage.pendingCount, 0);
    assert.equal(f.cloud.masterApplied.organizationMaster, 2);
    assert.ok(app.status().offlineModules.includes("organizations"));
    assert.deepEqual((await app.handle("GET", "/desktop/organization-drafts", login.accessToken)).data, []);
    assert.equal((await app.handle("GET", "/organizations?search=Corrected", login.accessToken)).data[0].id, rejected.id);
  } finally { await app.logout(); f.cleanup(); }
});

test("organization capabilities keep list and create permission separate from authenticated search", async () => {
  const f = fixture({ organizations: true }); const app = f.app();
  try {
    f.cloud.capabilities = ["organizationMaster.read"];
    const login = await app.login(credentials); f.cloud.offline = true;
    assert.deepEqual((await app.handle("GET", "/organizations", login.accessToken)).data, []);
    await assert.rejects(app.handle("GET", "/organizations/all", login.accessToken), { status: 403 });
    await assert.rejects(app.handle("POST", "/organizations", login.accessToken, { shortName: "X", fullName: "X" }), { status: 403 });
    assert.equal(app.status().storage.pendingCount, 0);
  } finally { await app.logout(); f.cleanup(); }
});

test("organization grant renewal bootstraps the new stream for a previously activated restricted member", async () => {
  const f = fixture(); const app = f.app();
  try {
    f.user.permissions = []; f.cloud.capabilities = [];
    const login = await app.login(credentials);
    assert.deepEqual(app.status().offlineModules, []);
    assert.equal(app.status().organizationDraftRecoveryAvailable, false);
    f.cloud.capabilities.push("organizationMaster.read", "organizationMaster.create"); f.cloud.time += 50 * 60_000;
    await app.sync(); assert.equal(app.status().lastSyncError, null);
    assert.deepEqual(app.status().offlineModules, ["organizations"]);
    assert.equal(app.status().organizationDraftRecoveryAvailable, true);
    f.cloud.offline = true;
    assert.equal((await app.handle("POST", "/organizations", login.accessToken, { shortName: "RHD", fullName: "Roads and Highways" })).data.syncStatus, "PENDING");
  } finally { await app.logout(); f.cleanup(); }
});

test("organization search retains PostgreSQL LIKE wildcard and escape behavior including Unicode characters", () => {
  for (const [search, value, expected] of [
    ["ab", "Road ABC", true], ["a_c", "Road ABC", true], ["a%c", "Road A long C", true],
    [String.raw`a\_c`, "Road a_c", true], [String.raw`a\_c`, "Road abc", false],
    [String.raw`a\%c`, "Road a%c", true], [String.raw`a\%c`, "Road abc", false],
    ["😀_", "😀বাংলা", true], ["__", "😀", false], ["__", "😀A", true],
    [".", "any", false], ["[a]", "[a]", true], ["বাংলা", "সড়ক বাংলা উন্নয়ন", true],
    ["abc\\", "abc%", true], ["abc\\", "abc%x", false],
  ]) assert.equal(containsPattern(search)(value), expected, `${search} / ${value}`);
  assert.equal(containsPattern("%a".repeat(100) + "!")("a".repeat(200)), false, "adversarial wildcard matching uses bounded dynamic programming");
});

test("organization query uses authoritative ordering and case mappings rather than the PC locale", () => {
  const caseMappings = Array.from({ length: 26 }, (_, index) => [String.fromCharCode(65 + index), String.fromCharCode(97 + index)]);
  const records = ["A_B", "A%B", "Straße", "STRAẞE", "İstanbul"].map((shortName, index) => ({ id: String(index), shortName, fullName: shortName, syncStatus: "SYNCED" }));
  const store = { listMasters: () => records, readOrganizationQueryIndex: () => ({ formatVersion: 1, orderedIds: ["1", "0", "2", "3", "4"], caseMappings }) };
  const query = (search) => queryOrganizations(store, new URL(`http://127.0.0.1/organizations/all?${search}`));
  assert.deepEqual(query("limit=2").items.map((row) => row.shortName), ["A%B", "A_B"]);
  assert.deepEqual(query(`search=${encodeURIComponent("ße")}`).items.map((row) => row.shortName), ["Straße"]);
  assert.deepEqual(query(`search=${encodeURIComponent("ẞE")}`).items.map((row) => row.shortName), ["STRAẞE"]);
  assert.deepEqual(query(`search=${encodeURIComponent("i̇s")}`).items, []);
  assert.deepEqual(query(`search=${encodeURIComponent("İs")}`).items.map((row) => row.shortName), ["İstanbul"]);
});

test("UOM and payment terms survive offline restart and verified backup, then synchronize independently", async () => {
  const f = fixture({ masters: true }); let app = f.app();
  try {
    let login = await app.login(credentials);
    assert.deepEqual(app.status().offlineModules, ["master-categories", "uoms", "payment-terms"]);
    f.cloud.offline = true;
    const unit = (await app.handle("POST", "/uoms", login.accessToken, { code: " kg ", name: " Kilogram ", symbol: "kg" })).data;
    const term = (await app.handle("POST", "/payment-terms", login.accessToken, { name: " Net 30 ", days: 30 })).data;
    assert.equal(unit.code, "KG"); assert.equal(unit.name, "Kilogram");
    assert.equal(term.name, "Net 30"); assert.equal(term.days, 30);
    assert.equal(app.status().storage.pendingCount, 2);
    await app.backup();
    const backupDirectory = path.join(path.dirname(app.active.store.status().databasePath), "backups", app.active.lastBackup.id);
    assert.equal((await verifyProfileBackup(backupDirectory)).storage.pendingCount, 2);
    await app.logout(); app = f.app(); login = await app.login(credentials);
    assert.equal((await app.handle("GET", "/uoms", login.accessToken)).data[0].operationId, unit.operationId);
    assert.equal((await app.handle("GET", "/payment-terms", login.accessToken)).data[0].operationId, term.operationId);
    f.cloud.offline = false; await app.sync();
    assert.equal(app.status().lastSyncError, null); assert.equal(app.status().storage.pendingCount, 0);
    assert.equal(f.cloud.masterApplied.uom, 1); assert.equal(f.cloud.masterApplied.paymentTerm, 1);
    assert.equal(f.cloud.applied, 0, "new master streams do not consume category sequence numbers");
    assert.equal((await app.handle("GET", "/uoms", login.accessToken)).data[0].syncStatus, "SYNCED");
    const updated = (await app.handle("PATCH", `/uoms/${unit.id}`, login.accessToken, { code: "DIFFERENT", name: "Kilo" })).data;
    assert.equal(updated.code, "KG", "existing immutable code semantics are retained");
    assert.equal(updated.symbol, "kg", "omitted optional fields are retained");
    await app.sync(); assert.equal(f.cloud.masterRecords.uom.get(unit.id).name, "Kilo");
  } finally { await app.logout(); f.cleanup(); }
});

test("master acknowledgement loss retries the immutable operation without duplicate records", async () => {
  const f = fixture({ masters: true }); const app = f.app();
  try {
    const login = await app.login(credentials);
    const saved = (await app.handle("POST", "/uoms", login.accessToken, { code: "EA", name: "Each" })).data;
    f.cloud.loseMasterReply = true;
    await app.sync();
    assert.equal(app.status().storage.pendingCount, 1); assert.equal(f.cloud.masterApplied.uom, 1);
    await app.sync();
    assert.equal(app.status().lastSyncError, null); assert.equal(app.status().storage.pendingCount, 0);
    assert.equal(f.cloud.masterApplied.uom, 1);
    const sent = f.cloud.masterRequests.filter((request) => request.body?.operationId === saved.operationId);
    assert.equal(sent.length, 2); assert.deepEqual(sent[0].body, sent[1].body);
  } finally { await app.logout(); f.cleanup(); }
});

for (const entityType of ["category", "organizationMaster"]) for (const pausedStatus of [404, 503, 403]) {
  test(`${entityType} lost acknowledgement remains pending through ${pausedStatus}, restart and reauthorization, then replays the same receipt`, async () => {
    const f = fixture({ organizations: true }); let app = f.app();
    const pending = () => entityType === "category" ? app.active.store.pendingCommands() : app.active.store.pendingMasterCommands(entityType);
    const applied = () => entityType === "category" ? f.cloud.applied : f.cloud.masterApplied.organizationMaster;
    try {
      let login = await app.login(credentials);
      await app.handle("POST", entityType === "category" ? "/master-categories" : "/organizations", login.accessToken,
        entityType === "category" ? category("Retain immutable receipt") : { shortName: "RECEIPT", fullName: "Retain immutable receipt" });
      const original = pending();
      if (entityType === "category") f.cloud.loseReply = true; else f.cloud.loseMasterReply = true;
      await app.sync(); assert.equal(applied(), 1); assert.deepEqual(pending(), original);
      if (pausedStatus === 403) f.cloud.denyCommands = true; else f.cloud.pauseStatus = pausedStatus;
      await app.sync();
      assert.deepEqual(pending(), original, "an endpoint or authorization denial cannot prove a prior commit did not happen");
      assert.equal(app.status().storage.rejectedCount, 0); assert.equal(applied(), 1);
      await app.logout(); app = f.app();
      if (pausedStatus === 403) {
        f.cloud.offline = true;
        await assert.rejects(app.login(credentials), { code: "AUTHORIZATION_REVALIDATION_REQUIRED" });
        f.cloud.offline = false; f.cloud.denyCommands = false;
      }
      login = await app.login(credentials);
      assert.deepEqual(pending(), original, "cached valid offline login during a temporary pause retains the command");
      f.cloud.pauseStatus = undefined;
      await app.sync();
      assert.equal(app.status().lastSyncError, null); assert.equal(app.status().storage.pendingCount, 0);
      assert.equal(app.status().storage.rejectedCount, 0); assert.equal(applied(), 1, "receipt replay does not create a second effect");
      const rows = (await app.handle("GET", entityType === "category" ? "/master-categories" : "/organizations", login.accessToken)).data;
      assert.equal(rows.length, 1); assert.equal(rows[0].syncStatus, "SYNCED");
    } finally { await app.logout(); f.cleanup(); }
  });
}

test("a paused cloud cannot activate a fresh profile or revive an expired saved grant", async () => {
  const f = fixture(); const app = f.app();
  try {
    f.cloud.pauseStatus = 503;
    await assert.rejects(app.login(credentials));
    assert.equal(app.active, null);
    assert.equal(fs.existsSync(vaultLocation(f.config.rootDirectory, f.config.cloudIssuer, credentials.email)), false);
    f.cloud.pauseStatus = undefined; await app.login(credentials); await app.logout();
    f.cloud.time += 3600_001; f.cloud.pauseStatus = 503;
    await assert.rejects(app.login(credentials), /expired/);
    assert.equal(app.active, null);
  } finally { await app.logout(); f.cleanup(); }
});

test("temporary sync failure cannot restore permissions already withdrawn in the online login response", async () => {
  const f = fixture(); let app = f.app();
  try {
    const login = await app.login(credentials);
    await app.handle("POST", "/master-categories", login.accessToken, category("Keep work after permission withdrawal"));
    await app.logout();
    f.user.permissions = []; f.cloud.pauseStatus = 503;
    await assert.rejects(app.login(credentials), { code: "AUTHORIZATION_REVALIDATION_REQUIRED" });
    assert.equal(app.active, null);
    f.cloud.offline = true; app = f.app();
    await assert.rejects(app.login(credentials), { code: "AUTHORIZATION_REVALIDATION_REQUIRED" });
    f.cloud.offline = false; f.cloud.pauseStatus = undefined; f.user.permissions = [...permissionList];
    await app.login(credentials);
    assert.equal(app.status().storage.pendingCount, 1);
  } finally { await app.logout(); f.cleanup(); }
});

test("master conflict preserves local and cloud values and revision uses a new operation against the current version", async () => {
  const f = fixture({ masters: true }); const app = f.app();
  try {
    const login = await app.login(credentials);
    const saved = (await app.handle("POST", "/payment-terms", login.accessToken, { name: "Net 15", days: 15, description: "Original" })).data;
    await app.sync();
    const local = (await app.handle("PATCH", `/payment-terms/${saved.id}`, login.accessToken, { name: "Local 20", days: 20 })).data;
    const cloudRecord = f.cloud.masterRecords.paymentTerm.get(saved.id);
    f.cloud.masterRecords.paymentTerm.set(saved.id, { ...cloudRecord, name: "Cloud 25", days: 25, version: 2 });
    f.cloud.masterApplied.paymentTerm += 1;
    await app.sync();
    const rejected = (await app.handle("GET", "/payment-terms", login.accessToken)).data[0];
    assert.equal(rejected.syncStatus, "REJECTED"); assert.equal(rejected.name, "Local 20");
    assert.equal(rejected.cloudRecord.name, "Cloud 25"); assert.equal(rejected.cloudRecord.version, 2);
    assert.equal(app.status().storage.rejectedCount, 1);
    const revised = (await app.handle("PATCH", `/payment-terms/${saved.id}`, login.accessToken, { name: "Reviewed 30", days: 30 })).data;
    assert.notEqual(revised.operationId, local.operationId);
    assert.equal(app.active.store.pendingMasterCommands("paymentTerm")[0].expectedVersion, 2);
    await app.sync();
    assert.equal(app.status().storage.rejectedCount, 0); assert.equal(f.cloud.masterRecords.paymentTerm.get(saved.id).version, 3);
  } finally { await app.logout(); f.cleanup(); }
});

test("old category-only grants keep unsupported master routes online without requesting new protocol endpoints", async () => {
  const f = fixture(); const app = f.app();
  try {
    const login = await app.login(credentials);
    assert.deepEqual(app.status().offlineModules, ["master-categories"]);
    const result = await app.handle("GET", "/uoms", login.accessToken);
    assert.equal((await result.response.json()).data.untouchedCloudRoute, "uoms");
    await app.sync(); assert.equal(f.cloud.masterRequests.length, 0);
    f.cloud.offline = true;
    await assert.rejects(app.handle("POST", "/payment-terms", login.accessToken, { name: "Not queued" }), { code: "CLOUD_UNAVAILABLE" });
    assert.equal(app.status().storage.pendingCount, 0);
  } finally { await app.logout(); f.cleanup(); }
});

test("read-only master grants permit offline queries but refuse writes without persisting commands", async () => {
  const f = fixture({ masters: true }); const app = f.app();
  try {
    f.user.permissions = ["masters.read"];
    f.cloud.capabilities = ["uom.read", "paymentTerm.read"];
    const login = await app.login(credentials); f.cloud.offline = true;
    assert.deepEqual((await app.handle("GET", "/uoms", login.accessToken)).data, []);
    await assert.rejects(app.handle("POST", "/uoms", login.accessToken, { code: "X", name: "Forbidden" }), { status: 403 });
    await assert.rejects(app.handle("POST", "/payment-terms", login.accessToken, { name: "Forbidden" }), { status: 403 });
    assert.equal(app.status().storage.pendingCount, 0);
  } finally { await app.logout(); f.cleanup(); }
});

test("wrong-module acknowledgements cannot resolve pending work or advance its stream", async () => {
  const f = fixture({ masters: true }); let corrupt = true;
  const app = new LocalApplication(f.config, { now: () => f.cloud.time, fetchImpl: async (url, options) => {
    const response = await f.fetchImpl(url, options);
    if (!corrupt || !url.endsWith("/desktop-sync/masters/commands")) return response;
    const envelope = await response.json(); envelope.data.entityType = "paymentTerm";
    return Response.json(envelope);
  } });
  try {
    const login = await app.login(credentials);
    await app.handle("POST", "/uoms", login.accessToken, { code: "M", name: "Metre" });
    const cursor = app.active.store.readMasterCursor("uom");
    await app.sync();
    assert.equal(app.status().storage.pendingCount, 1); assert.equal(app.active.store.readMasterCursor("uom"), cursor);
    assert.match(app.status().lastSyncError, /acknowledgement did not match/);
    corrupt = false; await app.sync();
    assert.equal(app.status().storage.pendingCount, 0); assert.equal(f.cloud.masterApplied.uom, 1);
  } finally { await app.logout(); f.cleanup(); }
});

test("grant renewal bootstraps newly enabled master streams before allowing offline saves", async () => {
  const f = fixture(); const app = f.app();
  try {
    const login = await app.login(credentials);
    f.user.permissions.push("uom.manage");
    f.cloud.capabilities.push("uom.read", "uom.create", "uom.update");
    f.cloud.time += 50 * 60_000;
    await app.sync();
    assert.equal(app.status().lastSyncError, null);
    assert.deepEqual(app.status().offlineModules, ["master-categories", "uoms"]);
    f.cloud.offline = true;
    assert.equal((await app.handle("POST", "/uoms", login.accessToken, { code: "L", name: "Litre" })).data.syncStatus, "PENDING");
  } finally { await app.logout(); f.cleanup(); }
});

test("master resnapshot retains a rejected local edit and its immutable history", async () => {
  const f = fixture({ masters: true }); let requireSnapshot = false;
  const app = new LocalApplication(f.config, { now: () => f.cloud.time, fetchImpl: (url, options) => {
    if (requireSnapshot && url.includes("/desktop-sync/masters/changes") && new URL(url).searchParams.get("entityType") === "uom") {
      requireSnapshot = false;
      return Response.json({ success: false, message: "RESNAPSHOT_REQUIRED: history unavailable" }, { status: 409 });
    }
    return f.fetchImpl(url, options);
  } });
  try {
    const login = await app.login(credentials);
    const record = (await app.handle("POST", "/uoms", login.accessToken, { code: "BOX", name: "Box" })).data;
    await app.sync();
    const draft = (await app.handle("PATCH", `/uoms/${record.id}`, login.accessToken, { code: "BOX", name: "Local Box" })).data;
    app.active.store.rejectMasterCommand(draft.operationId, "CONFLICT", "Review required");
    const prior = f.cloud.masterRecords.uom.get(record.id);
    f.cloud.masterRecords.uom.set(record.id, { ...prior, name: "Cloud Box", version: 2 });
    f.cloud.masterApplied.uom += 1;
    requireSnapshot = true; await app.sync();
    assert.equal(app.status().lastSyncError, null);
    const row = (await app.handle("GET", "/uoms", login.accessToken)).data[0];
    assert.equal(row.name, "Local Box"); assert.equal(row.cloudRecord.name, "Cloud Box");
    assert.equal(row.operationId, draft.operationId); assert.equal(row.syncStatus, "REJECTED");
    assert.equal(app.status().storage.rejectedCount, 1);
  } finally { await app.logout(); f.cleanup(); }
});

test("malformed master bootstrap preserves the existing vault and pending profile", async () => {
  const f = fixture({ masters: true }); let corrupt = false;
  const app = new LocalApplication(f.config, { now: () => f.cloud.time, fetchImpl: async (url, options) => {
    const result = await f.fetchImpl(url, options);
    if (!corrupt || !url.includes("/desktop-sync/masters/snapshot")) return result;
    return Response.json({ success: true, data: { entityType: "wrong", schemaVersion: 1, records: [], cursor: "wrong:0" } });
  } });
  try {
    const login = await app.login(credentials);
    const record = (await app.handle("POST", "/payment-terms", login.accessToken, { name: "Keep this term", days: 7 })).data;
    await app.logout();
    const file = vaultLocation(f.config.rootDirectory, f.config.cloudIssuer, credentials.email), before = fs.readFileSync(file);
    corrupt = true;
    await assert.rejects(app.login(credentials), { code: "SYNC_RESPONSE_MISMATCH" });
    assert.deepEqual(fs.readFileSync(file), before); assert.equal(app.active, null);
    f.cloud.offline = true;
    const offline = await app.login(credentials);
    assert.equal((await app.handle("GET", "/payment-terms", offline.accessToken)).data[0].operationId, record.operationId);
  } finally { await app.logout(); f.cleanup(); }
});

test("legacy category backups still restore, but cannot suppress the first verified master-data backup", async () => {
  const f = fixture({ masters: true }); const app = f.app(); let restored;
  try {
    await app.login(credentials);
    const status = app.active.store.status(), profileJson = JSON.stringify(status.profile);
    const digest = (value) => createHash("sha256").update(value).digest("hex");
    const directory = path.join(path.dirname(status.databasePath), "backups", `backup-${f.cloud.time}-${randomUUID()}`);
    fs.mkdirSync(directory, { recursive: true });
    const databaseFile = path.join(directory, "desktop.sqlite");
    const legacySql = fs.readFileSync(new URL("../../../../packages/desktop-storage/test/fixtures/schema-v1.sql", import.meta.url), "utf8").replaceAll("\r\n", "\n");
    assert.equal(digest(legacySql), "f5ebe73c3c0a8eed3ba38b265321c6eb104883b0a94a0e8720aff85966f2bd4f");
    const legacy = new DatabaseSync(databaseFile);
    try {
      legacy.exec("CREATE TABLE local_migrations(version INTEGER PRIMARY KEY,checksum TEXT NOT NULL,applied_at TEXT NOT NULL)");
      legacy.exec(legacySql);
      legacy.prepare("INSERT INTO local_migrations VALUES(1,?,?)").run(digest(legacySql), new Date(f.cloud.time).toISOString());
      legacy.prepare("INSERT INTO store_metadata VALUES(1,?,?,NULL,?)").run(profileJson, digest(profileJson), new Date(f.cloud.time).toISOString());
      legacy.exec("PRAGMA application_id=1113211987; PRAGMA user_version=1");
    } finally { legacy.close(); }
    const vault = vaultLocation(f.config.rootDirectory, f.config.cloudIssuer, credentials.email), credentialsBytes = fs.readFileSync(vault), databaseBytes = fs.readFileSync(databaseFile);
    fs.writeFileSync(path.join(directory, "credentials.vault"), credentialsBytes, { flag: "wx" });
    const manifest = { formatVersion: 1, scope: "master-categories", createdAt: new Date(f.cloud.time).toISOString(), profile: status.profile,
      vaultName: path.basename(vault), database: { size: databaseBytes.length, sha256: digest(databaseBytes) }, credentials: { size: credentialsBytes.length, sha256: digest(credentialsBytes) } };
    fs.writeFileSync(path.join(directory, "manifest.json"), JSON.stringify(manifest), { flag: "wx" });
    assert.equal((await verifyProfileBackup(directory)).storage.schemaVersion, 1);
    assert.equal(await latestProfileBackup(app.active.store), null);
    const targetRoot = path.join(f.config.rootDirectory, "legacy-recovery");
    const recovery = await restoreProfileBackup({ backupDirectory: directory, targetRoot, password: credentials.password, config: f.config });
    assert.equal(recovery.schemaVersion, 1);
    restored = new DesktopStore({ rootDirectory: targetRoot, profile: status.profile });
    assert.equal(restored.status().schemaVersion, 4);
    await app.backup();
    const currentDirectory = path.join(path.dirname(status.databasePath), "backups", app.active.lastBackup.id);
    const current = await verifyProfileBackup(currentDirectory);
    assert.equal(current.manifest.scope, "master-data"); assert.equal(current.manifest.schemaVersion, 4);
    assert.equal(current.storage.schemaVersion, 4);
    const altered = { ...current.manifest, schemaVersion: current.manifest.schemaVersion + 1 };
    fs.writeFileSync(path.join(currentDirectory, "manifest.json"), JSON.stringify(altered));
    await assert.rejects(verifyProfileBackup(currentDirectory), { code: "BACKUP_INVALID" });
    assert.ok(fs.existsSync(status.databasePath), "the working database remains untouched");
  } finally { restored?.close(); await app.logout(); f.cleanup(); }
});

test("partial master pull changes the projection revision even when a later stream fails", async () => {
  const f = fixture({ masters: true }); let failTerms = false;
  const app = new LocalApplication(f.config, { now: () => f.cloud.time, fetchImpl: (url, options) => {
    if (failTerms && url.includes("/desktop-sync/masters/changes") && new URL(url).searchParams.get("entityType") === "paymentTerm") {
      return Response.json({ success: false, message: "Term stream temporarily unavailable" }, { status: 503 });
    }
    return f.fetchImpl(url, options);
  } });
  try {
    const login = await app.login(credentials), before = app.status().storage.projectionRevision;
    const id = randomUUID(), timestamp = new Date(f.cloud.time).toISOString();
    f.cloud.masterRecords.uom.set(id, { id, code: "SET", name: "Set", symbol: null, isActive: true, version: 1, createdAt: timestamp, updatedAt: timestamp });
    f.cloud.masterApplied.uom += 1;
    failTerms = true; await app.sync();
    const status = app.status();
    assert.equal(status.lastSyncedAt, null); assert.match(status.lastSyncError, /temporarily unavailable/);
    assert.equal(status.storage.pendingCount, 0); assert.equal(status.storage.rejectedCount, 0);
    assert.notEqual(status.storage.projectionRevision, before);
    assert.equal((await app.handle("GET", "/uoms", login.accessToken)).data[0].id, id);
  } finally { await app.logout(); f.cleanup(); }
});

test("online grant renewal extends offline access and persists it across restart", async () => {
  const f = fixture(); let app = f.app();
  try {
    const login = await app.login(credentials), originalExpiry = app.active.data.grant.payload.expiresAt;
    f.cloud.time += 50 * 60_000;
    await app.sync();
    assert.equal(app.status().lastSyncError, null);
    assert.ok(Date.parse(app.active.data.grant.payload.expiresAt) > Date.parse(originalExpiry));
    f.cloud.time += 20 * 60_000; f.cloud.offline = true;
    await app.handle("POST", "/master-categories", login.accessToken, category("After original expiry"));
    await app.logout(); app = f.app();
    await app.login(credentials);
    assert.equal(app.status().storage.pendingCount, 1);
  } finally { await app.logout(); f.cleanup(); }
});

test("renewal outage retains the unexpired grant; explicit revocation blocks access without losing work", async () => {
  const f = fixture(); let denyRenewal = false;
  const app = new LocalApplication(f.config, { now: () => f.cloud.time, fetchImpl: (url, options) =>
    denyRenewal && url.endsWith("/desktop-sync/register") ? Response.json({ success: false, message: "Device revoked" }, { status: 403 }) : f.fetchImpl(url, options) });
  try {
    const login = await app.login(credentials);
    await app.handle("POST", "/master-categories", login.accessToken, category("Retain this"));
    f.cloud.time += 50 * 60_000; f.cloud.offline = true;
    await app.sync();
    assert.equal((await app.handle("GET", "/master-categories", login.accessToken)).data.length, 1);
    f.cloud.offline = false; denyRenewal = true;
    await app.sync();
    await assert.rejects(app.handle("GET", "/master-categories", login.accessToken), { code: "AUTHORIZATION_REVALIDATION_REQUIRED" });
    assert.equal(app.active.store.status().pendingCount, 1);
    await app.logout(); f.cloud.offline = true; denyRenewal = false;
    await assert.rejects(app.login(credentials), { code: "AUTHORIZATION_REVALIDATION_REQUIRED" });
  } finally { await app.logout(); f.cleanup(); }
});

test("password recovery rekeys only after online verification and retains immutable local operations", async () => {
  const f = fixture(); let app = f.app();
  try {
    const login = await app.login(credentials);
    const saved = (await app.handle("POST", "/master-categories", login.accessToken, category("Saved with old password"))).data;
    const profile = app.active.store.status().profile;
    await app.logout(); f.cloud.password = "changed-password";
    const file = vaultLocation(f.config.rootDirectory, f.config.cloudIssuer, credentials.email), priorVault = fs.readFileSync(file);
    await assert.rejects(app.login({ ...credentials, password: f.cloud.password }), { code: "PROFILE_RECOVERY_REQUIRED" });
    assert.deepEqual(fs.readFileSync(file), priorVault);
    await assert.rejects(app.login({ ...credentials, password: f.cloud.password, previousPassword: "wrong-old-password" }), { code: "OFFLINE_UNLOCK_FAILED" });
    assert.deepEqual(fs.readFileSync(file), priorVault);
    f.cloud.offline = true;
    await assert.rejects(app.login({ ...credentials, password: f.cloud.password, previousPassword: credentials.password }), { code: "CLOUD_UNAVAILABLE" });
    assert.deepEqual(fs.readFileSync(file), priorVault);
    f.cloud.offline = false;
    await app.login({ ...credentials, password: f.cloud.password, previousPassword: credentials.password });
    assert.deepEqual(app.active.store.status().profile, profile);
    assert.equal(app.active.store.pendingCommands()[0].operationId, saved.operationId);
    assert.ok(app.status().backup.lastVerifiedAt);
    assert.throws(() => unlockVault(file, credentials.password), { code: "OFFLINE_UNLOCK_FAILED" });
    await app.logout(); f.cloud.offline = true; app = f.app();
    const restarted = await app.login({ ...credentials, password: f.cloud.password });
    assert.equal((await app.handle("GET", "/master-categories", restarted.accessToken)).data[0].id, saved.id);
  } finally { await app.logout(); f.cleanup(); }
});

test("same-email company change cannot overwrite the original vault or rebind pending work", async () => {
  const f = fixture(); const app = f.app();
  try {
    const login = await app.login(credentials);
    await app.handle("POST", "/master-categories", login.accessToken, category("Company A"));
    await app.logout();
    const file = vaultLocation(f.config.rootDirectory, f.config.cloudIssuer, credentials.email), priorVault = fs.readFileSync(file);
    f.user.organizationId = "org-b";
    await assert.rejects(app.login(credentials), { code: "PROFILE_IDENTITY_CHANGED" });
    assert.deepEqual(fs.readFileSync(file), priorVault);
    f.user.organizationId = "org-a"; f.cloud.offline = true;
    await app.login(credentials);
    assert.equal(app.status().storage.pendingCount, 1);
  } finally { await app.logout(); f.cleanup(); }
});

test("failed required rekey backup preserves the old password and original queued command", async (context) => {
  const f = fixture(); const app = f.app();
  try {
    const login = await app.login(credentials);
    const command = (await app.handle("POST", "/master-categories", login.accessToken, category("Keep after full disk"))).data;
    await app.logout(); f.cloud.password = "changed-password";
    const file = vaultLocation(f.config.rootDirectory, f.config.cloudIssuer, credentials.email), before = fs.readFileSync(file);
    context.mock.method(fs, "statfsSync", () => { throw Object.assign(new Error("Disk unavailable"), { code: "ENOSPC" }); });
    await assert.rejects(app.login({ ...credentials, password: f.cloud.password, previousPassword: credentials.password }), { code: "ENOSPC" });
    assert.deepEqual(fs.readFileSync(file), before);
    context.mock.restoreAll();
    f.cloud.offline = true;
    await app.login(credentials);
    assert.equal(app.active.store.pendingCommands()[0].operationId, command.operationId);
  } finally { context.mock.restoreAll(); await app.logout(); f.cleanup(); }
});

test("a validly signed renewal for another company cannot replace the active grant", async () => {
  const f = fixture(); const app = f.app();
  try {
    const login = await app.login(credentials), original = structuredClone(app.active.data.grant);
    f.cloud.time += 50 * 60_000;
    f.user.organizationId = "org-other";
    await app.sync();
    assert.match(app.status().lastSyncError, /did not match/);
    assert.deepEqual(app.active.data.grant, original);
    await app.handle("POST", "/master-categories", login.accessToken, category("Still belongs to original company"));
    assert.equal(app.active.store.status().profile.organizationId, "org-a");
  } finally { await app.logout(); f.cleanup(); }
});

test("cancelling sign-in during the required rekey backup preserves original credentials and work", async (context) => {
  const f = fixture(); const app = f.app(); let release;
  try {
    const login = await app.login(credentials);
    const saved = (await app.handle("POST", "/master-categories", login.accessToken, category("Cancelled recovery"))).data;
    await app.logout(); f.cloud.password = "changed-password";
    const file = vaultLocation(f.config.rootDirectory, f.config.cloudIssuer, credentials.email), before = fs.readFileSync(file);
    const originalBackup = DesktopStore.prototype.backup;
    let entered; const started = new Promise((resolve) => { entered = resolve; });
    const gate = new Promise((resolve) => { release = resolve; });
    context.mock.method(DesktopStore.prototype, "backup", async function (destination) { entered(); await gate; return originalBackup.call(this, destination); });
    const recovery = app.login({ ...credentials, password: f.cloud.password, previousPassword: credentials.password });
    const rejected = assert.rejects(recovery, { code: "LOGIN_CANCELLED" });
    await started; await app.logout(); release(); await rejected;
    assert.deepEqual(fs.readFileSync(file), before);
    assert.equal(app.active, null);
    context.mock.restoreAll(); f.cloud.offline = true;
    await app.login(credentials);
    assert.equal(app.active.store.pendingCommands()[0].operationId, saved.operationId);
  } finally { release?.(); context.mock.restoreAll(); await app.logout(); f.cleanup(); }
});

test("failed renewal persistence restores the prior signed grant in memory and on disk", async (context) => {
  const f = fixture(); const app = f.app();
  try {
    await app.login(credentials);
    const before = structuredClone(app.active.data.grant);
    const file = vaultLocation(f.config.rootDirectory, f.config.cloudIssuer, credentials.email), bytes = fs.readFileSync(file);
    f.cloud.time += 50 * 60_000;
    context.mock.method(fs, "renameSync", () => { throw Object.assign(new Error("Write failed"), { code: "EIO" }); });
    await app.sync();
    assert.deepEqual(app.active.data.grant, before);
    assert.deepEqual(fs.readFileSync(file), bytes);
  } finally { context.mock.restoreAll(); await app.logout(); f.cleanup(); }
});

test("restoring an expired backup cannot bypass the offline grant expiry", async () => {
  const f = fixture(); const app = f.app(); let recovered;
  try {
    await app.login(credentials); await app.backup();
    const directory = path.join(path.dirname(app.active.store.status().databasePath), "backups", app.active.lastBackup.id);
    const targetRoot = path.join(f.config.rootDirectory, "expired-recovery");
    f.cloud.time += 2 * 3600_000;
    await restoreProfileBackup({ backupDirectory: directory, targetRoot, password: credentials.password, config: f.config });
    f.cloud.offline = true;
    recovered = new LocalApplication({ ...f.config, rootDirectory: targetRoot }, { fetchImpl: f.fetchImpl, now: () => f.cloud.time });
    await assert.rejects(recovered.login(credentials), { code: "OFFLINE_GRANT_EXPIRED" });
    assert.equal(recovered.active, null);
    assert.ok(fs.existsSync(path.join(targetRoot, "recovery.json")));
  } finally { await recovered?.logout(); await app.logout(); f.cleanup(); }
});

test("verified backup restores pending and rejected work into a fresh root without replacing newer data", async () => {
  const f = fixture(); let app = f.app(), restored;
  try {
    const login = await app.login(credentials);
    await app.handle("POST", "/master-categories", login.accessToken, category("Waiting"));
    const rejected = (await app.handle("POST", "/master-categories", login.accessToken, category("Review me"))).data;
    app.active.store.rejectCommand(rejected.operationId, "CONFLICT", "Another device changed this");
    const commands = app.active.store.pendingCommands();
    await app.backup();
    const first = app.active.lastBackup;
    await app.backup();
    assert.equal(app.active.lastBackup.id, first.id, "automatic backup is at most daily");
    const directory = path.join(path.dirname(app.active.store.status().databasePath), "backups", first.id);
    const verified = await verifyProfileBackup(directory);
    assert.equal(verified.storage.pendingCount, 1); assert.equal(verified.storage.rejectedCount, 1);
    await app.handle("POST", "/master-categories", login.accessToken, category("Newer work stays here"));
    const targetRoot = path.join(f.config.rootDirectory, "recovered-test");
    await assert.rejects(restoreProfileBackup({ backupDirectory: directory, targetRoot: f.config.rootDirectory, password: credentials.password, config: f.config }), { code: "RESTORE_DESTINATION_EXISTS" });
    await assert.rejects(restoreProfileBackup({ backupDirectory: directory, targetRoot, password: "wrong", config: f.config }), { code: "OFFLINE_UNLOCK_FAILED" });
    assert.equal(fs.existsSync(targetRoot), false);
    await restoreProfileBackup({ backupDirectory: directory, targetRoot, password: credentials.password, config: f.config });
    f.cloud.offline = true;
    restored = new LocalApplication({ ...f.config, rootDirectory: targetRoot }, { fetchImpl: f.fetchImpl, now: () => f.cloud.time });
    await restored.login(credentials);
    assert.deepEqual(restored.active.store.pendingCommands(), commands);
    assert.equal(restored.active.store.rejectedCommands()[0].operationId, rejected.operationId);
    assert.equal(app.active.store.status().pendingCount, 2, "the active database was never rolled back");
    const corruption = path.join(directory, "desktop.sqlite");
    const descriptor = fs.openSync(corruption, "r+");
    try { fs.writeSync(descriptor, Buffer.from("BROKEN"), 0, 6, 0); } finally { fs.closeSync(descriptor); }
    const invalidDestination = path.join(f.config.rootDirectory, "must-not-exist");
    await assert.rejects(restoreProfileBackup({ backupDirectory: directory, targetRoot: invalidDestination, password: credentials.password, config: f.config }), { code: "BACKUP_INVALID" });
    assert.equal(fs.existsSync(invalidDestination), false);
  } finally { await restored?.logout(); await app.logout(); f.cleanup(); }
});

test("logout drains a running backup and backup failure never turns a saved command into an error", async () => {
  const f = fixture(); const app = f.app(); let release;
  try {
    const login = await app.login(credentials);
    await app.handle("POST", "/master-categories", login.accessToken, category("Durable"));
    const store = app.active.store, realBackup = store.backup.bind(store);
    let entered; const started = new Promise((resolve) => { entered = resolve; });
    const gate = new Promise((resolve) => { release = resolve; });
    store.backup = async (destination) => { entered(); await gate; return realBackup(destination); };
    const backup = app.backup({ force: true }); await started;
    let closed = false; const logout = app.logout().then(() => { closed = true; });
    await new Promise((resolve) => setImmediate(resolve)); assert.equal(closed, false);
    release(); await backup; await logout;
    await app.login(credentials);
    app.active.store.backup = async () => { throw Object.assign(new Error("Disk full"), { code: "ENOSPC" }); };
    await app.backup({ force: true });
    assert.match(app.status().backup.lastError, /preserved/);
    assert.equal(app.active.store.pendingCommands().length, 1);
  } finally { release?.(); await app.logout(); f.cleanup(); }
});

test("damaged backup files are not reported as verified or allowed to suppress the next daily backup", async () => {
  const f = fixture(); let app = f.app();
  try {
    await app.login(credentials); await app.backup();
    const previous = app.active.lastBackup;
    const directory = path.join(path.dirname(app.active.store.status().databasePath), "backups", previous.id);
    fs.writeFileSync(path.join(directory, "credentials.vault"), "damaged backup");
    await app.logout(); app = f.app(); await app.login(credentials);
    assert.equal(app.status().backup.lastVerifiedAt, null);
    await app.backup();
    assert.notEqual(app.active.lastBackup.id, previous.id);
    assert.equal(fs.readFileSync(path.join(directory, "credentials.vault"), "utf8"), "damaged backup", "damaged evidence is retained");
  } finally { await app.logout(); f.cleanup(); }
});

test("a backup with uncheckpointed WAL work is rejected instead of copying only its main file", async () => {
  const f = fixture(); const app = f.app(); let connection;
  try {
    await app.login(credentials); await app.backup();
    const directory = path.join(path.dirname(app.active.store.status().databasePath), "backups", app.active.lastBackup.id);
    const database = path.join(directory, "desktop.sqlite");
    connection = new DatabaseSync(database);
    connection.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; UPDATE store_metadata SET cursor='uncheckpointed-change' WHERE singleton=1;");
    assert.ok(fs.statSync(`${database}-wal`).size > 0);
    const targetRoot = path.join(f.config.rootDirectory, "must-not-restore-wal");
    await assert.rejects(restoreProfileBackup({ backupDirectory: directory, targetRoot, password: credentials.password, config: f.config }), { code: "BACKUP_INVALID" });
    assert.equal(fs.existsSync(targetRoot), false);
    assert.equal(connection.prepare("SELECT cursor FROM store_metadata").get().cursor, "uncheckpointed-change");
  } finally { connection?.close(); await app.logout(); f.cleanup(); }
});

test("online enrollment, offline restart/unlock and preserved local category/outbox", async () => {
  const f = fixture();
  let app = f.app();
  try {
    const login = await app.login(credentials);
    assert.notEqual(login.accessToken, "cloud-access-secret");
    f.cloud.offline = true;
    const saved = await app.handle("POST", "/master-categories", login.accessToken, category("Cement"));
    assert.equal(saved.data.syncStatus, "PENDING");
    await app.logout();
    app = f.app();
    const reopened = await app.login(credentials);
    const list = await app.handle("GET", "/master-categories", reopened.accessToken);
    assert.equal(list.data.length, 1);
    assert.equal(list.data[0].name, "Cement");
    assert.equal(app.status().storage.pendingCount, 1);
    const vault = fs.readFileSync(vaultLocation(f.config.rootDirectory, f.config.cloudIssuer, credentials.email), "utf8");
    assert.equal(vault.includes("cloud-refresh-secret"), false);
    assert.equal(vault.includes("test-password"), false);
  } finally { await app.logout(); f.cleanup(); }
});

test("lost acknowledgement retries the same operation without another cloud effect", async () => {
  const f = fixture(); const app = f.app();
  try {
    const login = await app.login(credentials);
    await app.handle("POST", "/master-categories", login.accessToken, category("Steel"));
    f.cloud.loseReply = true;
    await app.sync();
    assert.equal(f.cloud.applied, 1);
    assert.equal(app.status().storage.pendingCount, 1);
    await app.sync();
    assert.equal(f.cloud.applied, 1);
    assert.equal(app.status().storage.pendingCount, 0);
    assert.equal((await app.handle("GET", "/master-categories", login.accessToken)).data[0].syncStatus, "SYNCED");
  } finally { await app.logout(); f.cleanup(); }
});

test("version conflict preserves the user's pending values for review", async () => {
  const f = fixture(); const app = f.app();
  try {
    const login = await app.login(credentials);
    const saved = await app.handle("POST", "/master-categories", login.accessToken, category("Original"));
    await app.sync();
    await app.handle("PATCH", `/master-categories/${saved.data.id}`, login.accessToken, category("My edit"));
    const current = f.cloud.categories.get(saved.data.id);
    f.cloud.categories.set(saved.data.id, { ...current, name: "Other PC", version: 2 });
    await app.sync();
    const list = await app.handle("GET", "/master-categories", login.accessToken);
    assert.equal(list.data[0].name, "My edit");
    assert.equal(list.data[0].syncStatus, "REJECTED");
    assert.equal(app.status().storage.rejectedCount, 1);
  } finally { await app.logout(); f.cleanup(); }
});

test("wrong password, cloud denial and expired/tampered grants cannot unlock an old profile", async () => {
  const f = fixture(); const app = f.app();
  try {
    await app.login(credentials);
    const grant = app.active.data.grant;
    const invalid = structuredClone(grant); invalid.payload.organizationId = "another-org";
    assert.throws(() => verifyOfflineGrant(invalid, { key: f.publicKey, issuer: f.config.cloudIssuer, deviceId: grant.payload.deviceId, now: f.cloud.time }));
    await app.logout();
    f.cloud.offline = true;
    await assert.rejects(app.login({ ...credentials, password: "wrong" }), /unlock/);
    f.cloud.offline = false; f.cloud.denyLogin = true;
    await assert.rejects(app.login(credentials), /Invalid login/);
    assert.equal(app.active, null);
    f.cloud.offline = true; f.cloud.time += 3600_001;
    await assert.rejects(app.login(credentials), /expired/);
  } finally { await app.logout(); f.cleanup(); }
});

test("unsupported offline module fails visibly; it is not silently queued", async () => {
  const f = fixture(); const app = f.app();
  try {
    const login = await app.login(credentials);
    f.cloud.offline = true;
    await assert.rejects(app.handle("POST", "/receipts", login.accessToken, { amount: 100 }), /unavailable/);
    assert.equal(app.status().storage.pendingCount, 0);
    await app.logout();
    await assert.rejects(app.handle("GET", "/master-categories", login.accessToken), /sign in/);
  } finally { await app.logout(); f.cleanup(); }
});

test("loopback service checks capability and exact renderer origin before serving requests", async () => {
  const f = fixture(); let server;
  try {
    server = await startLocalServer(f.config, { fetchImpl: f.fetchImpl, now: () => f.cloud.time });
    const url = `http://127.0.0.1:${server.port}`;
    assert.equal((await fetch(`${url}/__desktop/health`)).status, 403);
    assert.equal((await fetch(`${url}/__desktop/health`, { headers: { "X-Bizovix-Local-Capability": "é".repeat(64) } })).status, 403);
    const headers = { "X-Bizovix-Local-Capability": f.config.capability };
    const health = await fetch(`${url}/__desktop/health`, { headers });
    assert.equal((await health.json()).instanceId, f.config.instanceId);
    assert.equal((await fetch(`${url}/__desktop/health`, { headers: { ...headers, Origin: "https://attacker.invalid" } })).status, 403);
    server.allowOrigin("http://127.0.0.1:3010");
    assert.equal((await fetch(`${url}/api/v1/auth/login`, { method: "OPTIONS", headers: { Origin: "http://127.0.0.1:3010" } })).status, 204);
    const login = await fetch(`${url}/api/v1/auth/login`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(credentials) });
    assert.equal(login.status, 200);
    const data = (await login.json()).data;
    const me = await fetch(`${url}/api/v1/auth/me`, { headers: { ...headers, Authorization: `Bearer ${data.accessToken}` } });
    assert.equal((await me.json()).data.organizationId, f.user.organizationId);
  } finally { await server?.close(); f.cleanup(); }
});

test("native backup export requires both private capabilities and publishes a verified external bundle", async () => {
  const f = fixture(); let server;
  const destinationDirectory = path.join(os.tmpdir(), `bizovix-native-export-${randomUUID()}`);
  try {
    fs.mkdirSync(destinationDirectory);
    const config = { ...f.config, controlCapability: "native-control-" + "x".repeat(48) };
    server = await startLocalServer(config, { fetchImpl: f.fetchImpl, now: () => f.cloud.time });
    const url = `http://127.0.0.1:${server.port}`;
    const login = await server.application.login(credentials);
    await server.application.handle("POST", "/master-categories", login.accessToken, category("Export pending work"));
    const headers = { "X-Bizovix-Local-Capability": config.capability, Authorization: `Bearer ${login.accessToken}`, "Content-Type": "application/json" };
    const body = JSON.stringify({ destinationDirectory });
    assert.equal((await fetch(`${url}/__desktop/backup-export`, { method: "POST", headers, body })).status, 403);
    assert.equal((await fetch(`${url}/__desktop/backup-export`, { method: "POST", headers: { ...headers, "X-Bizovix-Control-Capability": "wrong" }, body })).status, 403);
    server.allowOrigin("http://127.0.0.1:3010");
    assert.equal((await fetch(`${url}/__desktop/backup-export`, { method: "POST", headers: { ...headers, Origin: "http://127.0.0.1:3010", "X-Bizovix-Control-Capability": config.controlCapability }, body })).status, 403);
    const response = await fetch(`${url}/__desktop/backup-export`, { method: "POST", headers: { ...headers, "X-Bizovix-Control-Capability": config.controlCapability }, body });
    assert.equal(response.status, 200);
    const exported = (await response.json()).data;
    assert.equal(path.dirname(exported.directory), destinationDirectory);
    assert.equal(exported.pendingCount, 1);
    assert.deepEqual(fs.readdirSync(exported.directory).sort(), ["credentials.vault", "desktop.sqlite", "manifest.json"]);
    const verified = await verifyProfileBackup(exported.directory);
    assert.equal(verified.storage.pendingCount, 1);
    await assert.rejects(server.application.exportBackup(login.accessToken, f.config.rootDirectory), { code: "BACKUP_EXPORT_DESTINATION" });
  } finally {
    await server?.close(); f.cleanup();
    if (fs.existsSync(destinationDirectory)) {
      assert.equal(path.dirname(path.resolve(destinationDirectory)), path.resolve(os.tmpdir()));
      assert.ok(path.basename(destinationDirectory).startsWith("bizovix-native-export-"));
      fs.rmSync(destinationDirectory, { recursive: true, force: true });
    }
  }
});

test("organization draft HTTP routes return recoverable validation and conflict errors without changing accepted records", async () => {
  const f = fixture({ organizations: true }); let server;
  try {
    f.user.permissions = []; f.cloud.capabilities = ["organizationMaster.read", "organizationMaster.create"];
    server = await startLocalServer(f.config, { fetchImpl: f.fetchImpl, now: () => f.cloud.time });
    const origin = `http://127.0.0.1:${server.port}/api/v1`;
    const login = await server.application.login(credentials);
    const headers = { "X-Bizovix-Local-Capability": f.config.capability, Authorization: `Bearer ${login.accessToken}`, "Content-Type": "application/json" };
    const request = (route, method = "GET", body) => fetch(`${origin}${route}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    assert.equal((await request("/organizations", "POST", { shortName: "Missing full name" })).status, 400);
    const created = await request("/organizations", "POST", { shortName: "HTTP", fullName: "HTTP boundary" });
    assert.equal(created.status, 200);
    const saved = (await created.json()).data;
    const pending = await request(`/desktop/organization-drafts/${saved.id}`, "PATCH", { shortName: "Premature", fullName: "Retain" });
    assert.equal(pending.status, 409); assert.equal((await pending.json()).code, "COMMAND_PENDING");
    assert.equal((await request("/organizations/all")).status, 403);
    assert.equal((await request(`/desktop/organization-drafts/${randomUUID()}`)).status, 404);
    await server.application.sync();
    const accepted = await request(`/desktop/organization-drafts/${saved.id}`, "PATCH", { shortName: "Forbidden", fullName: "Do not edit" });
    assert.equal(accepted.status, 409); assert.equal((await accepted.json()).code, "COMMAND_RESOLVED");
    const rows = (await (await request("/organizations")).json()).data;
    assert.equal(rows[0].shortName, "HTTP"); assert.equal(rows[0].syncStatus, "SYNCED");
    assert.equal((await request("/desktop/organization-drafts")).status, 200);
    assert.equal((await fetch(`${origin}/desktop/organization-drafts`, { headers: { Authorization: headers.Authorization } })).status, 403);
  } finally { await server?.close(); f.cleanup(); }
});

test("organization pagination uses the same HTTP data array and outer metadata envelope as Nest", async () => {
  const f = fixture({ organizations: true }); let server;
  try {
    for (let index = 0; index < 10; index += 1) {
      const id = randomUUID(), date = new Date(f.cloud.time).toISOString();
      f.cloud.masterRecords.organizationMaster.set(id, { id, shortName: `Org${index}`, fullName: `Organization ${index}`, version: 1, createdAt: date, updatedAt: date });
    }
    server = await startLocalServer(f.config, { fetchImpl: f.fetchImpl, now: () => f.cloud.time });
    const login = await server.application.login(credentials);
    const headers = { "X-Bizovix-Local-Capability": f.config.capability, Authorization: `Bearer ${login.accessToken}` };
    await server.application.handle("POST", "/organizations", login.accessToken, { shortName: "Pending", fullName: "Management draft" });
    const request = (query) => fetch(`http://127.0.0.1:${server.port}/api/v1/organizations/all${query}`, { headers });
    const page = await (await request("")).json();
    assert.equal(page.success, true); assert.ok(Array.isArray(page.data)); assert.equal(page.data.length, 8);
    assert.deepEqual(page.meta, { page: 1, limit: 8, total: 10, totalPages: 2 });
    const management = await (await request("?includeLocal=true")).json();
    assert.equal(management.meta.total, 11); assert.equal(management.data[0].shortName, "Pending");
  } finally { await server?.close(); f.cleanup(); }
});

test("concurrent cloud requests share refresh rotation and retry only explicit JWT guard denials", async () => {
  const f = fixture(); let refreshCalls = 0, businessCalls = 0, effects = 0;
  let started; const refreshStarted = new Promise((resolve) => { started = resolve; });
  let release; const refreshGate = new Promise((resolve) => { release = resolve; });
  const fetchImpl = async (url, options) => {
    if (url.endsWith("/auth/refresh")) {
      refreshCalls++; started(); await refreshGate;
      return Response.json({ success: true, data: { user: f.user, accessToken: "rotated-access", refreshToken: "rotated-refresh" } });
    }
    if (url.endsWith("/receipts")) {
      businessCalls++;
      if (options.headers.Authorization !== "Bearer rotated-access") return Response.json({ success: false, message: "Unauthorized" }, { status: 401 });
      effects++; return Response.json({ success: true, data: { saved: true } });
    }
    return f.fetchImpl(url, options);
  };
  const app = new LocalApplication(f.config, { fetchImpl, now: () => f.cloud.time });
  try {
    const login = await app.login(credentials);
    const requests = [1, 2].map(() => app.handle("POST", "/receipts", login.accessToken, { amount: 10 }));
    await refreshStarted; assert.equal(refreshCalls, 1); release();
    const results = await Promise.all(requests);
    assert.equal(refreshCalls, 1); assert.equal(businessCalls, 4); assert.equal(effects, 2);
    assert.deepEqual(await results[0].response.json(), { success: true, data: { saved: true } });
    const unlocked = unlockVault(vaultLocation(f.config.rootDirectory, f.config.cloudIssuer, credentials.email), credentials.password);
    assert.equal(unlocked.data.cloudRefreshToken, "rotated-refresh"); unlocked.material.key.fill(0);
  } finally { release(); await app.logout(); f.cleanup(); }
});

test("a network failure after a financial request is never retried or queued", async () => {
  const f = fixture(); let businessCalls = 0, refreshCalls = 0;
  const app = new LocalApplication(f.config, { now: () => f.cloud.time, fetchImpl: async (url, options) => {
    if (url.endsWith("/auth/refresh")) refreshCalls++;
    if (url.endsWith("/receipts")) { businessCalls++; throw new TypeError("lost response after commit"); }
    return f.fetchImpl(url, options);
  } });
  try {
    const login = await app.login(credentials);
    await assert.rejects(app.handle("POST", "/receipts", login.accessToken, { amount: 10 }), { code: "CLOUD_UNAVAILABLE" });
    assert.equal(businessCalls, 1); assert.equal(refreshCalls, 0); assert.equal(app.status().storage.pendingCount, 0);
  } finally { await app.logout(); f.cleanup(); }
});

test("an unrecognized business 401 is not replayed and invalidates cached offline authorization", async () => {
  const f = fixture(); let businessCalls = 0, refreshCalls = 0;
  const app = new LocalApplication(f.config, { now: () => f.cloud.time, fetchImpl: async (url, options) => {
    if (url.endsWith("/auth/refresh")) refreshCalls++;
    if (url.endsWith("/receipts")) { businessCalls++; return Response.json({ success: false, message: "Additional verification required" }, { status: 401 }); }
    return f.fetchImpl(url, options);
  } });
  try {
    const login = await app.login(credentials);
    assert.equal((await app.handle("POST", "/receipts", login.accessToken, {})).response.status, 401);
    assert.equal(businessCalls, 1); assert.equal(refreshCalls, 0);
    await assert.rejects(app.handle("POST", "/master-categories", login.accessToken, category("Blocked")), { code: "AUTHORIZATION_REVALIDATION_REQUIRED" });
  } finally { await app.logout(); f.cleanup(); }
});

test("cloud permission revocation blocks offline writes across restart while retaining the pending operation", async () => {
  const f = fixture(); let app = f.app();
  try {
    const login = await app.login(credentials);
    await app.handle("POST", "/master-categories", login.accessToken, category("Retained"));
    f.cloud.denyCommands = true; await app.sync();
    assert.equal(app.active.store.listCategories()[0].name, "Retained");
    assert.equal(app.active.store.listCategories()[0].syncStatus, "PENDING");
    await assert.rejects(app.handle("POST", "/master-categories", login.accessToken, category("Blocked")), { code: "AUTHORIZATION_REVALIDATION_REQUIRED" });
    await app.handle("POST", "/auth/logout", login.accessToken);
    f.cloud.offline = true; app = f.app();
    await assert.rejects(app.login(credentials), { code: "AUTHORIZATION_REVALIDATION_REQUIRED" });
    f.cloud.offline = false; f.cloud.denyCommands = false;
    const verified = await app.login(credentials);
    assert.equal((await app.handle("GET", "/master-categories", verified.accessToken)).data[0].name, "Retained");
  } finally { await app.logout(); f.cleanup(); }
});

test("logout drains an in-flight refresh and prevents old-account response or vault writes", async () => {
  const f = fixture(); let started, release;
  const refreshStarted = new Promise((resolve) => { started = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  const app = new LocalApplication(f.config, { now: () => f.cloud.time, fetchImpl: async (url, options) => {
    if (url.endsWith("/receipts")) return Response.json({ success: false, message: "Unauthorized" }, { status: 401 });
    if (url.endsWith("/auth/refresh")) { started(); await gate; return Response.json({ success: true, data: { user: f.user, accessToken: "late-access", refreshToken: "late-refresh" } }); }
    return f.fetchImpl(url, options);
  } });
  try {
    const login = await app.login(credentials), old = app.active;
    const request = app.handle("GET", "/receipts", login.accessToken);
    const rejection = assert.rejects(request, /sign in|account changed/i);
    await refreshStarted;
    const loggingOut = app.logout();
    assert.equal(app.active, null); release();
    await Promise.all([loggingOut, rejection]);
    assert.ok(old.material.key.every((byte) => byte === 0));
    const unlocked = unlockVault(vaultLocation(f.config.rootDirectory, f.config.cloudIssuer, credentials.email), credentials.password);
    assert.equal(unlocked.data.cloudRefreshToken, "cloud-refresh-secret"); unlocked.material.key.fill(0);
    assert.equal(app.status().lastSyncError, null);
  } finally { release(); await app.logout(); f.cleanup(); }
});

test("logout cancels an unfinished activation instead of allowing a late session to appear", async () => {
  const f = fixture(); let started, release;
  const registrationStarted = new Promise((resolve) => { started = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  const app = new LocalApplication(f.config, { now: () => f.cloud.time, fetchImpl: async (url, options) => {
    if (url.endsWith("/desktop-sync/register")) { started(); await gate; }
    return f.fetchImpl(url, options);
  } });
  try {
    const login = app.login(credentials), rejection = assert.rejects(login, { code: "LOGIN_CANCELLED" });
    await registrationStarted; await app.logout(); release(); await rejection;
    assert.equal(app.active, null);
    assert.equal(fs.existsSync(vaultLocation(f.config.rootDirectory, f.config.cloudIssuer, credentials.email)), false);
  } finally { release(); await app.logout(); f.cleanup(); }
});

test("expired active grants refuse new writes but still permit logout", async () => {
  const f = fixture(); const app = f.app();
  try {
    const login = await app.login(credentials); f.cloud.time += 3600_001;
    await assert.rejects(app.handle("POST", "/master-categories", login.accessToken, category("Too late")), { code: "OFFLINE_GRANT_EXPIRED" });
    assert.equal(app.active.store.pendingCommands().length, 0);
    await app.handle("POST", "/auth/logout", login.accessToken);
    assert.equal(app.active, null);
  } finally { await app.logout(); f.cleanup(); }
});

test("an acknowledgement for another operation cannot erase the pending command", async () => {
  const f = fixture();
  const app = new LocalApplication(f.config, { now: () => f.cloud.time, fetchImpl: async (url, options) => {
    const response = await f.fetchImpl(url, options);
    if (url.endsWith("/desktop-sync/commands")) {
      const envelope = await response.json(); envelope.data.operationId = "another-operation"; return Response.json(envelope);
    }
    return response;
  } });
  try {
    const login = await app.login(credentials);
    await app.handle("POST", "/master-categories", login.accessToken, category("Keep me"));
    await app.sync();
    assert.equal(app.status().storage.pendingCount, 1);
    assert.equal(app.active.store.listCategories()[0].name, "Keep me");
    assert.match(app.status().lastSyncError, /acknowledgement/i);
  } finally { await app.logout(); f.cleanup(); }
});

test("rejected refresh prevents a business retry and blocks offline fallback without losing queued work", async () => {
  const f = fixture(); let businessCalls = 0, refreshCalls = 0;
  const app = new LocalApplication(f.config, { now: () => f.cloud.time, fetchImpl: async (url, options) => {
    if (url.endsWith("/receipts")) { businessCalls++; return Response.json({ success: false, message: "Unauthorized" }, { status: 401 }); }
    if (url.endsWith("/auth/refresh")) { refreshCalls++; return Response.json({ success: false, message: "Invalid or expired refresh token" }, { status: 401 }); }
    return f.fetchImpl(url, options);
  } });
  try {
    const login = await app.login(credentials);
    await app.handle("POST", "/master-categories", login.accessToken, category("Preserved"));
    await assert.rejects(app.handle("POST", "/receipts", login.accessToken, { amount: 50 }), /refresh token/);
    assert.equal(businessCalls, 1); assert.equal(refreshCalls, 1);
    assert.equal(app.active.store.pendingCommands().length, 1);
    await app.logout(); f.cloud.offline = true;
    await assert.rejects(app.login(credentials), { code: "AUTHORIZATION_REVALIDATION_REQUIRED" });
  } finally { await app.logout(); f.cleanup(); }
});

test("an explicit cloud login denial remains denied during later offline fallback", async () => {
  const f = fixture(); const app = f.app();
  try {
    await app.login(credentials); await app.logout();
    f.cloud.denyLogin = true;
    await assert.rejects(app.login(credentials), /Invalid login/);
    f.cloud.offline = true;
    await assert.rejects(app.login(credentials), { code: "AUTHORIZATION_REVALIDATION_REQUIRED" });
  } finally { await app.logout(); f.cleanup(); }
});

test("a cloud resnapshot requirement rebuilds accepted data while preserving rejected local input", async () => {
  const f = fixture(); let resetCursor = false;
  const app = new LocalApplication(f.config, { now: () => f.cloud.time, fetchImpl: async (url, options) => {
    if (resetCursor && url.includes("/desktop-sync/changes?")) return Response.json({ success: false, message: "RESNAPSHOT_REQUIRED: database epoch changed" }, { status: 409 });
    return f.fetchImpl(url, options);
  } });
  try {
    const login = await app.login(credentials);
    const saved = await app.handle("POST", "/master-categories", login.accessToken, category("First")); await app.sync();
    await app.handle("PATCH", `/master-categories/${saved.data.id}`, login.accessToken, category("My unsynced edit"));
    const existing = f.cloud.categories.get(saved.data.id);
    f.cloud.categories.set(saved.data.id, { ...existing, name: "Other PC edit", version: 2 });
    resetCursor = true; await app.sync();
    assert.equal(app.status().lastSyncError, null);
    const local = (await app.handle("GET", "/master-categories", login.accessToken)).data[0];
    assert.equal(local.name, "My unsynced edit"); assert.equal(local.syncStatus, "REJECTED");
    assert.equal(app.active.store.rejectedCommands().length, 1);
  } finally { await app.logout(); f.cleanup(); }
});

test("create-only users can correct rejected creations but cannot edit accepted categories", async () => {
  const f = fixture(); f.user.permissions = ["masters.read", "vendor.create"];
  const app = f.app();
  try {
    const login = await app.login(credentials);
    const draft = await app.handle("POST", "/master-categories", login.accessToken, category("Rejected local create"));
    const original = app.active.store.pendingCommands()[0];
    app.active.store.rejectCommand(original.operationId, "DUPLICATE", "Please choose another name");
    const corrected = await app.handle("PATCH", `/master-categories/${draft.data.id}`, login.accessToken, category("Corrected local create"));
    assert.equal(corrected.data.name, "Corrected local create");
    assert.equal(app.active.store.pendingCommands()[0].commandType, "masterCategory.create");
    await app.sync();
    await assert.rejects(app.handle("PATCH", `/master-categories/${draft.data.id}`, login.accessToken, category("Unauthorized accepted edit")), { status: 403 });
    assert.equal(app.active.store.pendingCommands().length, 0);
    assert.equal(app.active.store.listCategories()[0].name, "Corrected local create");
  } finally { await app.logout(); f.cleanup(); }
});

test("vault persistence failure cannot report an unsaved category after SQLite has committed it", async () => {
  const f = fixture(); const app = f.app();
  try {
    const login = await app.login(credentials), persist = app.persist.bind(app);
    app.persist = () => { throw new Error("Injected credential filesystem failure"); };
    await assert.rejects(app.handle("POST", "/master-categories", login.accessToken, category("Not committed")), /filesystem failure/);
    assert.equal(app.active.store.pendingCommands().length, 0);
    assert.deepEqual(app.active.store.listCategories(), []);
    app.persist = persist;
    await app.handle("POST", "/master-categories", login.accessToken, category("Committed once"));
    assert.equal(app.active.store.pendingCommands().length, 1);
  } finally { await app.logout(); f.cleanup(); }
});

test("multipart uploads above 16 MiB stream intact to cloud and replay only after JWT denial; malformed JSON never forwards", async () => {
  const f = fixture(); let local;
  const uploads = [];
  const upstream = http.createServer(async (request, response) => {
    let size = 0; const digest = createHash("sha256");
    for await (const chunk of request) { size += chunk.length; digest.update(chunk); }
    uploads.push({ size, digest: digest.digest("hex"), contentType: request.headers["content-type"] });
    response.writeHead(uploads.length === 1 ? 401 : 200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(uploads.length === 1 ? { success: false, message: "Unauthorized" } : { success: true, data: { uploaded: true } }));
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  let multipartAttempts = 0;
  try {
    local = await startLocalServer(f.config, { now: () => f.cloud.time, fetchImpl: async (url, options) => {
      if (url.endsWith("/documents")) {
        multipartAttempts++;
        assert.ok(options.body instanceof Blob, "Multipart forwarding must retain a replayable file-backed body");
        assert.ok(options.body.size > 16 * 1024 * 1024);
        return fetch(`http://127.0.0.1:${upstream.address().port}/documents`, options);
      }
      return f.fetchImpl(url, options);
    } });
    const login = await local.application.login(credentials);
    const url = `http://127.0.0.1:${local.port}/api/v1/documents`;
    const headers = { "X-Bizovix-Local-Capability": f.config.capability, Authorization: `Bearer ${login.accessToken}` };
    const form = new FormData();
    form.set("name", "Transport test");
    form.set("file", new Blob([Buffer.alloc(18 * 1024 * 1024, 0x61)], { type: "application/pdf" }), "large.pdf");
    const outgoing = new Request(url, { method: "POST", headers, body: form });
    const expectedHash = createHash("sha256"); let expectedSize = 0;
    for await (const chunk of outgoing.clone().body) { expectedHash.update(chunk); expectedSize += chunk.length; }
    const response = await fetch(outgoing);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, data: { uploaded: true } });
    assert.equal(multipartAttempts, 2);
    assert.equal(uploads.length, 2);
    assert.ok(uploads[0].size > 18 * 1024 * 1024);
    assert.equal(uploads[0].size, expectedSize);
    assert.equal(uploads[0].digest, expectedHash.digest("hex"));
    assert.deepEqual(uploads[0], uploads[1], "JWT retry must send the same multipart bytes and boundary");
    assert.match(uploads[0].contentType, /^multipart\/form-data; boundary=/);
    const malformed = await fetch(url, { method: "POST", headers: { ...headers, "Content-Type": "application/json; charset=utf-8" }, body: "{broken" });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).message, "Invalid JSON.");
    assert.equal(multipartAttempts, 2);
    for (const [contentType, size] of [["application/json", 17 * 1024 * 1024], ["multipart/form-data; boundary=test", 217 * 1024 * 1024]]) {
      const rejected = await new Promise((resolve, reject) => {
        const request = http.request(url, { method: "POST", headers: { ...headers, "Content-Type": contentType, "Content-Length": size } }, (result) => {
          result.resume(); result.once("end", () => resolve(result.statusCode));
        });
        request.once("error", reject); request.end();
      });
      assert.equal(rejected, 413, "Oversized bodies must be rejected before spooling or forwarding");
    }
    assert.equal(multipartAttempts, 2);
  } finally {
    await local?.close(); upstream.closeAllConnections();
    await new Promise((resolve) => upstream.close(resolve));
    f.cleanup();
  }
});
