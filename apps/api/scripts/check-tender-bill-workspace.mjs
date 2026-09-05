// Read-only real-data regression. PDF stress fixtures stay in memory/temp files only.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { extractText, getDocumentProxy } from "unpdf";
const require = createRequire(import.meta.url);
const { Prisma } = require("@bizovix/database");
const { generateProjectCostingPdf } = require("../dist/modules/project-bills/project-costing-pdf.js");
const base = "http://127.0.0.1:4000/api/v1";
const login = await fetch(`${base}/auth/dev-login`, { method: "POST" }).then((r) => r.json());
assert.ok(login.data?.accessToken);
const headers = { Authorization: `Bearer ${login.data.accessToken}` };
async function api(route) {
  const response = await fetch(base + route, { headers });
  assert.equal(response.status, 200, route);
  return response.json();
}
const costsBefore = await api("/tender-costings?limit=100");
const worksBefore = await api("/cms/works?limit=100");
const billsBefore = await api("/project-bills?limit=100");
const list = await api("/project-bills/costing/tenders?limit=100");
const firstPage = await api("/project-bills/costing/tenders?limit=12&page=1");
assert.deepEqual(list.data.map((r) => r.id).sort(), costsBefore.data.filter((r) => r.status === "COMPLETED").map((r) => r.id).sort());
const reports = new Map();
const tenderSnapshots = new Map();
for (const summary of list.data) {
  const saved = (await api(`/tender-costings/${summary.id}`)).data;
  const tender = (await api(`/tenders/${summary.tenderId}`)).data;
  tenderSnapshots.set(summary.tenderId, tender);
  const report = (await api(`/project-bills/costing/tenders/${summary.id}`)).data;
  reports.set(summary.id, report);
  assert.equal(report.source, "TENDER_COSTING");
  assert.equal(report.tenderNumber, tender.egpTenderId);
  assert.equal(report.project.workName, tender.workName);
  assert.equal(summary.grandTotal, saved.estimatedCost);
  assert.equal(report.totalPrice, saved.estimatedCost);
  const costed = saved.items.filter((item) => item.costingStatus === "COSTED");
  assert.deepEqual(report.rows.map((row) => row.id).sort(), costed.map((row) => row.id).sort());
  for (const row of report.rows) {
    const item = costed.find((savedRow) => savedRow.id === row.id);
    assert.equal(row.productName, item.description);
    assert.equal(row.quantity, new Prisma.Decimal(item.quantity).toFixed(3));
    assert.equal(row.unitPrice, new Prisma.Decimal(item.totalCost).div(item.quantity).toFixed(6));
    assert.equal(row.totalPrice, new Prisma.Decimal(item.totalCost).toFixed(2));
  }
  assert.equal(summary.itemCount, report.rows.length);
  assert.equal(summary.unitRate, report.rows.length === 1 ? report.rows[0].unitPrice : null);
  assert.equal(summary.paName, tender.paName || null);
  assert.deepEqual(report.pa, { name: tender.paName || null, designation: tender.paDesignation || null, phone: tender.paPhone || null, address: tender.paAddress || null, email: null });
  assert.equal(report.project.organizationName, tender.noticeOrganization || tender.organizationMaster?.fullName || tender.organizationMaster?.shortName || "");
}
assert.equal((await fetch(`${base}/project-bills/costing/tenders`)).status, 401);
assert.equal((await fetch(`${base}/project-bills/costing/tenders?limit=0`, { headers })).status, 400);
const ready = costsBefore.data.find((item) => item.status === "READY");
if (ready) assert.equal((await fetch(`${base}/project-bills/costing/tenders/${ready.id}`, { headers })).status, 404);
const pageTwo = await api("/project-bills/costing/tenders?limit=1&page=2");
if (list.data.length > 1) assert.equal(pageTwo.data[0].id, list.data[1].id);
if (list.data.length) assert.ok((await api(`/project-bills/costing/tenders?search=${encodeURIComponent(list.data[0].tenderNumber)}`)).data.some((r) => r.id === list.data[0].id));

async function pdfText(bytes) {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = content.items.filter((item) => typeof item.str === "string" && item.str.trim());
      assert.ok(items.length, `Blank PDF page ${pageNumber}`);
      for (const item of items) {
        const style = content.styles[item.fontName];
        const fontSize = Math.hypot(item.transform[2], item.transform[3]);
        const baseline = viewport.height - item.transform[5];
        const top = baseline - fontSize * (style.ascent ?? 1);
        const bottom = baseline - fontSize * (style.descent ?? 0);
        assert.ok(top >= 90 - 0.5, `PDF page ${pageNumber}: text intrudes into 1.25-inch top space: ${item.str}`);
        assert.ok(bottom <= viewport.height - 72 + 0.5, `PDF page ${pageNumber}: text intrudes into 1-inch bottom space: ${item.str}`);
        assert.ok(item.transform[4] >= 72 - 0.5, `PDF page ${pageNumber}: text intrudes into 1-inch left margin: ${item.str}`);
        assert.ok(item.transform[4] + item.width <= viewport.width - 72 + 0.5, `PDF page ${pageNumber}: text intrudes into 1-inch right margin: ${item.str}`);
      }
    }
    return { ...(await extractText(pdf, { mergePages: true })), pages: pdf.numPages };
  }
  finally { await pdf.destroy(); }
}
const compact = (s) => s.replace(/\s+/g, "");
const money = (s) => Number(s).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const artifacts = await mkdtemp(path.join(tmpdir(), "bizovix-tender-bill-"));
const expectedHeaders = ["Sl No.", "Description of Item", "Unit", "Qty", "Unit BDT", "Total BDT"];
function checkPdf(text, report) {
  for (const header of expectedHeaders) assert.ok(compact(text).includes(compact(header)), `Missing PDF header ${header}`);
  for (const label of ["Bill", "Ref:", "Date:", "To", "Sub:", "Dear Sir,", "Grand Total =", "In Words:", "Yours Truly,"]) assert.ok(text.includes(label), `Missing bill-letter element: ${label}`);
  assert.ok(!text.includes("successfully completed"), "Costing alone cannot certify delivery completion");
  for (const row of report.rows) assert.ok(compact(text).includes(compact(row.productName)), `Missing PDF product ${row.productName}`);
  for (const value of Object.values(report.pa).filter(Boolean)) assert.ok(compact(text).includes(compact(value)), `Missing PDF PA ${value}`);
  assert.ok(text.includes(money(report.totalPrice)), "Saved Grand Total must be present");
  assert.ok(!text.includes("Project Items (BOQ)"));
}
const fixture = {
  source: "TENDER_COSTING", project: { id: "fixture", workName: "PDF pagination fixture", organizationName: "Example Organization" }, tenderNumber: "TEST", costingDate: "2026-09-05", emptyReason: null,
  pa: { name: "Example PA", designation: "Engineer", phone: "01712345678", address: "Khulna", email: null },
  rows: Array.from({ length: 80 }, (_, i) => ({ id: `row-${i}`, productName: `Product ${i + 1} with installation and complete accessories`, unit: "Nos", quantity: "1.000", unitPrice: "100.000000", totalPrice: "100.00" })),
  itemsTotalPrice: "8000.00", adjustments: [{ label: "Freight Cost", amount: "25.00" }, { label: "Installation Cost", amount: "10.00" }], totalPrice: "8035.00",
};
const stressPdf = await generateProjectCostingPdf(fixture);
const stressText = await pdfText(stressPdf);
checkPdf(stressText.text, fixture);
assert.ok(stressText.pages > 1);
assert.ok(stressText.text.includes("Freight Cost") && stressText.text.includes("Installation Cost"));
await writeFile(path.join(artifacts, "multipage-fixture.pdf"), stressPdf);

const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const browser = await chromium.launch({ headless: true, executablePath: process.argv[3] });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route((url) => /^\/api\/(v1|backend)\//.test(url.pathname), async (route) => {
    const request = route.request();
    if (!["GET", "OPTIONS"].includes(request.method()) && !request.url().includes("/auth/")) throw new Error(`Unexpected business write: ${request.method()} ${request.url()}`);
    await route.continue();
  });
  await page.goto("http://localhost:3010/cms/documentation/bill-submission");
  await page.getByRole("heading", { name: /Costed Tenders/ }).waitFor();
  if (list.data.length) await page.locator("[data-costing-id]").first().waitFor();
  assert.deepEqual(await page.locator("[data-costing-id]").evaluateAll((els) => els.map((el) => el.dataset.costingId)), firstPage.data.map((r) => r.id));
  assert.equal(await page.getByRole("heading", { name: /Ongoing Projects/ }).count(), 0);
  assert.deepEqual(await page.locator('table[aria-label="Costed tenders"] th').allTextContents(), ["SL", "Tender ID", "Work Name", "PA Name", "Unit Rate (BDT)", "Grand Total (BDT)"]);
  for (const width of [1366, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `List overflow at ${width}`);
    const table = page.getByRole("table", { name: "Costed tenders", exact: true });
    assert.equal(await table.evaluate((el) => el.scrollWidth > el.clientWidth + 1), false, `List table overflow at ${width}`);
    await page.screenshot({ path: path.join(artifacts, `list-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1366, height: 900 });
  const search = page.getByRole("textbox", { name: "Search costed tenders" });
  await search.fill("NO_MATCH_REGRESSION_6f991");
  await page.getByText("No completed tender costings found.", { exact: true }).waitFor();
  await search.fill("");
  if (list.data.length) {
    const selected = list.data.find((item) => item.paName) || list.data[0];
    await search.fill(selected.tenderNumber);
    const row = page.locator(`[data-costing-id="${selected.id}"]`);
    await row.waitFor();
    await row.getByRole("button", { name: selected.tenderNumber, exact: true }).click();
    await page.getByRole("heading", { name: "Tender Costing Details", exact: true }).waitFor();
    const report = reports.get(selected.id);
    assert.equal(await page.locator('table[aria-label="Project costing"] tbody tr').count(), report.rows.length);
    const pa = page.getByRole("region", { name: "PA Information" });
    for (const value of Object.values(report.pa).filter(Boolean)) assert.ok((await pa.innerText()).includes(value));
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download PDF", exact: true }).click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), `tender-costing-${report.tenderNumber.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`);
    const pdfPath = path.join(artifacts, download.suggestedFilename());
    await download.saveAs(pdfPath);
    checkPdf((await pdfText(await readFile(pdfPath))).text, report);
    for (const width of [1366, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Details overflow at ${width}`);
      await page.screenshot({ path: path.join(artifacts, `details-${width}.png`), fullPage: true });
    }
    await page.getByRole("button", { name: "All Tenders", exact: true }).click();
    assert.equal(await search.inputValue(), selected.tenderNumber);
    const missingPa = list.data.find((item) => !item.paName);
    if (missingPa) {
      await search.fill(missingPa.tenderNumber);
      await page.locator(`[data-costing-id="${missingPa.id}"]`).getByRole("button", { name: missingPa.tenderNumber, exact: true }).click();
      await page.getByRole("heading", { name: "Tender Costing Details", exact: true }).waitFor();
      assert.equal(await page.getByRole("region", { name: "PA Information" }).locator("dd").first().innerText(), "—");
    }
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(await api("/tender-costings?limit=100"), costsBefore);
  assert.deepEqual(await api("/cms/works?limit=100"), worksBefore);
  assert.deepEqual(await api("/project-bills?limit=100"), billsBefore);
  for (const [id, before] of tenderSnapshots) assert.deepEqual((await api(`/tenders/${id}`)).data, before);
  console.log(`PASS: ${list.data.length} completed tenders match Tender Costing; Ready excluded; saved item rates/totals and Add New Tender PA match.`);
  console.log("PASS: search, pagination API, 6-column list/details, bill-letter PDF download, responsive layouts, 80-row PDF pagination, 1.25-inch top and 1-inch bottom/left/right margins on every PDF page. No business records changed.");
  console.log(`Artifacts: ${artifacts}`);
} finally { await browser.close(); }
