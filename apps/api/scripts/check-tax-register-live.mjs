// Read-only verification against the local application. Never create financial fixtures here.
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { extractText } from "unpdf";
import ExcelJS from "exceljs";

const base = "http://127.0.0.1:4000/api/v1";
const loginResponse = await fetch(`${base}/auth/dev-login`, { method: "POST" });
assert.equal(loginResponse.status, 201);
const token = (await loginResponse.json()).data.accessToken;
const headers = { Authorization: `Bearer ${token}` };
async function read(route) {
  const response = await fetch(base + route, { headers });
  assert.equal(response.status, 200, route);
  return (await response.json()).data;
}
const before = await read("/tender-vat-tax/tenders?limit=100");
const tenders = await read("/tenders?limit=100");
assert.deepEqual(before.rows.map((t) => t.id).sort(), tenders.map((t) => t.id).sort());
const certificatesBefore = await read("/vat-tax-certificates?limit=100");
const selected = before.rows.find((t) => t.tenderNumber === "1318963") || before.rows[0];
assert.ok(selected, "Existing tender required for the read-only check");
const details = await read(`/tender-vat-tax/tenders/${selected.id}`);
assert.equal(details.tender.tenderNumber, selected.tenderNumber);
for (const extension of ["pdf", "xlsx"]) {
  const response = await fetch(`${base}/tender-vat-tax/export/${extension}`, { headers });
  assert.equal(response.status, 200);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (extension === "pdf") {
    assert.ok((await extractText(bytes, { mergePages: true })).text.includes(selected.tenderNumber));
  } else {
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(Buffer.from(bytes));
    assert.ok(workbook.getWorksheet("Tender Summary").getSheetValues().flat(2).includes(selected.tenderNumber));
  }
}
const artifacts = await mkdtemp(path.join(tmpdir(), "bizovix-tax-live-"));
const { chromium } = await import(pathToFileURL(process.argv[2]));
const browser = await chromium.launch({ headless: true, executablePath: process.argv[3] });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.setDefaultTimeout(25000);
  const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript((access) => { localStorage.setItem("bizovix_access_token", access); }, token);
  await page.route((url) => /^\/api\/(v1|backend)\//.test(url.pathname), (route) => {
    assert.ok(["GET", "OPTIONS"].includes(route.request().method()) || new URL(route.request().url()).pathname.includes("/auth/"), "Refusing a real business write");
    return route.continue();
  });
  await page.goto("http://localhost:3010/cms/documentation/vat-tax-certificate");
  await page.getByRole("heading", { name: "Tender VAT & Tax", exact: true }).waitFor();
  await page.locator("[data-tax-tender]").first().waitFor();
  await page.getByLabel("Period", { exact: true }).selectOption("ALL");
  await page.getByRole("table", { name: "Tender VAT Tax summary", exact: true }).waitFor();
  assert.deepEqual(await page.getByRole("table", { name: "Tender VAT Tax summary", exact: true }).locator("th").allTextContents(), ["SL", "Tender ID", "Work Name", "VAT (BDT)", "Tax (BDT)", "Total (BDT)"]);
  for (const width of [1366, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => scrollTo(0, 0));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    const tops = await page.locator('[aria-label="VAT and Tax totals"] > section').evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().top));
    assert.equal(new Set(tops).size, 1);
    await page.screenshot({ path: path.join(artifacts, `list-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1366, height: 900 });
  const visible = new Set();
  for (let i = 0; i < Math.ceil(before.meta.total / 12); i++) {
    (await page.locator("[data-tax-tender]").evaluateAll((rows) => rows.map((row) => row.dataset.taxTender))).forEach((id) => visible.add(id));
    const next = page.getByRole("button", { name: "Next page", exact: true });
    if (await next.isDisabled()) break;
    const first = await page.locator("[data-tax-tender]").first().getAttribute("data-tax-tender");
    await next.click(); await page.locator("[data-tax-tender]").first().waitFor();
    await page.waitForFunction((id) => document.querySelector("[data-tax-tender]")?.getAttribute("data-tax-tender") !== id, first);
  }
  assert.equal(visible.size, before.meta.total);
  await page.getByLabel("Search tenders").fill(selected.tenderNumber);
  await page.locator(`[data-tax-tender="${selected.id}"]`).waitFor();
  await page.locator(`[data-tax-tender="${selected.id}"]`).getByRole("button", { name: selected.tenderNumber, exact: true }).click();
  await page.getByRole("button", { name: "Add Entry", exact: true }).waitFor();
  await page.getByRole("link", { name: "Certificates", exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get("view") === "certificates", { waitUntil: "commit" });
  assert.ok(await page.getByRole("link", { name: "Tender VAT & Tax", exact: true }).isVisible());
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
assert.deepEqual(await read("/tender-vat-tax/tenders?limit=100"), before);
assert.deepEqual(await read("/vat-tax-certificates?limit=100"), certificatesBefore);
console.log(`PASS read-only live check: all ${before.meta.total} actual tenders, pagination, detail, PDF/Excel, certificates retained, 3 responsive widths, no records changed. Artifacts: ${artifacts}`);
