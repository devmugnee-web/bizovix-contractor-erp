const assert = require("node:assert/strict");
const { net } = require("electron");

// Compiled UI and transport-selection checks with intercepted fixture data.
// This deliberately does not claim real cloud sync or persistence coverage.
module.exports = async function masterDataUiFixture(window, trace = () => {}) {
  const contents = window.webContents;
  const evaluate = (script) => contents.executeJavaScript(script);
  const origin = new URL(contents.getURL()).origin;
  const runtime = await evaluate("window.bizovix.getRuntimeInfo()");
  const apiOrigin = new URL(runtime.localApiUrl).origin;
  const timestamp = "2026-09-21T09:00:00.000Z";
  const common = { isActive: true, createdAt: timestamp, updatedAt: timestamp, version: 1 };
  const units = [
    { ...common, id: "pending-unit", code: "PEND", name: "Pending local unit", symbol: null, syncStatus: "PENDING" },
    { ...common, id: "review-unit", code: "KG", name: "Preserved local unit", symbol: "kg", syncStatus: "REJECTED", syncError: { kind: "CONFLICT", message: "Another PC changed this unit." }, cloudRecord: { ...common, id: "review-unit", code: "KG", name: "Accepted cloud unit", symbol: "kg-cloud" } },
    { ...common, id: "rejected-new-unit", code: "DUPLICATE", name: "Rejected new unit", symbol: null, syncStatus: "REJECTED", syncError: { kind: "VALIDATION", message: "Choose an unused unit code." } },
  ];
  const terms = [
    { ...common, id: "pending-term", name: "Pending local term", days: 10, description: null, syncStatus: "PENDING" },
    { ...common, id: "review-term", name: "Preserved local term", days: 30, description: "Saved description", syncStatus: "REJECTED", syncError: { kind: "CONFLICT", message: "Another PC changed this payment term." }, cloudRecord: { ...common, id: "review-term", name: "Accepted cloud term", days: 45, description: "Cloud description" } },
  ];
  const mutations = [], checks = [];
  let offlineModules = ["master-categories", "uoms", "payment-terms"];
  let legacy = false, interceptionError;
  let lastSyncedAt = timestamp, projectionRevision = "fixture-revision-1";
  let statusRequests = 0, unitRequests = 0;
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Bizovix-Local-Capability", "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS" };
  contents.session.protocol.handle("http", async (request) => {
    try {
      const url = new URL(request.url);
      if (!url.pathname.startsWith("/api/v1/")) return net.fetch(request, { bypassCustomProtocolHandlers: true });
      assert.equal(url.origin, apiOrigin);
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
      assert.equal(request.headers.get("X-Bizovix-Local-Capability"), runtime.localCapability);
      const route = url.pathname.replace(/^\/api\/v1/, "");
      let data = [];
      if (route === "/auth/me") data = { id: "fixture-user", organizationId: "fixture-tenant", email: "preview@example.test", name: "Preview Auditor", roleName: "Admin", permissions: ["masters.read", "vendor.create", "vendor.update"] };
      else if (route === "/desktop/status") {
        statusRequests += 1;
        data = { lastSyncedAt, lastSyncError: lastSyncedAt ? null : "The payment-term stream could not finish.", storage: { pendingCount: 2, rejectedCount: 2, projectionRevision }, ...(!legacy ? { rollout: "master-data-pilot", offlineModules } : {}) };
      }
      else if (route.includes("subscription")) data = { status: "ACTIVE", plan: { name: "Fixture" } };
      else if (route === "/reminders/stats") data = { dueToday: 0, upcoming: 0, overdue: 0 };
      else if (route.startsWith("/uoms") || route.startsWith("/payment-terms")) {
        const records = route.startsWith("/uoms") ? units : terms;
        if (request.method === "GET") {
          if (records === units) unitRequests += 1;
          data = records;
        }
        else {
          const body = await request.json();
          mutations.push({ route, method: request.method, body });
          if (request.method === "POST") {
            data = { ...common, id: records === units ? "created-unit" : "created-term", ...body, syncStatus: "PENDING" };
            records.push(data);
          } else {
            const index = records.findIndex((record) => route.endsWith(`/${record.id}`));
            assert.ok(index >= 0);
            data = { ...records[index], ...body, syncStatus: "PENDING", syncError: undefined };
            records[index] = data;
          }
        }
      }
      return new Response(JSON.stringify({ success: true, data, ...(route === "/parties" ? { meta: { page: 1, limit: 20, total: 0, totalPages: 1 } } : {}) }), { headers });
    } catch (error) { interceptionError = error; return new Response("Fixture failed", { status: 500, headers }); }
  });
  async function waitFor(script, label, attempts = 100) {
    for (let count = 0; count < attempts; count++) {
      if (interceptionError) throw interceptionError;
      if (await evaluate(script)) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Master UI fixture timed out: ${label}`);
  }
  async function fill(placeholder, value) {
    const selector = `input[placeholder=${JSON.stringify(placeholder)}]`;
    await evaluate(`(() => {const input=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  }
  const click = (label) => evaluate(`[...document.querySelectorAll('button')].find(button=>button.innerText.trim()===${JSON.stringify(label)}).click()`);
  const banner = "[...document.querySelectorAll('[role=status]')].find(element=>element.textContent.includes('Desktop preview:'))?.textContent";
  try {
    for (const config of [
      { route: "/masters/units", key: "uoms", pending: "Pending local unit", local: "Preserved local unit", cloud: "Accepted cloud unit", revised: { code: "KG", name: "Reviewed unit", symbol: "", isActive: false }, fields: [["Name (e.g. Kilogram)", "Reviewed unit"], ["Symbol (optional)", ""]], create: { code: "BOX", name: "Created unit", symbol: "box" }, createFields: [["Code (e.g. KG)", "BOX"], ["Name (e.g. Kilogram)", "Created unit"], ["Symbol (optional)", "box"]], addLabel: "Add Unit", id: "review-unit" },
      { route: "/masters/payment-terms", key: "payment-terms", pending: "Pending local term", local: "Preserved local term", cloud: "Accepted cloud term", revised: { name: "Reviewed term", days: 40, description: "", isActive: false }, fields: [["Name (e.g. 30 Days)", "Reviewed term"], ["Days", "40"], ["Description (optional)", ""]], create: { name: "Created term", days: 15, description: "Created description" }, createFields: [["Name (e.g. 30 Days)", "Created term"], ["Days", "15"], ["Description (optional)", "Created description"]], addLabel: "Add Term", id: "review-term" },
    ]) {
      trace(`fixture-${config.key}`);
      await window.loadURL(`${origin}${config.route}`);
      await waitFor(`document.body.innerText.includes(${JSON.stringify(config.pending)}) && document.body.innerText.includes(${JSON.stringify(config.local)})`, "master rows");
      assert.equal(await evaluate(`[...document.querySelectorAll('tr')].find(row=>row.innerText.includes(${JSON.stringify(config.pending)})).querySelector('button').disabled`), true);
      checks.push(`${config.key}-pending-disabled`);
      await evaluate(`[...document.querySelectorAll('tr')].find(row=>row.innerText.includes(${JSON.stringify(config.local)})).querySelector('button').click()`);
      await waitFor(`document.body.innerText.includes('Accepted cloud value') && document.body.innerText.includes(${JSON.stringify(config.cloud)})`, "local/cloud review");
      assert.equal(await evaluate(`document.body.innerText.includes(${JSON.stringify(config.local)})`), true);
      checks.push(`${config.key}-preserved-local-cloud-review`);
      if (config.key === "uoms") {
        assert.equal(await evaluate("document.querySelector('input[placeholder=\"Code (e.g. KG)\"]').disabled"), true);
        checks.push("uoms-existing-code-readonly");
      }
      for (const [placeholder, value] of config.fields) await fill(placeholder, value);
      await evaluate("document.querySelector('input[type=checkbox]').click()");
      await click("Queue reviewed change");
      await waitFor(`!![...document.querySelectorAll('button')].find(button=>button.innerText.trim()===${JSON.stringify(config.addLabel)})`, "review submitted");
      assert.deepEqual(mutations.find((entry) => entry.route === `/${config.key}/${config.id}`), { route: `/${config.key}/${config.id}`, method: "PATCH", body: config.revised });
      checks.push(`${config.key}-review-patch-fields`);
      checks.push(config.key === "uoms" ? "uoms-review-clears-symbol" : "payment-terms-review-clears-description");
      for (const [placeholder, value] of config.createFields) await fill(placeholder, value);
      await click(config.addLabel);
      await waitFor(`document.body.innerText.includes(${JSON.stringify(config.create.name)})`, "create submitted");
      assert.deepEqual(mutations.find((entry) => entry.route === `/${config.key}`), { route: `/${config.key}`, method: "POST", body: config.create });
      checks.push(`${config.key}-create-post-fields`);
    }
    await window.loadURL(`${origin}/masters/units`);
    await waitFor("document.body.innerText.includes('Rejected new unit')", "rejected new unit");
    await evaluate("[...document.querySelectorAll('tr')].find(row=>row.innerText.includes('Rejected new unit')).querySelector('button').click()");
    await waitFor("document.body.innerText.includes('This saved record has not been accepted by the cloud.')", "rejected create review");
    assert.equal(await evaluate("document.querySelector('input[placeholder=\"Code (e.g. KG)\"]').disabled"), false);
    await fill("Code (e.g. KG)", "FREE");
    await fill("Name (e.g. Kilogram)", "Corrected new unit");
    await click("Queue reviewed change");
    await waitFor("document.body.innerText.includes('Corrected new unit')", "revised create queued");
    assert.deepEqual(mutations.find((entry) => entry.route === "/uoms/rejected-new-unit"), { route: "/uoms/rejected-new-unit", method: "PATCH", body: { code: "FREE", name: "Corrected new unit", symbol: "", isActive: true } });
    checks.push("uoms-rejected-create-code-correction");
    await window.loadURL(`${origin}/masters/items/create`);
    await waitFor("[...document.querySelectorAll('option')].some(option=>option.text.includes('Accepted cloud unit'))", "accepted unit selector");
    assert.equal(await evaluate("[...document.querySelectorAll('option')].some(option=>['pending-unit','created-unit','rejected-new-unit'].includes(option.value)||option.text.includes('Reviewed unit'))"), false);
    checks.push("item-uom-selector-accepted-only");
    await window.loadURL(`${origin}/masters/vendors/create`);
    await waitFor("[...document.querySelectorAll('option')].some(option=>option.text==='Accepted cloud term')", "accepted payment-term selector");
    assert.equal(await evaluate("[...document.querySelectorAll('option')].some(option=>['pending-term','created-term'].includes(option.value)||option.text==='Reviewed term')"), false);
    checks.push("party-payment-term-selector-accepted-only");
    offlineModules = ["uoms"];
    await window.loadURL(`${origin}/masters/units`);
    await waitFor(`${banner}?.includes('units work offline')`, "permission-based offline banner");
    assert.equal((await evaluate(banner)).includes("payment terms work offline"), false);
    checks.push("banner-uses-granted-initialized-modules");
    // Leave the real 15-second status polling intact. A partial pull can commit
    // another stream without changing queue counts or lastSyncedAt.
    lastSyncedAt = null;
    await window.loadURL(`${origin}/masters/units`);
    await waitFor("document.body.innerText.includes('The payment-term stream could not finish.') && document.body.innerText.includes('Corrected new unit')", "partial-sync baseline");
    // This harness deliberately hides its native window. Emulate foreground
    // visibility for React Query's normal interval policy; do not change the
    // application's polling interval or claim native focus acceptance.
    await evaluate("Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});window.dispatchEvent(new Event('visibilitychange'))");
    await new Promise((resolve) => setTimeout(resolve, 200));
    const beforeStatus = statusRequests, beforeUnits = unitRequests;
    units.push({ ...common, id: "partial-cloud-unit", code: "PART", name: "Cloud unit from partial sync", symbol: null, syncStatus: "SYNCED" });
    projectionRevision = "fixture-revision-2";
    await waitFor("document.body.innerText.includes('Cloud unit from partial sync')", "partial-sync cursor refresh without a successful sync timestamp", 250);
    assert.ok(statusRequests > beforeStatus, "Refresh must observe a later status poll");
    assert.ok(unitRequests > beforeUnits, "A changed projection must invalidate the master query");
    assert.equal(await evaluate("document.body.innerText.includes('Last sync:')"), false);
    checks.push("partial-sync-cursor-refresh-with-null-timestamp-and-unchanged-counts");
    legacy = true;
    await window.loadURL(`${origin}/masters/units`);
    await waitFor(`${banner}?.includes('categories work offline')`, "older category-pilot banner");
    checks.push("banner-old-category-pilot-fallback");
    return { result: "passed", scope: "compiled UI with intercepted fixtures; foreground visibility emulated for status polling; not cloud sync, persistence or native focus acceptance", checks };
  } finally { contents.session.protocol.unhandle("http"); }
};
