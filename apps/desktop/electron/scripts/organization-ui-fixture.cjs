const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { net } = require("electron");

// Intercepted responses exercise the compiled UI only. Reload recovery here
// means React state is lost; storage durability is tested by the local service.
module.exports = async function organizationUiFixture(window, trace = () => {}) {
  const contents = window.webContents;
  const evaluate = (script) => contents.executeJavaScript(script);
  const origin = new URL(contents.getURL()).origin;
  const runtime = await evaluate("window.bizovix.getRuntimeInfo()");
  const apiOrigin = new URL(runtime.localApiUrl).origin;
  const checks = [], mutations = [], requests = [];
  const base = { organizationId: "fixture-tenant", version: 1, createdAt: "2026-09-21T09:00:00.000Z", updatedAt: "2026-09-21T09:00:00.000Z" };
  const records = [
    { ...base, id: "cloud-org", shortName: "Cloud", fullName: "Accepted organization", syncStatus: "SYNCED" },
    { ...base, id: "pending-org", shortName: "Pending", fullName: "Pending organization", syncStatus: "PENDING" },
    { ...base, id: "rejected-org", shortName: "Duplicate", fullName: "Preserved rejected organization", syncStatus: "REJECTED", syncError: { kind: "VALIDATION", message: "Choose an unused short name." } },
    { ...base, id: "recovery-org", shortName: "Recovery", fullName: "Recover after restart", syncStatus: "REJECTED", syncError: { kind: "VALIDATION", message: "Choose an unused short name." } },
  ];
  let jwtOnly = false, legacyGrant = false, searchIndexReady = true, interceptionError, reviewScreenshot;
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Bizovix-Local-Capability", "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS" };
  const response = (data, extra = {}) => new Response(JSON.stringify({ success: true, data, ...extra }), { headers });
  contents.session.protocol.handle("http", async (request) => {
    try {
      const url = new URL(request.url);
      if (!url.pathname.startsWith("/api/v1/")) return net.fetch(request, { bypassCustomProtocolHandlers: true });
      assert.equal(url.origin, apiOrigin);
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
      assert.equal(request.headers.get("X-Bizovix-Local-Capability"), runtime.localCapability);
      const route = url.pathname.replace(/^\/api\/v1/, "");
      requests.push({ route, method: request.method, search: url.search, jwtOnly });
      if (route === "/auth/me") return response({ id: "fixture-user", organizationId: "fixture-tenant", email: "preview@example.test", name: "Preview Auditor", roleName: "Member", permissions: jwtOnly ? ["document_purchase.create"] : ["masters.read", "document_purchase.create"] });
      if (route === "/desktop/status") return response({ lastSyncedAt: null, storage: { pendingCount: 1, rejectedCount: 2 }, rollout: "master-data-pilot", offlineModules: legacyGrant ? ["master-categories"] : searchIndexReady ? ["organizations"] : [], organizationDraftRecoveryAvailable: !legacyGrant });
      if (route.includes("subscription")) return response({ status: "ACTIVE", plan: { name: "Fixture" } });
      if (route === "/reminders/stats") return response({ dueToday: 0, upcoming: 0, overdue: 0 });
      if (route === "/organizations/all") {
        assert.equal(jwtOnly, false, "JWT-only draft recovery must not use the masters-only list");
        assert.equal(url.searchParams.get("includeLocal"), "true");
        return response(records, { meta: { page: 1, limit: 10, total: records.length, totalPages: 1 } });
      }
      if (route === "/organizations" && request.method === "GET") {
        assert.equal(url.searchParams.has("includeLocal"), false, "Document selectors must keep accepted-only lookups");
        // Include drafts deliberately: the client must defensively exclude IDs.
        return response(records);
      }
      if (route === "/desktop/organization-drafts") return response(records.filter((record) => record.syncStatus !== "SYNCED"));
      if (route === "/organizations" && request.method === "POST") {
        const body = await request.json();
        mutations.push({ route, method: request.method, body });
        const record = { ...base, id: `created-org-${mutations.length}`, ...body, syncStatus: "PENDING" };
        records.push(record);
        return response(record);
      }
      if (route.startsWith("/desktop/organization-drafts/")) {
        const record = records.find((item) => route.endsWith(`/${item.id}`));
        assert.ok(record);
        if (request.method === "PATCH") {
          assert.equal(record.syncStatus, "REJECTED");
          const body = await request.json();
          mutations.push({ route, method: request.method, body });
          Object.assign(record, body, { syncStatus: "PENDING", syncError: undefined });
        }
        return response(record);
      }
      assert.ok(!route.startsWith("/organizations/"), "There is no accepted organization update endpoint");
      return response([]);
    } catch (error) { interceptionError = error; return new Response("Fixture failed", { status: 500, headers }); }
  });
  async function waitFor(script, label, attempts = 100) {
    for (let count = 0; count < attempts; count++) {
      if (interceptionError) throw interceptionError;
      if (await evaluate(script).catch(() => false)) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Organization UI fixture timed out: ${label}`);
  }
  async function fill(selector, value) {
    await evaluate(`(() => {const input=document.querySelector(${JSON.stringify(selector)});const prototype=input.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
  }
  const click = (label, scope = "document") => evaluate(`[...${scope}.querySelectorAll('button')].find(button=>button.innerText.trim()===${JSON.stringify(label)}).click()`);
  const shortInput = 'input[placeholder="e.g. DPHE"]';
  const fullInput = 'input[placeholder="e.g. Department of Public Health Engineering"]';
  const recoverySelect = 'select[aria-label="Saved organization drafts"]';
  const orgSelector = 'input[placeholder="Search organization by short name or full name..."]';
  const dialog = "document.querySelector('[role=dialog]')";
  try {
    trace("organization-management");
    await window.loadURL(`${origin}/masters/organizations`);
    await waitFor("document.body.innerText.includes('Preserved rejected organization')", "management rows");
    assert.equal(await evaluate("[...document.querySelectorAll('tr')].find(row=>row.innerText.includes('Pending organization')).querySelector('button')===null"), true);
    assert.equal(await evaluate("[...document.querySelectorAll('tr')].find(row=>row.innerText.includes('Accepted organization')).querySelector('button')===null"), true);
    await evaluate("[...document.querySelectorAll('tr')].find(row=>row.innerText.includes('Preserved rejected organization')).querySelector('button').click()");
    await waitFor("document.body.innerText.includes('This saved record has not been accepted by the cloud.')", "rejected review");
    await fill('input[placeholder="Short name (e.g. LGED)"]', " Revised ");
    await fill('input[placeholder="Full name"]', " Exact Reviewed Name ");
    await click("Queue reviewed organization");
    await waitFor("document.body.innerText.includes('Exact Reviewed Name') && !document.body.innerText.includes('Close review')", "revision queued");
    assert.deepEqual(mutations[0], { route: "/desktop/organization-drafts/rejected-org", method: "PATCH", body: { shortName: " Revised ", fullName: " Exact Reviewed Name " } });
    checks.push("organization-management-drafts-visible", "accepted-and-pending-organizations-have-no-edit", "rejected-create-review-preserves-raw-names-and-id");

    jwtOnly = true;
    trace("organization-inline-jwt-only");
    await window.loadURL(`${origin}/bank-instruments/document-purchase/create`);
    await waitFor(`!!document.querySelector(${JSON.stringify(orgSelector)})`, "document form");
    await waitFor("[...document.querySelectorAll('[role=status]')].some(element=>element.textContent.includes('organizations work offline'))", "JWT-only organization status");
    assert.equal(await evaluate("[...document.querySelectorAll('[role=status] a')].some(link=>link.getAttribute('href')==='/masters/organizations')"), false);
    checks.push("jwt-only-status-does-not-link-to-masters-only-management");
    await fill('input[placeholder="Enter tender / work name"]', "Unsaved document work");
    await fill(orgSelector, "Cl");
    await waitFor("[...document.querySelectorAll('button')].some(button=>button.innerText.includes('Accepted organization'))", "accepted selector");
    assert.equal(await evaluate("[...document.querySelectorAll('button')].some(button=>button.innerText.includes('Pending organization') || button.innerText.includes('Recover after restart'))"), false);
    checks.push("organization-selector-excludes-unaccepted-identities");
    await click("Add New Organization");
    await waitFor(`!!document.querySelector(${JSON.stringify(recoverySelect)})`, "draft recovery list");
    await fill(shortInput, " New inline ");
    await fill(fullInput, " Newly created inline organization ");
    await click("Save", dialog);
    await waitFor(`${dialog}?.innerText.includes('Waiting to sync')`, "inline saved pending");
    assert.deepEqual(mutations.at(-1), { route: "/organizations", method: "POST", body: { shortName: " New inline ", fullName: " Newly created inline organization " } });
    assert.equal(await evaluate("document.querySelector('input[type=hidden]').value"), "");
    await click("Close", dialog);
    assert.equal(await evaluate("document.querySelector('input[placeholder=\"Enter tender / work name\"]').value"), "Unsaved document work");
    checks.push("inline-create-keeps-document-values-and-does-not-select-pending-id");

    // Full renderer reload removes every modal state/ref while the fixture's
    // local draft endpoint retains its rows, like the real persisted service.
    searchIndexReady = false;
    await window.loadURL(`${origin}/bank-instruments/document-purchase/create`);
    await waitFor(`!!document.querySelector(${JSON.stringify(orgSelector)})`, "reloaded document form");
    await click("Add New Organization");
    await waitFor(`!!document.querySelector(${JSON.stringify(recoverySelect)})`, "recovered list after renderer reload");
    await fill(shortInput, "Unsaved new");
    await fill(fullInput, "Unsaved new full name");
    await fill(recoverySelect, "pending-org");
    await waitFor(`document.querySelector(${JSON.stringify(shortInput)})?.value==='Pending' && document.querySelector(${JSON.stringify(shortInput)}).disabled`, "pending recovery remains visible and read-only without search index");
    assert.equal(await evaluate(`${dialog}.innerText.includes('Use organization')`), false);
    await fill(recoverySelect, "recovery-org");
    await waitFor(`document.querySelector(${JSON.stringify(shortInput)})?.value==='Recovery'`, "explicit recovered draft");
    await fill(shortInput, "Corrected recovery");
    await fill(fullInput, "Corrected recovered organization");
    await fill(recoverySelect, "");
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(shortInput)}).value`), "Unsaved new");
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(fullInput)}).value`), "Unsaved new full name");
    await fill(recoverySelect, "recovery-org");
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(shortInput)}).value`), "Corrected recovery");
    assert.equal(await evaluate(`(() => {const bounds=${dialog}.getBoundingClientRect();return bounds.top>=0 && bounds.bottom<=innerHeight && bounds.left>=0 && bounds.right<=innerWidth;})()`), true);
    if (process.env.BIZOVIX_SMOKE_SCREENSHOT) {
      try {
        const filename = path.join(path.dirname(process.env.BIZOVIX_SMOKE_SCREENSHOT), "desktop-organization-recovery-fixture.png");
        fs.writeFileSync(filename, (await contents.capturePage()).toPNG());
        reviewScreenshot = { result: "captured", filename };
      } catch (error) { reviewScreenshot = { result: "failed", reason: error.message }; }
    }
    await click("Queue reviewed organization", dialog);
    await waitFor(`${dialog}?.innerText.includes('Waiting to sync')`, "recovered create queued");
    assert.equal(await evaluate("document.querySelector('input[type=hidden]').value"), "");
    assert.deepEqual(mutations.at(-1), { route: "/desktop/organization-drafts/recovery-org", method: "PATCH", body: { shortName: "Corrected recovery", fullName: "Corrected recovered organization" } });
    checks.push("jwt-only-reload-recovery-works-with-invalidated-search-index", "pending-recovery-remains-visible-and-cannot-be-selected", "recovery-switching-preserves-both-unsaved-forms", "recovered-create-revises-same-id-without-selecting-it");
    Object.assign(records.find((record) => record.id === "recovery-org"), { syncStatus: "SYNCED", version: 1 });
    await click("Close", dialog);
    await click("Add New Organization");
    await waitFor(`${dialog}?.innerText.includes('Use organization')`, "accepted same-ID detail on reopen");
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(recoverySelect)}).selectedOptions[0].text.includes('(synced)')`), true);
    await click("Use organization", dialog);
    await waitFor("!document.querySelector('[role=dialog]')", "accepted selection");
    assert.equal(await evaluate("document.querySelector('input[type=hidden]').value"), "recovery-org");
    assert.equal(await evaluate(`document.querySelector(${JSON.stringify(orgSelector)}).value`), "Corrected recovery");
    assert.equal(requests.some((request) => request.jwtOnly && request.route === "/organizations/all"), false);
    assert.equal(requests.some((request) => request.route === "/document-purchases" && request.method !== "GET"), false);
    checks.push("only-accepted-same-id-is-selected-for-document");
    legacyGrant = true;
    const draftCallsBefore = requests.filter((request) => request.route.startsWith("/desktop/organization-drafts")).length;
    await window.loadURL(`${origin}/bank-instruments/document-purchase/create`);
    await waitFor(`!!document.querySelector(${JSON.stringify(orgSelector)})`, "legacy document form");
    await click("Add New Organization");
    await waitFor(`${dialog}?.innerText.includes('Short Name')`, "legacy create modal");
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(requests.filter((request) => request.route.startsWith("/desktop/organization-drafts")).length, draftCallsBefore);
    assert.equal(await evaluate(`!!${dialog}.querySelector('[role=alert]')`), false);
    checks.push("old-grant-create-modal-does-not-request-unsupported-draft-recovery");
    return { result: "passed", scope: "compiled organization UI with intercepted fixtures; full renderer reload proves modal-state-independent recovery; not actual disk persistence, cloud authentication or cloud sync", reviewScreenshot, checks };
  } finally { contents.session.protocol.unhandle("http"); }
};
