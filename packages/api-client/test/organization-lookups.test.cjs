const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function fixture({ desktop = true, result = [], offlineModules = ["organizations"], organizationDraftRecoveryAvailable } = {}) {
  const calls = [], invalidated = [], cached = [];
  const module = { exports: {} };
  const javascript = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src/hooks/use-organizations.ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const request = async (route, options) => { calls.push({ route, options }); return result; };
  const dependencies = {
    "@tanstack/react-query": {
      useQuery: (options) => options.queryKey[0] === "desktop-sync-status" ? { ...options, data: { offlineModules, organizationDraftRecoveryAvailable } } : options,
      useMutation: (options) => options,
      useQueryClient: () => ({
        invalidateQueries: async ({ queryKey }) => invalidated.push([...queryKey]),
        setQueryData: (key, value) => cached.push({ key: [...key], value }),
      }),
    },
    "../http-client": { apiRequest: request, apiRequestPaginated: request },
    "../desktop-runtime": { isLocalDesktop: () => desktop },
    "./query-keys": { queryKeys: {
      organizations: (search) => ["organizations", search ?? ""],
      organizationMasters: (params) => ["organizations", "all", params ?? {}],
    } },
  };
  vm.runInNewContext(`(function(require,module,exports){${javascript}\n})`)((name) => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected import ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return { hooks: module.exports, calls, invalidated, cached };
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const records = [
  { id: "legacy", shortName: "Cloud", fullName: "Existing" },
  { id: "accepted", shortName: "Accepted", fullName: "Synced", syncStatus: "SYNCED" },
  { id: "pending", shortName: "Draft", fullName: "Queued", syncStatus: "PENDING" },
  { id: "rejected", shortName: "Duplicate", fullName: "Preserved", syncStatus: "REJECTED", cloudRecord: { id: "different-id", shortName: "Duplicate", fullName: "Someone else" } },
];

test("organization selectors exclude unaccepted IDs without replacing a duplicate with another cloud ID", async () => {
  const f = fixture({ result: records });
  assert.deepEqual(plain(await f.hooks.useOrganizations("cl").queryFn()), records.slice(0, 2));
  assert.deepEqual(plain(await f.hooks.useAllOrganizations().queryFn()), records.slice(0, 2));
  assert.equal(f.hooks.isAcceptedOrganizationMaster(records[3]), false);
  assert.equal(records[3].id, "rejected");
});

test("typeahead preserves raw search and two-character enablement; empty-all stays a separate request", async () => {
  const f = fixture();
  assert.equal(f.hooks.useOrganizations(" a ").enabled, false);
  const lookup = f.hooks.useOrganizations(" Ab ");
  assert.equal(lookup.enabled, true);
  await lookup.queryFn();
  await f.hooks.useAllOrganizations().queryFn();
  assert.deepEqual(plain(f.calls), [
    { route: "/organizations", options: { params: { search: " Ab " } } },
    { route: "/organizations" },
  ]);
});

test("desktop management includes drafts before server caps/pagination and keeps selector caches separate", async () => {
  const f = fixture({ result: records });
  const management = f.hooks.useOrganizations("du", { includeLocal: true });
  assert.equal(await management.queryFn(), records);
  assert.notDeepEqual(plain(management.queryKey), plain(f.hooks.useOrganizations("du").queryKey));
  await f.hooks.useAllOrganizations({ includeLocal: true }).queryFn();
  assert.deepEqual(plain(f.calls.map((call) => call.options.params)), [{ search: "du", includeLocal: "true" }, { includeLocal: "true" }]);
});

test("organization paginated management preserves pagination metadata and the /all endpoint", async () => {
  const result = { items: records, meta: { page: 2, limit: 10, total: 31, totalPages: 4 } };
  const f = fixture({ result });
  const query = { page: 2, limit: 10, search: " Raw " };
  const management = f.hooks.useOrganizationMasters(query, { includeLocal: true });
  assert.deepEqual(plain(await management.queryFn()), result);
  const selector = f.hooks.useOrganizationMasters(query);
  assert.deepEqual(plain((await selector.queryFn()).items), records.slice(0, 2));
  assert.notDeepEqual(plain(management.queryKey), plain(selector.queryKey));
  assert.deepEqual(plain(f.calls[0]), { route: "/organizations/all", options: { params: { ...query, includeLocal: "true" } } });
});

test("web management keeps original endpoint contracts without desktop query hints", async () => {
  const f = fixture({ desktop: false, result: { items: [], meta: {} } });
  await f.hooks.useOrganizations("Ab", { includeLocal: true }).queryFn();
  await f.hooks.useAllOrganizations({ includeLocal: true }).queryFn();
  await f.hooks.useOrganizationMasters({ page: 1 }, { includeLocal: true }).queryFn();
  assert.deepEqual(plain(f.calls), [
    { route: "/organizations", options: { params: { search: "Ab" } } },
    { route: "/organizations" },
    { route: "/organizations/all", options: { params: { page: 1 } } },
  ]);
});

test("create preserves exact names and seeds same-ID status before refreshing both query families", async () => {
  const f = fixture({ result: records[2] });
  const create = f.hooks.useCreateOrganizationMaster();
  const payload = { shortName: " Mixed ", fullName: " Exact  name " };
  const result = await create.mutationFn(payload);
  await create.onSuccess(result);
  assert.deepEqual(plain(f.calls), [{ route: "/organizations", options: { method: "POST", body: payload } }]);
  assert.deepEqual(plain(f.cached), [{ key: ["organizations", "desktop-draft", "pending"], value: records[2] }]);
  assert.deepEqual(f.invalidated, [["organizations"], ["desktop-sync-status"]]);
});

test("rejected create revisions use only the dedicated desktop route and preserve names", async () => {
  const f = fixture({ result: records[2] });
  const mutation = f.hooks.useReviseOrganizationDraft();
  const payload = { shortName: " Revised ", fullName: "Case Kept" };
  const result = await mutation.mutationFn({ id: "same/id", payload });
  await mutation.onSuccess(result);
  assert.deepEqual(plain(f.calls), [{ route: "/desktop/organization-drafts/same%2Fid", options: { method: "PATCH", body: payload } }]);
  assert.equal(f.cached[0].value, result);
  assert.deepEqual(f.invalidated, [["organizations"], ["desktop-sync-status"]]);
});

test("same-ID draft detail polls without using the masters-only list or a capped typeahead", async () => {
  const f = fixture({ result: records[2] });
  const detail = f.hooks.useOrganizationDraft("same/id");
  assert.equal(detail.enabled, true);
  assert.equal(await detail.queryFn(), records[2]);
  assert.equal(detail.refetchInterval({ state: { data: records[2] } }), 5_000);
  assert.equal(detail.refetchInterval({ state: { data: records[1] } }), false);
  assert.equal(f.hooks.useOrganizationDraft().enabled, false);
  assert.deepEqual(plain(f.calls), [{ route: "/desktop/organization-drafts/same%2Fid" }]);
});

test("web clients cannot call local draft detail or revision endpoints", async () => {
  const f = fixture({ desktop: false });
  const detail = f.hooks.useOrganizationDraft("draft");
  assert.equal(detail.enabled, false);
  assert.throws(() => detail.queryFn(), /desktop app/);
  assert.throws(() => f.hooks.useReviseOrganizationDraft().mutationFn({ id: "draft", payload: { shortName: "A", fullName: "B" } }), /desktop app/);
  assert.deepEqual(f.calls, []);
});

test("recovery lists all local drafts only while the desktop modal is open", async () => {
  const f = fixture({ result: records.slice(2) });
  const recovery = f.hooks.useOrganizationDrafts(true);
  assert.equal(recovery.enabled, true);
  assert.equal(recovery.refetchInterval, 5_000);
  assert.deepEqual(await recovery.queryFn(), records.slice(2));
  assert.equal(f.hooks.useOrganizationDrafts(false).enabled, false);
  assert.equal(f.hooks.useOrganizationDrafts(false).refetchInterval, false);
  assert.deepEqual(plain(f.calls), [{ route: "/desktop/organization-drafts" }]);
  const web = fixture({ desktop: false });
  assert.equal(web.hooks.useOrganizationDrafts(true).enabled, false);
  assert.throws(() => web.hooks.useOrganizationDrafts(true).queryFn(), /desktop app/);
  assert.deepEqual(web.calls, []);
});

test("older grants without organization snapshots never request the draft endpoint", () => {
  for (const offlineModules of [[], ["master-categories"], undefined]) {
    const f = fixture({ offlineModules: offlineModules ?? null });
    const recovery = f.hooks.useOrganizationDrafts(true);
    assert.equal(recovery.enabled, false);
    assert.throws(() => recovery.queryFn(), /not enabled/);
    assert.deepEqual(f.calls, []);
  }
});

test("draft recovery remains available after the accepted organization search index is invalidated", async () => {
  const f = fixture({ offlineModules: [], organizationDraftRecoveryAvailable: true, result: records.slice(2) });
  const recovery = f.hooks.useOrganizationDrafts(true);
  assert.equal(recovery.enabled, true);
  assert.deepEqual(await recovery.queryFn(), records.slice(2));
  assert.deepEqual(plain(f.calls), [{ route: "/desktop/organization-drafts" }]);
  const denied = fixture({ organizationDraftRecoveryAvailable: false });
  assert.equal(denied.hooks.useOrganizationDrafts(true).enabled, false);
  assert.throws(() => denied.hooks.useOrganizationDrafts(true).queryFn(), /not enabled/);
  assert.deepEqual(denied.calls, []);
});
