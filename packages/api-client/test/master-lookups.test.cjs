const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function fixture(filename, records) {
  const calls = [], invalidated = [];
  const module = { exports: {} };
  const javascript = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src/hooks", filename), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const dependencies = {
    "@tanstack/react-query": {
      useQuery: (options) => options,
      useMutation: (options) => options,
      useQueryClient: () => ({ invalidateQueries: async ({ queryKey }) => invalidated.push([...queryKey]) }),
    },
    "../http-client": { apiRequest: async (route, options) => { calls.push({ route, options }); return records; } },
    "./query-keys": { queryKeys: { uoms: ["uoms"], paymentTerms: ["payment-terms"] } },
  };
  vm.runInNewContext(`(function(require,module,exports){${javascript}\n})`)((name) => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected import ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return { hooks: module.exports, calls, invalidated };
}

for (const config of [
  { file: "use-uoms.ts", hook: "useUoms", create: "useCreateUom", update: "useUpdateUom", key: "uoms", payload: { code: "KG", name: "Kilogram", symbol: "kg" } },
  { file: "use-payment-terms.ts", hook: "usePaymentTerms", create: "useCreatePaymentTerm", update: "useUpdatePaymentTerm", key: "payment-terms", payload: { name: "30 Days", days: 30, description: "Fixture" } },
]) {
  test(`${config.key}: cloud selectors exclude local-only IDs and use accepted values during pending/rejected edits`, async () => {
    const records = [
      { id: "legacy", name: "Existing cloud", isActive: true },
      { id: "synced", name: "Accepted", syncStatus: "SYNCED", isActive: false },
      { id: "new-pending", name: "Pending create", syncStatus: "PENDING" },
      { id: "new-rejected", name: "Rejected create", syncStatus: "REJECTED" },
      { id: "edit-pending", name: "Unaccepted edit", syncStatus: "PENDING", cloudRecord: { id: "edit-pending", name: "Accepted old name", isActive: true } },
      { id: "edit-rejected", name: "Rejected edit", syncStatus: "REJECTED", cloudRecord: { id: "edit-rejected", name: "Other PC's accepted value", isActive: false } },
    ];
    const f = fixture(config.file, records);
    const query = f.hooks[config.hook]();
    const result = await query.queryFn();
    assert.deepEqual(JSON.parse(JSON.stringify(result)), [records[0], records[1], records[4].cloudRecord, records[5].cloudRecord]);
    assert.deepEqual([...query.queryKey], [config.key, "accepted"]);
    assert.equal(f.calls[0].route, `/${config.key}`);
    assert.equal(f.calls[0].options, undefined);
    assert.equal(records[4].name, "Unaccepted edit", "Filtering must not rewrite the saved local record");
  });

  test(`${config.key}: management queries retain drafts and have a separate cache identity`, async () => {
    const records = [{ id: "local", syncStatus: "REJECTED", syncError: { kind: "CONFLICT", message: "Review" } }];
    const f = fixture(config.file, records);
    const management = f.hooks[config.hook]({ includeLocal: true });
    const selector = f.hooks[config.hook]({ includeLocal: false });
    assert.equal(await management.queryFn(), records);
    assert.deepEqual([...management.queryKey], [config.key, "with-local-drafts"]);
    assert.notDeepEqual([...management.queryKey], [...selector.queryKey]);
    assert.equal((await selector.queryFn()).length, 0);
  });

  test(`${config.key}: writes preserve the endpoint/body contract and invalidate both data and sync status`, async () => {
    const f = fixture(config.file, []);
    const create = f.hooks[config.create]();
    await create.mutationFn(config.payload);
    await create.onSuccess();
    const update = f.hooks[config.update]();
    const revised = { ...config.payload, ...(config.key === "uoms" ? { symbol: "" } : { description: "" }), isActive: false };
    await update.mutationFn({ id: "rejected-local-record", payload: revised });
    await update.onSuccess();
    assert.deepEqual(JSON.parse(JSON.stringify(f.calls)), [
      { route: `/${config.key}`, options: { method: "POST", body: config.payload } },
      { route: `/${config.key}/rejected-local-record`, options: { method: "PATCH", body: revised } },
    ]);
    assert.deepEqual(f.invalidated, [[config.key], ["desktop-sync-status"], [config.key], ["desktop-sync-status"]]);
  });
}
