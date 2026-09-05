// Read-only browser regression: no approvals, budgets or costing items are saved.
// Arguments: playwrightModule chromiumExecutable emptyTenderId [savedTenderId]
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import PDFDocument from "pdfkit";

const [playwrightModule, chromiumExecutable, emptyTenderId, savedTenderId] = process.argv.slice(2);
const base = "http://127.0.0.1:4000/api/v1";
const login = await fetch(`${base}/auth/dev-login`, { method: "POST" }).then((r) => r.json());
assert.ok(login.data?.accessToken);
async function api(route) {
  const response = await fetch(base + route, { headers: { Authorization: `Bearer ${login.data.accessToken}` } });
  assert.equal(response.status, 200);
  return (await response.json()).data;
}
async function costingFor(tenderId) {
  const result = await api(`/tender-costings?search=${encodeURIComponent(tenderId)}`);
  const found = (Array.isArray(result) ? result : result.items).find((item) => item.tender.egpTenderId === tenderId);
  assert.ok(found, "Existing costing not found");
  return api(`/tender-costings/${found.id}`);
}
const empty = await costingFor(emptyTenderId);
assert.equal(empty.items.length, 0, "Use an existing costing without saved items");
assert.ok(Number(empty.costingBudget) > 0, "Use an existing costing with a saved budget");
const { chromium } = await import(pathToFileURL(playwrightModule).href);
const browser = await chromium.launch({ headless: true, executablePath: chromiumExecutable });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.goto(`http://localhost:3010/tender-management/tender-costing/add?costingId=${empty.id}`);
  await page.getByText("No items added yet.", { exact: true }).waitFor();
  assert.equal(await page.locator("[data-costing-row]").count(), 0);
  await page.reload();
  await page.getByText("No items added yet.", { exact: true }).waitFor();
  assert.equal(await page.locator("[data-costing-row]").count(), 0);
  const screenshots = await mkdtemp(path.join(tmpdir(), "bizovix-empty-costing-"));
  await page.screenshot({ path: path.join(screenshots, "empty.png") });
  await page.getByRole("button", { name: "Add Another Row", exact: true }).click();
  assert.equal(await page.locator("[data-costing-row]").count(), 1);
  assert.equal(await page.getByPlaceholder("Enter product", { exact: true }).inputValue(), "");
  await page.reload();
  await page.getByText("No items added yet.", { exact: true }).waitFor();
  const pdf = new PDFDocument();
  const chunks = [];
  const buffer = new Promise((resolve) => {
    pdf.on("data", (chunk) => chunks.push(chunk));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
  });
  pdf.fontSize(10).text("Bill of Quantities\nSL | Product / Work Name | Unit | Qty | Unit Price | Total Price\n1 | Desktop Computer | Nos | 10 | 50000 | 500000\n2 | Network Switch | Pcs | 5 | 12500 | 62500");
  pdf.end();
  await page.locator('input[type="file"]').setInputFiles({ name: "boq.pdf", mimeType: "application/pdf", buffer: await buffer });
  await page.waitForFunction(() => document.querySelectorAll("[data-costing-row]").length === 2);
  assert.deepEqual(await page.getByPlaceholder("Enter product", { exact: true }).evaluateAll((inputs) => inputs.map((input) => input.value)), ["Desktop Computer", "Network Switch"]);
  assert.deepEqual((await api(`/tender-costings/${empty.id}`)).items, empty.items);
  console.log("Passed: empty on load/reload, one row on Add, exactly two PDF rows; no database changes.");
  if (savedTenderId) {
    const saved = await costingFor(savedTenderId);
    assert.ok(saved.items.length > 0);
    await page.goto(`http://localhost:3010/tender-management/tender-costing/add?costingId=${saved.id}`);
    const complete = saved.items.filter((item) => item.costingStatus === "COSTED");
    if (complete.length) {
      await page.getByRole("heading", { name: "Costed Items List", exact: true }).waitFor();
      assert.equal(await page.getByRole("button", { name: "Edit Cost", exact: true }).count(), complete.length);
    }
    assert.deepEqual((await api(`/tender-costings/${saved.id}`)).items, saved.items);
    console.log(`Passed: ${saved.items.length} saved items preserved.`);
  }
  console.log(`Screenshot: ${path.join(screenshots, "empty.png")}`);
} finally {
  await browser.close();
}
