// Read-only real API/browser regression. Never creates, submits or certifies a bill.
// Usage: node scripts/check-bill-workspace.mjs <playwrightModule> <chromiumExecutable>
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const base = "http://127.0.0.1:4000/api/v1";
const login = await fetch(`${base}/auth/dev-login`, { method: "POST" }).then((r) => r.json());
assert.ok(login.data?.accessToken, "Expected ERP API login");
async function api(route, body) {
  const response = await fetch(base + route, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${login.data.accessToken}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.ok(response.ok, `${route}: HTTP ${response.status} ${response.ok ? "" : await response.text()}`);
  const result = await response.json();
  return { data: result.data, meta: result.meta };
}
const sources = await api("/project-bills/sources?kind=tenders&limit=50");
const projects = await api("/project-bills/sources?kind=projects&limit=50");
assert.ok(Array.isArray(sources.data));
assert.ok(Array.isArray(projects.data));
const originalBills = await api("/project-bills?limit=100");
const pagination = await api("/project-bills/sources?kind=tenders&limit=1&page=1");
assert.ok(pagination.data.length <= 1);
for (const source of sources.data) {
  const reference = await api(`/project-bills/sources/${source.tenderId}/items`);
  assert.equal(reference.data.length, source.costedItemCount);
  for (const item of reference.data) assert.deepEqual(Object.keys(item).sort(), ["description", "id", "quantity", "unit"]);
}
let ready;
for (const project of projects.data) {
  const prep = (await api(`/project-bills/preparation/${project.id}`)).data;
  if (prep.ready && !ready) ready = prep;
}
console.log(`Live API: ${sources.data.length} costed tenders; ${projects.data.length} projects; bill-ready example ${Boolean(ready)}.`);
const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const browser = await chromium.launch({ headless: true, executablePath: process.argv[3] });
const screenshots = await mkdtemp(path.join(tmpdir(), "bizovix-bill-workspace-"));
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.setDefaultTimeout(20000);
  page.on("response", (response) => { if (response.status() >= 400 && /project-bills/.test(response.url())) console.log("Billing request error:", response.status(), response.url()); });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Fail closed: navigation/testing must never write a bill or BOQ.
  await page.route((url) => /^\/api\/(v1|backend)\//.test(url.pathname), async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname.replace(/^\/api\/backend/, "/api/v1");
    if (!["GET", "OPTIONS"].includes(request.method()) && !pathname.includes("/auth/") && pathname !== "/api/v1/project-bills/preview") {
      throw new Error(`Unexpected write request: ${request.method()} ${pathname}`);
    }
    await route.continue();
  });
  await page.goto("http://localhost:3010/cms/documentation/bill-submission");
  await page.getByRole("heading", { name: /Costed Tenders/ }).waitFor();
  await page.screenshot({ path: path.join(screenshots, "workspace-desktop.png"), fullPage: true });
  // Project costing selection and downloads are covered by check-project-costing-workspace.mjs.
  // Preserve read-only regression coverage for the separate existing bill form below.
  if (ready) {
    await page.goto(`http://localhost:3010/cms/bills/create?cmsWorkId=${ready.work.id}`);
    const quantities = page.locator("input[data-bill-quantity]");
    await quantities.first().waitFor();
    const expected = ready.items.filter((item) => Number(item.remainingQty) > 0);
    assert.equal(await quantities.count(), expected.length);
    assert.ok((await quantities.evaluateAll((inputs) => inputs.map((input) => input.value))).every((value) => value === ""));
    await page.getByRole("button", { name: "Preview Bill", exact: true }).click();
    assert.equal(await quantities.first().getAttribute("aria-invalid"), "true");
    const item = expected.find((row) => Number(row.unitRate) > 0);
    const quantity = Math.min(1, Number(item.remainingQty));
    const target = page.locator(`[data-bill-quantity="${item.id}"]`);
    await target.fill(String(quantity));
    const previewPromise = page.waitForResponse((response) => response.url().includes("/project-bills/preview"));
    await page.getByRole("button", { name: "Preview Bill", exact: true }).click();
    const previewResponse = await previewPromise;
    assert.equal(previewResponse.status(), 201);
    const preview = (await previewResponse.json()).data;
    assert.equal(Number(preview.grossWorkValue), Number((quantity * Number(item.unitRate)).toFixed(2)));
    await page.getByRole("heading", { name: "Bill Preview", exact: true }).waitFor();
    await page.screenshot({ path: path.join(screenshots, "bill-preview.png"), fullPage: true });
    await page.getByRole("button", { name: "Close modal", exact: true }).click();
    for (const width of [1366, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.getByRole("heading", { name: "Contract BOQ Items", exact: true }).scrollIntoViewIfNeeded();
      assert.equal(await page.locator(".bill-intake-table").evaluate((table) => table.scrollWidth > table.clientWidth + 1), false, `BOQ overflow at ${width}`);
      await page.screenshot({ path: path.join(screenshots, `bill-form-${width}.png`), fullPage: true });
    }
    console.log("Live form: automatic BOQ rows, blank quantities, required-field focus and authoritative preview passed.");
  }
  if (originalBills.data.length) {
    await page.context().addInitScript(() => { window.print = () => { document.documentElement.dataset.printRequested = "true"; }; });
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto(`http://localhost:3010/cms/bills/${originalBills.data[0].id}`);
    const popupPromise = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Print / PDF", exact: true }).click();
    const popup = await popupPromise;
    await popup.getByRole("heading", { name: "Bill Submission", exact: true }).waitFor();
    assert.ok((await popup.locator("body").innerText()).includes(originalBills.data[0].billNo));
    assert.ok(!/Internal Cost|Purchase Cost|Foreign Profit|Local Profit|marginPercent|unitCost/.test(await popup.content()));
    await popup.screenshot({ path: path.join(screenshots, "client-bill-print.png"), fullPage: true });
    await popup.close();
    console.log("Client print: correct saved bill and approved rates; no internal costing fields.");
  }
  await page.goto("http://localhost:3010/cms/documentation/bill-submission");
  await page.getByRole("heading", { name: /Costed Tenders/ }).waitFor();
  for (const width of [1366, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, `Page overflow at ${width}`);
    await page.screenshot({ path: path.join(screenshots, `workspace-${width}.png`), fullPage: true });
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(await api("/project-bills?limit=100"), originalBills, "Saved bill records must remain unchanged");
  console.log(`Passed real read-only browser checks. Screenshots: ${screenshots}`);
} finally {
  const page = browser.contexts()[0]?.pages()[0];
  if (page) await page.screenshot({ path: path.join(screenshots, "last-state.png"), fullPage: true });
  console.log(`Browser artifacts: ${screenshots}`);
  await browser.close();
}
