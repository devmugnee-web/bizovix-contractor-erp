// Real authenticated, read-only checks: no submissions, delivery confirmations,
// fixtures or printer jobs are written to the ERP.
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { extractText } from "unpdf";
const require = createRequire(import.meta.url);
const zip = require(require.resolve("jszip", { paths: [require.resolve("docx")] }));
const normalize = (value) => value.replace(/\s+/g, " ").trim();
function wordText(xml) {
  return normalize([...xml.matchAll(/<w:t(?:\s[^>]*)?>(.*?)<\/w:t>/gs)].map((match) => match[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")).join(" "));
}
const apiBase = "http://127.0.0.1:4000/api/v1";
const routeBase = "/challan-submissions/costing/tenders";
const login = await fetch(`${apiBase}/auth/dev-login`, { method: "POST" }).then((r) => r.json());
const headers = { Authorization: `Bearer ${login.data.accessToken}` };
async function read(route) {
  const response = await fetch(apiBase + route, { headers });
  assert.equal(response.status, 200, route); return response.json();
}
const before = await read(`${routeBase}?limit=100`);
const billsBefore = await read("/project-bills/costing/tenders?limit=100");
const savedBefore = await read("/challan-submissions?limit=100");
assert.ok(before.data.length);
assert.deepEqual(before.data.map((item) => item.id), billsBefore.data.map((item) => item.id), "Exactly the Bill Submission tenders");
function noMoney(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert.ok(!/^(unitPrice|totalPrice|totalCost|estimatedCost|rate|amount|grandTotal|unitRate|profit|vat|tax)$/i.test(key), `Unexpected financial field ${key}`);
    noMoney(child);
  }
}
noMoney(before.data);
for (const tender of before.data) {
  const report = (await read(`${routeBase}/${tender.id}`)).data;
  const bill = (await read(`/project-bills/costing/tenders/${tender.id}`)).data;
  noMoney(report);
  assert.deepEqual(report.rows.map(({ id, productName, unit, quantity }) => ({ id, productName, unit, quantity })), bill.rows.map(({ id, productName, unit, quantity }) => ({ id, productName, unit, quantity })));
  assert.equal(report.rows.length, tender.itemCount);
  for (const field of ["name", "designation", "phone", "address"]) assert.equal(report.pa[field], bill.pa[field]);
}
const target = before.data.find((item) => item.tenderNumber === (process.argv[4] || "1318963")) || before.data[0];
const reportBefore = (await read(`${routeBase}/${target.id}`)).data;
const tenderBefore = (await read(`/tenders/${target.tenderId}`)).data;
assert.equal(reportBefore.pa.name, tenderBefore.paName || null);
assert.deepEqual((await read(`${routeBase}?page=2&limit=2`)).data.map((item) => item.id), before.data.slice(2, 4).map((item) => item.id));
assert.deepEqual((await read(`${routeBase}?search=${encodeURIComponent(target.tenderNumber)}`)).data.map((item) => item.id), [target.id]);
assert.equal((await read(`${routeBase}?search=unmatched-fixture-6789`)).data.length, 0);
assert.equal((await fetch(apiBase + routeBase)).status, 401);
assert.equal((await fetch(`${apiBase}${routeBase}/unknown`, { headers })).status, 404);
assert.equal((await fetch(`${apiBase}${routeBase}/unknown/pdf`, { headers })).status, 404);
assert.equal((await fetch(`${apiBase}${routeBase}/${target.id}/pdf?date=2026-02-30`, { headers })).status, 400);
console.log(`PASS API: ${before.data.length} matching costed tenders, all products/PA, no financial fields, pagination/search/auth/validation`);

const artifacts = await mkdtemp(path.join(tmpdir(), "bizovix-tender-challan-"));
const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const browser = await chromium.launch({ headless: true, executablePath: process.argv[3] });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  page.setDefaultTimeout(25000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.__challanPrints = 0;
    window.print = () => { throw new Error("Never print the ERP page"); };
    const descriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "contentWindow");
    Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", { ...descriptor, get() {
      const target = descriptor.get.call(this);
      if (target && this.title === "Challan print document") target.print = () => { window.__challanPrints++; };
      return target;
    } });
  });
  let failPdf = false;
  await page.route((url) => /^\/api\/(v1|backend)\//.test(url.pathname), async (route) => {
    const request = route.request();
    assert.ok(["GET", "OPTIONS"].includes(request.method()) || request.url().includes("/auth/"), `Unexpected business write ${request.url()}`);
    if (failPdf && new URL(request.url()).pathname.endsWith(`${routeBase}/${target.id}/pdf`)) return route.fulfill({ status: 500, json: { message: "Unavailable" } });
    return route.continue();
  });
  await page.goto("http://localhost:3010/cms/documentation/challan-submission");
  await page.getByRole("heading", { name: "Costed Tenders" }).waitFor();
  await page.locator("[data-costing-id]").first().waitFor();
  assert.deepEqual(await page.getByRole("table", { name: "Costed tenders" }).locator("th").allTextContents(), ["SL", "Tender ID", "Work Name", "PA Name", "Products"]);
  async function noOverflow() {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "No page horizontal scrolling");
  }
  for (const width of [1366, 768, 390]) {
    await page.setViewportSize({ width, height: 900 }); await noOverflow();
    await page.screenshot({ path: path.join(artifacts, `list-${width}.png`) });
  }
  await page.setViewportSize({ width: 1366, height: 900 });
  const search = page.getByRole("textbox", { name: "Search costed tenders" });
  await search.fill("unmatched-fixture-6789");
  await page.getByText("No completed tender costings found.").waitFor();
  await search.fill(target.tenderNumber);
  await page.locator(`[data-costing-id="${target.id}"]`).getByRole("button", { name: target.tenderNumber, exact: true }).click();
  await page.getByRole("heading", { name: "Product Details", exact: true }).waitFor();
  assert.equal(await page.getByRole("table", { name: "Challan products" }).locator("tbody tr").count(), reportBefore.rows.length);
  assert.deepEqual(await page.getByRole("table", { name: "Challan products" }).locator("th").allTextContents(), ["SL", "Product Name", "Unit", "Quantity", "Place of Delivery"]);
  const deliveryInput = page.getByRole("textbox", { name: "Place of Delivery", exact: true });
  const expectedAddress = (reportBefore.pa.address || "").trim().replace(/^(?:address\s*[:：]\s*)+/i, "").trim();
  assert.ok(expectedAddress, "A saved PA address is required for this read-only check");
  assert.equal(await deliveryInput.inputValue(), expectedAddress, "Defaults to this tender's saved PA address");
  assert.ok(!/^address\s*[:：]/i.test(await deliveryInput.inputValue()), "No imported field label in delivery input");
  for (const cell of await page.getByRole("table", { name: "Challan products" }).locator("tbody tr td:last-child").allTextContents()) assert.equal(cell.trim(), expectedAddress);
  for (const format of ["PDF", "Word"]) {
    const defaultDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: `Download ${format}`, exact: true }).click();
    const downloaded = await defaultDownload;
    const filename = path.join(artifacts, `pa-default.${format === "PDF" ? "pdf" : "docx"}`);
    await downloaded.saveAs(filename);
    const bytes = await readFile(filename);
    const content = format === "PDF" ? normalize((await extractText(new Uint8Array(bytes), { mergePages: true })).text)
      : wordText(await (await zip.loadAsync(bytes)).file("word/document.xml").async("string"));
    const goods = content.slice(content.indexOf("Place of Delivery"));
    assert.equal(goods.split(normalize(expectedAddress)).length - 1, reportBefore.rows.length, `${format}: PA address in every delivery cell, not only the recipient`);
  }
  await page.getByRole("textbox", { name: "Ref", exact: true }).fill("PDF-ONLY-REF/123");
  await page.locator('input[type="date"]').fill("2026-09-06");
  await deliveryInput.fill("Address : PDF-only delivery site"); await deliveryInput.blur();
  assert.equal(await deliveryInput.inputValue(), "PDF-only delivery site", "Manual address labels are removed too");
  const download = page.getByRole("button", { name: "Download PDF", exact: true });
  const downloadPromise = page.waitForEvent("download");
  await download.click();
  const output = await downloadPromise;
  assert.equal(output.suggestedFilename(), `challan-${target.tenderNumber}.pdf`);
  const file = path.join(artifacts, output.suggestedFilename()); await output.saveAs(file);
  const { text } = await extractText(new Uint8Array(await readFile(file)), { mergePages: true });
  const flat = text.replace(/\s+/g, " ");
  for (const value of ["Challan", "PDF-ONLY-REF/123", "06-Sept-2026", "PDF-only delivery site", "Name of Goods", "Place of Delivery", "Yours Truly,"]) assert.ok(flat.includes(value), value);
  if (reportBefore.pa.name) assert.ok(flat.includes(reportBefore.pa.name));
  assert.ok(!/Grand Total|Unit BDT|Total BDT|In Words|Discount/.test(text));
  await page.getByRole("button", { name: "Print", exact: true }).click();
  await page.waitForFunction(() => window.__challanPrints === 1);
  await page.locator('iframe[title="Challan print document"]').evaluate((frame) => frame.contentWindow.dispatchEvent(new Event("afterprint")));
  await page.locator('iframe[title="Challan print document"]').waitFor({ state: "detached" });
  failPdf = true;
  await download.click(); await page.locator('p[role="alert"]').waitFor();
  assert.ok(await download.isEnabled()); failPdf = false;
  await page.getByRole("button", { name: "Print", exact: true }).click();
  await page.waitForFunction(() => window.__challanPrints === 2);
  assert.equal(await page.locator('p[role="alert"]').count(), 0, "Successful retry clears the error");
  await page.locator('iframe[title="Challan print document"]').evaluate((frame) => frame.contentWindow.dispatchEvent(new Event("afterprint")));
  await page.locator('iframe[title="Challan print document"]').waitFor({ state: "detached" });
  for (const width of [1366, 768, 390]) {
    await page.setViewportSize({ width, height: 900 }); await noOverflow();
    await page.screenshot({ path: path.join(artifacts, `detail-${width}.png`) });
  }
  await page.getByRole("button", { name: "All Tenders", exact: true }).click();
  assert.equal(await search.inputValue(), target.tenderNumber, "Preserve list search when returning");
  await page.reload();
  await page.locator(`[data-costing-id="${target.id}"]`).getByRole("button", { name: target.tenderNumber, exact: true }).click();
  await page.getByRole("heading", { name: "Product Details", exact: true }).waitFor();
  assert.equal(await deliveryInput.inputValue(), expectedAddress, "Reload restores the PA delivery address without saving a duplicate");
  await deliveryInput.fill(" "); await deliveryInput.blur();
  assert.equal(await deliveryInput.inputValue(), expectedAddress, "Clearing a temporary override restores PA address");
  await page.screenshot({ path: path.join(artifacts, "pa-default.png") });
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
assert.deepEqual((await read(`${routeBase}?limit=100`)).data, before.data);
assert.deepEqual((await read("/project-bills/costing/tenders?limit=100")).data, billsBefore.data);
assert.deepEqual((await read("/challan-submissions?limit=100")).data, savedBefore.data);
assert.deepEqual((await read(`/tenders/${target.tenderId}`)).data, tenderBefore);
console.log(`PASS live UI: PA delivery auto-fill/reload, PDF and Word delivery cells, overrides, search, actual print, retry, 3 viewport sizes; no business records changed. ${artifacts}`);
