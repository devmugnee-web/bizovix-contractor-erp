// All API calls, including saves/uploads, are routed to the isolated test app.
// This test must never use the development API or real business records.
import assert from "node:assert/strict";
import { readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { extractText } from "unpdf";
import ExcelJS from "exceljs";
const origin = new URL(process.argv[2]), tenderId = process.argv[3];
assert.ok(["127.0.0.1", "localhost"].includes(origin.hostname) && origin.port && !["4000", "3010"].includes(origin.port));
assert.match(process.env.BIZOVIX_TAX_TEST_DATABASE || "", /^bizovix_vat_tax_test_[0-9a-f]{32}$/);
const access = process.env.BIZOVIX_TAX_TEST_ACCESS;
assert.ok(access && process.env.BIZOVIX_PW_MODULE && process.env.BIZOVIX_PW_CHROME);
const headers = { Authorization: `Bearer ${access}` };
async function report() { const r = await fetch(`${origin.origin}/api/v1/tender-vat-tax/tenders/${tenderId}`, { headers }); assert.equal(r.status, 200); return (await r.json()).data; }
const before = await report();
const artifacts = await mkdtemp(path.join(tmpdir(), "bizovix-tax-ui-"));
const { chromium } = await import(pathToFileURL(process.env.BIZOVIX_PW_MODULE));
const browser = await chromium.launch({ headless: true, executablePath: process.env.BIZOVIX_PW_CHROME });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, acceptDownloads: true }); page.setDefaultTimeout(25000);
  const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((token) => {
    localStorage.setItem("bizovix_access_token", token); localStorage.setItem("bizovix_refresh_token", "isolated-test");
    // Exercise the same secure UUID fallback used by other computers over LAN HTTP.
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
  }, access);
  let failExport = false;
  await page.route((url) => /^\/api\/(backend|v1)\//.test(url.pathname), async (route) => {
    const requested = new URL(route.request().url());
    if (failExport && requested.pathname.includes("/export/pdf")) return route.fulfill({ status: 500, json: { message: "Test export unavailable" } });
    const destination = origin.origin + requested.pathname.replace(/^\/api\/backend\//, "/api/v1/") + requested.search;
    const response = await route.fetch({ url: destination }); await route.fulfill({ response });
  });
  await page.goto("http://localhost:3010/cms/documentation/vat-tax-certificate");
  await page.getByRole("heading", { name: "Tender VAT & Tax", exact: true }).waitFor();
  await page.locator("[data-tax-tender]").first().waitFor();
  await page.getByLabel("Period", { exact: true }).selectOption("ALL");
  await page.getByLabel("Search tenders").fill("not-matching-test"); await page.getByText("No tenders found.", { exact: true }).waitFor();
  await page.getByLabel("Search tenders").fill("0001"); await page.locator(`[data-tax-tender="${tenderId}"]`).waitFor();
  for (const width of [1366, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    const cards = await page.locator('[aria-label="VAT and Tax totals"] > section').evaluateAll((elements) => elements.map((el) => el.getBoundingClientRect().top)); assert.equal(new Set(cards).size, 1);
    await page.screenshot({ path: path.join(artifacts, `list-${width}.png`) });
  }
  await page.setViewportSize({ width: 1366, height: 900 });
  async function openTender() { await page.locator(`[data-tax-tender="${tenderId}"]`).getByRole("button", { name: "0001", exact: true }).click(); await page.getByRole("button", { name: "Add Entry", exact: true }).waitFor(); }
  await openTender();
  await page.getByRole("button", { name: "Add Entry", exact: true }).click();
  await page.getByRole("button", { name: "Save Entry", exact: true }).click();
  assert.equal(await page.getByLabel("Amount (BDT)", { exact: true }).getAttribute("aria-invalid"), "true");
  assert.equal((await report()).meta.total, before.meta.total);
  await page.getByLabel("Amount (BDT)", { exact: true }).fill("12.50");
  await page.getByLabel("Entry date", { exact: true }).fill("2026-01-02");
  await page.getByLabel("Payment or bill reference").fill("UI-PAYMENT");
  await page.getByRole("button", { name: "Save Entry", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Entry saved" }).waitFor();
  let current = await report(); const entry = current.rows.find((e) => e.referenceNo === "UI-PAYMENT"); assert.ok(entry); assert.equal(current.meta.total, before.meta.total + 1);
  await page.reload(); await page.locator("[data-tax-tender]").first().waitFor(); await page.getByLabel("Period", { exact: true }).selectOption("ALL"); await openTender();
  await page.getByRole("button", { name: "Edit UI-PAYMENT", exact: true }).click();
  await page.getByLabel("Amount (BDT)", { exact: true }).fill("11.25"); await page.getByRole("button", { name: "Save Entry", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Entry saved" }).waitFor(); assert.equal((await report()).rows.find((e) => e.id === entry.id).amount, "11.25");
  failExport = true; await page.getByRole("button", { name: "PDF", exact: true }).click(); await page.getByRole("alert").filter({ hasText: "Failed to download file" }).waitFor(); failExport = false;
  let pdfBytes;
  for (const [name, extension] of [["PDF", "pdf"], ["Excel", "xlsx"]]) {
    const downloading = page.waitForEvent("download"); await page.getByRole("button", { name, exact: true }).click(); const download = await downloading;
    const file = path.join(artifacts, `report.${extension}`); await download.saveAs(file); const bytes = await readFile(file);
    if (extension === "pdf") { pdfBytes = bytes; const text = (await extractText(new Uint8Array(bytes), { mergePages: true })).text; assert.ok(text.includes("UI-PAYMENT") && text.includes("11.25")); }
    else { const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(bytes); assert.ok(workbook.getWorksheet("Entries").getSheetValues().flat(2).includes("UI-PAYMENT")); }
  }
  const totalsBeforeProof = (await report()).totals;
  await page.getByRole("button", { name: "Files for UI-PAYMENT", exact: true }).click();
  await page.getByLabel("Upload payment proof").setInputFiles({ name: "test-proof.pdf", mimeType: "application/pdf", buffer: pdfBytes });
  await page.getByText("test-proof.pdf", { exact: true }).waitFor();
  assert.deepEqual((await report()).totals, totalsBeforeProof);
  const proofDownload = page.waitForEvent("download"); await page.getByRole("button", { name: "Download test-proof.pdf", exact: true }).click(); assert.equal((await proofDownload).suggestedFilename(), "test-proof.pdf");
  await page.getByRole("button", { name: "Close modal", exact: true }).click();
  for (const width of [1366, 768, 390]) { await page.setViewportSize({ width, height: 900 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); await page.screenshot({ path: path.join(artifacts, `detail-${width}.png`) }); }
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.getByRole("button", { name: "Void UI-PAYMENT", exact: true }).click(); await page.getByLabel("Void reason").fill("Browser test correction"); await page.getByRole("button", { name: "Void Entry", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Entry voided" }).waitFor(); assert.ok((await report()).rows.find((e) => e.id === entry.id).voidedAt);
  await page.getByLabel("Period", { exact: true }).selectOption("YEAR"); await page.getByLabel("Year", { exact: true }).fill("2025"); await page.getByLabel("Year", { exact: true }).blur();
  await page.getByText("No VAT / Tax entries in this period.", { exact: true }).waitFor(); assert.equal(await page.locator('[data-total="total"]').textContent(), "0.00");
  await page.getByRole("link", { name: "Certificates", exact: true }).click(); await page.waitForURL((url) => url.searchParams.get("view") === "certificates", { waitUntil: "commit" });
  assert.ok(await page.getByRole("link", { name: "Tender VAT & Tax", exact: true }).isVisible());
  assert.deepEqual(errors, []);
  console.log(`PASS browser: real save/reload/edit/void, required highlights, year filters, PDF/Excel, proof upload/download, no double count, 3 responsive widths. Artifacts: ${artifacts}`);
} finally { await browser.close(); }
