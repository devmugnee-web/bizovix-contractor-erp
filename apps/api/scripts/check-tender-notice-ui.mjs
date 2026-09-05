// Optional browser smoke test. Pass an installed playwright-core module and Chromium executable.
// Imports and edits in memory only; never submits or saves the form.
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import PDFDocument from "pdfkit";

const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const browser = await chromium.launch({ headless: true, executablePath: process.argv[3] });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://localhost:3010/tenders");
  await page.getByRole("button", { name: "Add New Tender", exact: true }).click({ timeout: 60000 });
  const document = new PDFDocument();
  const chunks = [];
  const buffer = new Promise((resolve) => {
    document.on("data", (chunk) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
  });
  document.text("Tender ID: 9912345\nName of Work: Supply of Equipment\nTender Type: Goods\nProcurement Method: OTM\nClosing Date: 20-Sep-2026\nOrganization: Port Authority\nDocument Fee: 2000\nTender Security Amount: 50000\nMeeting End Date and Time: 10-Sep-2026 15:30\nPA Name: Md Karim\nPA Designation: Engineer\nPA Address: Port Road\nPA Phone Number: 01700123456");
  document.end();
  await page.locator('input[type="file"]').setInputFiles({ name: "notice.pdf", mimeType: "application/pdf", buffer: await buffer });
  await page.waitForFunction(() => document.querySelector('[name="paName"]')?.value === "Md Karim");
  for (const [name, expected] of Object.entries({ documentFee: "2000", estimatedTenderSecurityAmount: "50000", preBidEndDate: "2026-09-10T15:30", noticeOrganization: "Port Authority", paName: "Md Karim", paDesignation: "Engineer", paPhone: "01700123456", paAddress: "Port Road" })) {
    assert.equal(await page.locator(`[name="${name}"]`).inputValue(), expected, name);
  }
  await page.getByLabel("PA Name", { exact: true }).fill("Reviewed Officer");
  assert.equal(await page.locator('[name="paName"]').inputValue(), "Reviewed Officer");
  const artifacts = await mkdtemp(path.join(tmpdir(), "bizovix-notice-"));
  await page.locator('[name="paName"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(artifacts, "desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[name="paName"]').scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Page horizontal overflow");
  const bounds = await page.locator('[name="paName"]').boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390, "Mobile field overflow");
  await page.screenshot({ path: path.join(artifacts, "mobile.png") });
  assert.deepEqual(errors, []);
  console.log("Browser: PDF autofill, manual edit, desktop/mobile layout passed. No records saved.");
  console.log(`Screenshots: ${artifacts}`);
} finally {
  await browser.close();
}
