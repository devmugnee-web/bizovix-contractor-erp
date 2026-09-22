const assert = require("node:assert/strict");
const { net } = require("electron");

// Compiled component interaction fixtures only. These do not test accounting,
// authentication, backup persistence, cloud availability or real user data.
module.exports = async function rendererRegressionFixture(window, trace = () => {}) {
  const contents = window.webContents;
  const origin = new URL(contents.getURL()).origin;
  const evaluate = (script) => contents.executeJavaScript(script);
  const runtime = await evaluate("window.bizovix.getRuntimeInfo()");
  const apiOrigin = new URL(runtime.localApiUrl).origin;
  const checks = [];
  const loginRequests = [];
  const expenseRequests = [];
  let imageRequests = 0;
  let interceptionError;
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Bizovix-Local-Capability", "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS" };
  const user = { id: "fixture-user", organizationId: "fixture-tenant", email: "preview@example.test", name: "Preview Auditor", roleName: "Admin", permissions: ["masters.read", "report.view", "project_expense.create", "project_expense.read", "settings.read"] };
  const work = { id: "fixture-work", workName: "UI fixture project", status: "ONGOING", organizationMaster: { shortName: "Fixture" }, workCategory: "BUILDING", tenderNumber: "UI-001", contractValue: "1000.00" };
  const response = (data, extra = {}) => new Response(JSON.stringify({ success: true, data, ...extra }), { headers });
  contents.session.protocol.handle("http", async (request) => {
    try {
      const url = new URL(request.url);
      if (!url.pathname.startsWith("/api/v1/")) return net.fetch(request, { bypassCustomProtocolHandlers: true });
      assert.equal(url.origin, apiOrigin, "Tenant requests must use the owned desktop service");
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
      assert.equal(request.headers.get("X-Bizovix-Local-Capability"), runtime.localCapability, "Local request capability is required");
      const route = url.pathname.replace(/^\/api\/v1/, "");
      if (route === "/auth/login") {
        loginRequests.push(await request.json());
        return new Response(JSON.stringify({ success: false, code: "PROFILE_RECOVERY_REQUIRED", message: "Use your previous password to preserve this PC's saved work." }), { status: 409, headers });
      }
      if (route === "/auth/me") return response(user);
      if (route === "/desktop/status") return response({ lastSyncedAt: null, lastSyncError: null, storage: { pendingCount: 0, rejectedCount: 0 }, backup: { lastVerifiedAt: null, lastError: null, running: false } });
      if (route.includes("subscription")) return response({ status: "ACTIVE", plan: { name: "Fixture" } });
      if (route === "/reminders/stats") return response({ dueToday: 0, upcoming: 0, overdue: 0 });
      if (route === "/settings/company") return response({ legalName: "UI fixture company", hasLogo: true, hasSignature: false, hasSeal: false });
      if (route === "/settings/company/logo") {
        imageRequests += 1;
        return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="16"><rect width="32" height="16" fill="blue"/></svg>', { headers: { ...headers, "Content-Type": "image/svg+xml" } });
      }
      if (route === "/reports/transactions/all") {
        const page = Number(url.searchParams.get("page") || 1);
        const rows = page === 1 ? [{ journalId: "tx-1", voucher: "V001" }, { journalId: "tx-2", voucher: "V002" }] : [{ journalId: "tx-3", voucher: "V003" }, { journalId: "tx-4", voucher: "V004" }];
        return response({ columns: [{ key: "voucher", label: "Voucher", type: "text" }], rows, kpis: [], meta: { total: 4, totalPages: 2, page, limit: Number(url.searchParams.get("limit")) } });
      }
      if (route === "/cms/works/fixture-work") return response(work);
      if (route === "/cms/works") return response([work], { meta: { total: 1, totalPages: 1, page: 1, limit: 20 } });
      if (route === "/project-expenses/expense-heads") return response([{ id: "fixture-head", name: "Materials" }]);
      if (route === "/project-expenses/people") return response([{ id: "fixture-person", name: "Fixture Person" }]);
      if (route === "/bank-accounts") return response([{ id: "fixture-bank", accountName: "Fixture Bank", accountNumber: "0000", isActive: true }]);
      if (route === "/project-expenses") return response([], { meta: { total: 0, totalPages: 1, page: 1, limit: 5 } });
      if (route === "/project-expenses/batch") { expenseRequests.push(await request.json()); return response([]); }
      return response([]);
    } catch (error) { interceptionError = error; return new Response("Fixture failed", { status: 500, headers }); }
  });
  async function waitFor(script, label) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (interceptionError) throw interceptionError;
      if (typeof script === "function" ? await script() : await evaluate(script).catch(() => false)) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Renderer fixture timed out: ${label}`);
  }
  async function fill(selector, value) {
    await evaluate(`(() => { const input=document.querySelector(${JSON.stringify(selector)}); const prototype=input.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype,'value').set.call(input,${JSON.stringify(value)}); input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true})); })()`);
  }
  async function clickText(text) { await evaluate(`[...document.querySelectorAll('button')].find(button=>button.innerText.trim()===${JSON.stringify(text)}).click()`); }
  try {
    trace("regression-login-recovery");
    await evaluate("localStorage.removeItem('bizovix_access_token');localStorage.removeItem('bizovix_refresh_token')");
    await window.loadURL(`${origin}/login`);
    await waitFor("!!document.querySelector('input[type=email]')", "login form");
    await fill("input[type=email]", "preview@example.test");
    await fill('input[placeholder="Enter your password"]', "fixture-current-password");
    await evaluate("document.querySelector('form').requestSubmit()");
    await waitFor("!!document.querySelector('#previous-password')", "previous-password recovery control");
    assert.equal(loginRequests.length, 1);
    assert.equal(loginRequests[0].previousPassword, undefined);
    await fill("#previous-password", "fixture-previous-password");
    await evaluate("document.querySelector('form').requestSubmit()");
    await waitFor(() => loginRequests.length === 2, "second recovery request");
    await waitFor("!document.body.innerText.includes('Signing in...')", "recovery submit settled");
    assert.deepEqual(loginRequests[1], { email: "preview@example.test", password: "fixture-current-password", previousPassword: "fixture-previous-password" });
    await fill("input[type=email]", "other@example.test");
    await evaluate("document.querySelector('form').requestSubmit()");
    await waitFor("document.body.innerText.includes('For other@example.test')", "changed recovery identity");
    assert.equal(loginRequests[2].previousPassword, undefined);
    checks.push("recovery-input-after-coded-error", "previous-password-bound-to-email");

    await evaluate("localStorage.setItem('bizovix_access_token','isolated-ui-fixture');localStorage.setItem('bizovix_refresh_token','isolated-ui-fixture')");
    trace("regression-report-selection");
    await window.loadURL(`${origin}/reports/transactions/all`);
    const selected = "document.querySelector('input[aria-label=\"Select V001\"]')";
    await waitFor(`!!${selected}`, "transaction rows");
    await waitFor("[...document.querySelectorAll('button')].some(button=>button.innerText.trim()==='Export backup')", "desktop backup export action");
    checks.push("desktop-backup-export-action-visible");
    await evaluate(`${selected}.click()`);
    await clickText("Next");
    await waitFor("!!document.querySelector('input[aria-label=\"Select V003\"]')", "second transaction page");
    await clickText("Previous");
    await waitFor(`${selected}?.checked === true`, "selection retained across page navigation");
    await fill('input[aria-label="Search this report"]', "fixture");
    await waitFor(`${selected}?.checked === false`, "search clears selection");
    await evaluate(`${selected}.click()`);
    await fill('select:has(option[value="custom"])', "custom");
    assert.equal(await evaluate(`${selected}.checked`), true);
    await fill('input[aria-label="From date"]', "2020-01-01");
    await waitFor(`${selected}?.checked === false`, "date clears selection");
    await evaluate(`${selected}.click()`);
    await fill('select[aria-label="Rows per page"]', "50");
    await waitFor(`${selected}?.checked === false`, "page size clears selection");
    checks.push("report-selection-survives-pagination", "report-selection-clears-for-filter-changes");

    trace("regression-project-expense-save");
    await window.loadURL(`${origin}/expenses/project-expense?workId=fixture-work`);
    // Chromium suspends native animation frames in this hidden-window fixture,
    // even with background throttling disabled. Emulate a visible frame only
    // for this page so the actual post-save focus callback can be exercised.
    // This does not measure compositor timing or replace browser focus APIs.
    await evaluate("window.requestAnimationFrame=callback=>window.setTimeout(()=>callback(performance.now()),16);window.cancelAnimationFrame=handle=>window.clearTimeout(handle);void 0");
    await waitFor("document.querySelector('select[aria-label=\"Expense 1 head\"]')?.value==='fixture-head'", "expense defaults");
    await fill('input[aria-label="Expense 1 amount"]', "42.50");
    await fill('input[aria-label="Expense 1 description"]', "Fixture materials");
    await evaluate("document.querySelector('#expense-details form').requestSubmit()");
    await waitFor("document.body.innerText.includes('1 expense saved successfully.')", "expense saved notice");
    assert.equal(expenseRequests.length, 1);
    assert.deepEqual({ ...expenseRequests[0].expenses[0], expenseDate: "fixture-date" }, { workId: "fixture-work", expenseDate: "fixture-date", expenseHeadId: "fixture-head", amount: 42.5, expenseById: "fixture-person", paidFromAccountId: "fixture-bank", description: "Fixture materials" });
    try {
      await waitFor("document.activeElement?.getAttribute('aria-label')==='Expense 1 amount' && document.activeElement.value===''",
        "expense entry continues focused on a blank amount");
    } catch (error) {
      const state = await evaluate("({visibility:document.visibilityState,activeTag:document.activeElement?.tagName,activeLabel:document.activeElement?.getAttribute('aria-label'),amount:document.querySelector('input[aria-label=\"Expense 1 amount\"]')?.value})");
      throw new Error(`${error.message}; isolated fixture state: ${JSON.stringify(state)}`);
    }
    assert.equal(await evaluate("document.querySelector('select[aria-label=\"Expense 1 head\"]').value"), "fixture-head");
    checks.push("expense-save-payload", "expense-save-notice-reset-and-focus");

    trace("regression-company-blob-preview");
    await window.loadURL(`${origin}/settings/company`);
    await waitFor("(() => {const image=document.querySelector('img[alt=\"Company Logo\"]');return image?.src.startsWith('blob:') && image.complete && image.naturalWidth===32;})()", "company blob image");
    assert.equal(imageRequests, 1);
    checks.push("company-image-through-capability-transport", "company-svg-blob-renders");
    return { result: "passed", scope: "compiled UI with intercepted fixtures; expense animation frames emulated for the hidden window; not visible-window focus acceptance or end-to-end", checks };
  } finally { contents.session.protocol.unhandle("http"); }
};
