// Browser fixtures are intercepted in this isolated browser only. No challan,
// delivery, approval or payment record is created for UI validation.
import assert from "node:assert/strict";
import { readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { extractText } from "unpdf";
const base = "http://127.0.0.1:4000/api/v1";
const login = await fetch(`${base}/auth/dev-login`, { method: "POST" }).then((r) => r.json());
const headers = { Authorization: `Bearer ${login.data.accessToken}` };
async function read(route) {
  const response = await fetch(base + route, { headers });
  assert.equal(response.status, 200); return (await response.json()).data;
}
const before = await read("/challan-submissions?limit=100");
const work = (await read("/cms/works?limit=1"))[0];
assert.ok(work);
const fixture = {
  id: "isolated-pdf-ui-fixture", cmsWorkId: work.id, cmsWork: work, contractId: null, contract: null,
  challanNo: "UI-FIXTURE-ONLY", challanDate: "2026-09-05T00:00:00.000Z", description: "Test goods", challanType: "Material Delivery",
  challanMonth: "2026-09-01T00:00:00.000Z", periodFrom: "2026-09-01T00:00:00.000Z", periodTo: "2026-09-30T00:00:00.000Z",
  receivedBy: "Project Engineer", receivedAt: "Isolated test site", submittedTo: "Project Engineer", paymentFrom: "Own Fund", remarks: null,
  totalAmount: "100.00", approvedAmount: null, status: "DRAFT", statusHistory: [], documents: [],
  items: [{ id: "isolated-item", itemCode: "", description: "Display", unit: "Pcs", quantity: "1.000", rate: "100.00", amount: "100.00", sortOrder: 0 }],
};
const bytes = await readFile(process.argv[4]);
const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const artifacts = await mkdtemp(path.join(tmpdir(), "bizovix-challan-ui-"));
const browser = await chromium.launch({ headless: true, executablePath: process.argv[3] });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.__printCalls = [];
    window.print = () => { throw new Error("Do not print the ERP page"); };
    const descriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "contentWindow");
    Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
      ...descriptor, get() {
        const target = descriptor.get.call(this);
        if (target && this.dataset.billPrint === "true") {
          const frame = this;
          target.print = () => window.__printCalls.push(frame.title);
        }
        return target;
      },
    });
  });
  let failPdf = false;
  let requests = 0;
  await page.route((url) => /^\/api\/(v1|backend)\//.test(url.pathname), async (route) => {
    const request = route.request();
    assert.ok(["GET", "OPTIONS"].includes(request.method()) || request.url().includes("/auth/"), `Unexpected write: ${request.url()}`);
    if (request.url().endsWith(`/challan-submissions/${fixture.id}`)) return route.fulfill({ status: 200, json: { success: true, data: fixture } });
    if (request.url().endsWith(`/challan-submissions/${fixture.id}/pdf`)) {
      requests++;
      if (failPdf) return route.fulfill({ status: 500, json: { message: "Could not prepare Challan PDF" } });
      return route.fulfill({ status: 200, headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="challan-test.pdf"', "Access-Control-Expose-Headers": "Content-Disposition" }, body: bytes });
    }
    return route.continue();
  });
  await page.goto("http://localhost:3010/cms/documentation/challan-submission?mode=create");
  const print = page.getByRole("button", { name: "Print", exact: true });
  const download = page.getByRole("button", { name: "Download PDF", exact: true });
  await download.waitFor();
  assert.ok(await download.isDisabled(), "Unsaved challan cannot download a stale PDF");
  await page.goto(`http://localhost:3010/cms/documentation/challan-submission?id=${fixture.id}`);
  await download.waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) => button.textContent === "Download PDF" && !button.disabled));
  const downloadEvent = page.waitForEvent("download");
  await download.click();
  const downloaded = await downloadEvent;
  assert.equal(downloaded.suggestedFilename(), "challan-test.pdf");
  const output = path.join(artifacts, "downloaded-challan.pdf");
  await downloaded.saveAs(output);
  const text = (await extractText(new Uint8Array(await readFile(output)), { mergePages: true })).text;
  assert.ok(text.includes("Challan") && text.includes("Place of Delivery"));
  assert.ok(!/Grand Total|Unit BDT|In Words|Discount/.test(text));
  await print.click();
  await page.waitForFunction(() => window.__printCalls.length === 1);
  assert.deepEqual(await page.evaluate(() => window.__printCalls), ["Challan print document"]);
  await page.locator('iframe[title="Challan print document"]').evaluate((frame) => frame.contentWindow.dispatchEvent(new Event("afterprint")));
  assert.equal(await page.locator('iframe[title="Challan print document"]').count(), 0);
  const location = page.getByRole("textbox", { name: "Received At" });
  await location.fill("Changed but not saved");
  assert.ok(await download.isDisabled() && await print.isDisabled());
  await location.fill(fixture.receivedAt);
  assert.ok(await download.isEnabled());
  failPdf = true;
  await download.click();
  await page.locator('p[role="alert"]').waitFor();
  assert.ok(await download.isEnabled(), "Retry enabled after failure");
  failPdf = false;
  await print.click();
  await page.waitForFunction(() => window.__printCalls.length === 2);
  for (const width of [1366, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const printBox = await print.boundingBox();
    const downloadBox = await download.boundingBox();
    assert.ok(printBox.x >= 0 && downloadBox.x + downloadBox.width <= width + 1, "Export controls fit viewport");
    await page.screenshot({ path: path.join(artifacts, `challan-${width}.png`) });
  }
  await page.getByRole("link", { name: "Back to Challan Submissions" }).click();
  await page.waitForURL("**/cms/documentation");
  await page.locator('iframe[title="Challan print document"]').waitFor({ state: "detached" });
  assert.equal(await page.locator('iframe[title="Challan print document"]').count(), 0);
  assert.ok(requests >= 4);
  assert.deepEqual(errors, []);
  assert.deepEqual(await read("/challan-submissions?limit=100"), before);
  console.log(`PASS isolated UI: download, print, cleanup, dirty protection, error/retry, 3 viewports; no database writes. ${artifacts}`);
} finally { await browser.close(); }
