const assert = require("node:assert/strict");
const fs = require("node:fs");
const { net } = require("electron");

module.exports = async function categoryUiFixture(window, screenshotPath, trace = () => {}) {
  // This deliberately intercepts browser requests. It verifies the compiled UI,
  // not authentication, database persistence, cloud sync or financial behavior.
  const contents = window.webContents;
  const origin = new URL(contents.getURL()).origin;
  const timestamp = "2026-09-21T09:00:00.000Z";
  const category = (id, name, syncStatus) => ({ id, name, type: "VENDOR", description: `${name} description`, isActive: true, createdAt: timestamp, updatedAt: timestamp, syncStatus, version: 1 });
  const pending = category("fixture-pending", "Pending local category", "PENDING");
  const rejected = { ...category("fixture-rejected", "Preserved local category", "REJECTED"), syncError: { kind: "VERSION_CONFLICT", message: "Another PC updated this category. Review your saved change." }, cloudCategory: category("fixture-rejected", "Accepted cloud category", "SYNCED") };
  let categories = [pending, rejected];
  let backupCalls = 0;
  const mutations = [];
  let interceptionError;
  let screenshot;
  const handler = async (request) => {
    try {
      const url = new URL(request.url);
      if (!url.pathname.startsWith("/api/v1/")) return net.fetch(request, { bypassCustomProtocolHandlers: true });
      const route = url.pathname.replace(/^\/api\/v1/, "");
      let data = {};
      if (route === "/auth/me") data = { id: "fixture-user", organizationId: "fixture-tenant", email: "preview@example.test", name: "Preview Auditor", roleName: "Admin", permissions: ["masters.read", "vendor.create", "vendor.update"] };
      else if (route === "/desktop/status") data = { configured: true, localAvailable: true, lastSyncedAt: timestamp, lastSyncError: null, backup: { lastVerifiedAt: backupCalls ? timestamp : null, lastError: null, running: false }, storage: { pendingCount: categories.filter((item) => item.syncStatus === "PENDING").length, rejectedCount: categories.filter((item) => item.syncStatus === "REJECTED").length } };
      else if (route === "/desktop/backup" && request.method === "POST") { backupCalls += 1; data = { lastVerifiedAt: timestamp }; }
      else if (route.includes("subscription")) data = { status: "ACTIVE", plan: { name: "Preview" } };
      else if (route === "/reminders/stats") data = { dueToday: 0, upcoming: 0, overdue: 0 };
      else if (route === "/master-categories" && request.method === "GET") data = categories;
      else if (route.startsWith("/master-categories") && ["PATCH", "POST"].includes(request.method)) {
        trace(`fixture-intercept-${request.method}`);
        const body = await request.json();
        mutations.push({ method: request.method, route, body });
        data = { ...category(request.method === "POST" ? "fixture-created" : rejected.id, body.name, "PENDING"), ...body };
        categories = request.method === "POST" ? [...categories, data] : categories.map((item) => item.id === rejected.id ? data : item);
      }
      return new Response(request.method === "OPTIONS" ? null : JSON.stringify({ success: true, data }), {
        status: request.method === "OPTIONS" ? 204 : 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Bizovix-Local-Capability",
          "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
        },
      });
    } catch (error) { interceptionError = error; return new Response("Fixture failed", { status: 500 }); }
  };
  contents.session.protocol.handle("http", handler);
  trace("fixture-protocol-enabled");
  const evaluate = (script) => contents.executeJavaScript(script);
  async function waitFor(script) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (interceptionError) throw interceptionError;
      if (await evaluate(script)) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("Category UI fixture timed out");
  }
  async function fill(name, description) {
    await evaluate(`(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      for (const [placeholder, value] of ${JSON.stringify([["Category name", name], ["Description (optional)", description]])}) {
        const input = document.querySelector('input[placeholder="' + placeholder + '"]');
        setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`);
  }
  try {
    await evaluate("localStorage.setItem('bizovix_access_token','isolated-ui-fixture');localStorage.setItem('bizovix_refresh_token','isolated-ui-fixture');");
    await window.loadURL(`${origin}/masters/categories`);
    trace("fixture-categories-loaded");
    await waitFor("document.body.innerText.includes('Preserved local category') && document.body.innerText.includes('Pending local category')");
    await evaluate("[...document.querySelectorAll('button')].find(button=>button.innerText==='Back up now').click()");
    await waitFor("document.body.innerText.includes('Local backup:')");
    assert.equal(backupCalls, 1);
    const pendingState = await evaluate("(() => { const row=[...document.querySelectorAll('tr')].find(row=>row.innerText.includes('Pending local category'));return {disabled:row.querySelector('button').disabled,label:row.innerText}; })()");
    assert.equal(pendingState.disabled, true);
    trace("fixture-pending-asserted");
    assert.match(pendingState.label, /waiting to sync/);
    await evaluate("[...document.querySelectorAll('tr')].find(row=>row.innerText.includes('Preserved local category')).querySelector('button').click()");
    await waitFor("document.body.innerText.includes('Current cloud value:') && document.querySelector('input[placeholder=\"Category name\"]').value === 'Preserved local category'");
    const review = await evaluate("({text:document.body.innerText,name:document.querySelector('input[placeholder=\"Category name\"]').value,description:document.querySelector('input[placeholder=\"Description (optional)\"]').value})");
    assert.match(review.text, /Accepted cloud category/);
    assert.match(review.text, /Another PC updated this category/);
    assert.equal(review.description, "Preserved local category description");
    trace("fixture-review-asserted");
    if (screenshotPath) {
      try { fs.writeFileSync(screenshotPath, (await contents.capturePage()).toPNG()); screenshot = { result: "captured" }; }
      catch (error) { screenshot = { result: "failed", reason: error.message }; }
    }
    await fill("Reviewed local category", "Reviewed description");
    trace("fixture-review-filled");
    await evaluate("document.querySelector('input[type=checkbox]').click()");
    trace("fixture-review-checkbox-clicked");
    await evaluate("[...document.querySelectorAll('button')].find(button=>button.innerText.includes('Queue reviewed change')).click()");
    trace("fixture-review-queue-clicked");
    await waitFor("document.body.innerText.includes('Reviewed local category') && !document.body.innerText.includes('Review saved category')");
    assert.deepEqual(mutations[0], { method: "PATCH", route: "/master-categories/fixture-rejected", body: { type: "VENDOR", name: "Reviewed local category", description: "Reviewed description", isActive: false } });
    trace("fixture-review-submitted");
    await fill("Created in UI fixture", "New fixture description");
    await evaluate("[...document.querySelectorAll('button')].find(button=>button.innerText.includes('Add Category')).click()");
    await waitFor("document.body.innerText.includes('Created in UI fixture')");
    assert.deepEqual(mutations[1], { method: "POST", route: "/master-categories", body: { type: "VENDOR", name: "Created in UI fixture", description: "New fixture description" } });
    trace("fixture-create-submitted");
    return { result: "passed", scope: "compiled category UI with intercepted fixture responses; not end-to-end", screenshot, checks: ["backup-request-and-status", "pending-action-disabled", "rejection-message", "preserved-local-and-cloud-review", "review-patch-fields", "create-post-fields"] };
  } finally {
    contents.session.protocol.unhandle("http");
  }
};
