// Exercise the real PDF endpoint and UI. Intercept only the final browser print()
// call: validation must never submit an actual printer job or modify bill data.
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getDocumentProxy, extractText } from "unpdf";
const base = "http://127.0.0.1:4000/api/v1";
const login = await fetch(`${base}/auth/dev-login`, { method: "POST" }).then((r) => r.json());
const headers = { Authorization: `Bearer ${login.data.accessToken}` };
const api = async (route) => {
  const response = await fetch(base + route, { headers });
  assert.equal(response.status, 200, route);
  return response.json();
};
const before = await api("/project-bills/costing/tenders?limit=100");
const billsBefore = await api("/project-bills?limit=100");
const target = before.data.find((item) => item.tenderNumber === "1318963");
assert.ok(target);
const reportBefore = await api(`/project-bills/costing/tenders/${target.id}`);
const artifacts = await mkdtemp(path.join(tmpdir(), "bizovix-bill-print-"));
const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const browser = await chromium.launch({ headless: true, executablePath: process.argv[3] });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    window.__printCalls = [];
    window.__printThrows = false;
    window.__pdfBlobs = new Map();
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      const url = create(blob); window.__pdfBlobs.set(url, { blob, revoked: false }); return url;
    };
    URL.revokeObjectURL = (url) => {
      const entry = window.__pdfBlobs.get(url); if (entry) entry.revoked = true; revoke(url);
    };
    window.print = () => { throw new Error("Must not print the ERP page"); };
    const descriptor = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "contentWindow");
    Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
      ...descriptor,
      get() {
        const target = descriptor.get.call(this);
        if (target && this.dataset.billPrint === "true") {
          const frame = this;
          target.print = () => {
            if (window.__printThrows) throw new Error("Simulated native print failure");
            window.__printCalls.push({ url: frame.src, title: frame.title });
          };
        }
        return target;
      },
    });
  });
  let mode = "normal";
  let release;
  let requests = 0;
  await page.route((url) => /^\/api\/(v1|backend)\//.test(url.pathname), async (route) => {
    const request = route.request();
    assert.ok(["GET", "OPTIONS"].includes(request.method()) || request.url().includes("/auth/"), `Unexpected business write: ${request.url()}`);
    if (request.method() === "GET" && request.url().endsWith(`/project-bills/costing/tenders/${target.id}/pdf`)) {
      requests++;
      if (mode === "fail") return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "Print PDF temporarily unavailable" }) });
      if (mode === "hold") await new Promise((resolve) => { release = resolve; });
    }
    await route.continue();
  });
  await page.goto("http://localhost:3010/cms/documentation/bill-submission");
  await page.getByRole("heading", { name: "Costed Tenders" }).waitFor();
  const search = page.getByRole("textbox", { name: "Search costed tenders" });
  async function openTender() {
    await search.fill(target.tenderNumber);
    await page.locator(`[data-costing-id="${target.id}"]`).getByRole("button", { name: target.tenderNumber, exact: true }).click();
    await page.getByRole("heading", { name: "Tender Costing Details", exact: true }).waitFor();
  }
  await openTender();
  for (const width of [1366, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await page.getByRole("button", { name: "Print", exact: true }).isVisible(), true);
    assert.equal(await page.getByRole("button", { name: "Download PDF", exact: true }).isVisible(), true);
    await page.screenshot({ path: path.join(artifacts, `print-button-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.getByRole("button", { name: "Print", exact: true }).click();
  await page.waitForFunction(() => window.__printCalls.length === 1);
  const printed = await page.evaluate(async () => {
    const call = window.__printCalls[0]; const entry = window.__pdfBlobs.get(call.url);
    return { ...call, bytes: [...new Uint8Array(await entry.blob.arrayBuffer())], revoked: entry.revoked };
  });
  assert.equal(printed.title, "Bill print document");
  assert.equal(printed.revoked, false, "Keep the PDF alive while preview is open");
  assert.equal(Buffer.from(printed.bytes).subarray(0, 5).toString(), "%PDF-");
  const parsed = await getDocumentProxy(new Uint8Array(printed.bytes));
  const { text } = await extractText(parsed, { mergePages: true });
  assert.ok(text.includes("Bill") && text.includes(reportBefore.data.pa.name) && text.includes("In Words:"));
  assert.ok(text.replace(/\s+/g, " ").includes("Therefore, you are kindly requested to pay the above bill in favor of Mugnee Multiple."));
  assert.ok(text.includes("Discount for Extended LED Display"));
  await parsed.destroy();
  await page.evaluate(() => document.querySelector('[data-bill-print="true"]').contentWindow.dispatchEvent(new Event("afterprint")));
  assert.equal(await page.locator('[data-bill-print="true"]').count(), 0);
  assert.equal(await page.evaluate((url) => window.__pdfBlobs.get(url).revoked, printed.url), true);

  mode = "fail";
  await page.getByRole("button", { name: "Print", exact: true }).click();
  await page.locator('p[role="alert"]').waitFor();
  assert.equal(await page.getByRole("button", { name: "Print", exact: true }).isEnabled(), true);
  assert.equal(await page.locator('[data-bill-print="true"]').count(), 0);
  mode = "normal";
  await page.evaluate(() => { window.__printThrows = true; });
  await page.getByRole("button", { name: "Print", exact: true }).click();
  await page.getByText("Could not open print preview. Please try again, or download the PDF and print it.", { exact: true }).waitFor();
  assert.equal(await page.locator('[data-bill-print="true"]').count(), 0);
  await page.evaluate(() => { window.__printThrows = false; });
  await page.getByRole("button", { name: "Print", exact: true }).click();
  await page.waitForFunction(() => window.__printCalls.length === 2);
  await page.getByRole("button", { name: "All Tenders", exact: true }).click();
  assert.equal(await page.locator('[data-bill-print="true"]').count(), 0, "Navigation disposes the old print document");

  await openTender();
  mode = "hold";
  const requestsBefore = requests;
  await page.getByRole("button", { name: "Print", exact: true }).click();
  await page.getByRole("button", { name: "Preparing Print…", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Preparing Print…", exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "Download PDF", exact: true }).isDisabled(), true);
  await page.getByRole("button", { name: "All Tenders", exact: true }).click();
  assert.equal(requests, requestsBefore + 1);
  mode = "normal";
  const pending = page.waitForResponse((response) => response.url().endsWith(`/project-bills/costing/tenders/${target.id}/pdf`));
  release(); await pending;
  await openTender();
  assert.equal(await page.locator('[data-bill-print="true"]').count(), 0, "A stale request must not print after navigation");
  assert.equal(await page.evaluate(() => window.__printCalls.length), 2);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  const download = await downloadPromise;
  const downloadPath = path.join(artifacts, download.suggestedFilename());
  await download.saveAs(downloadPath);
  assert.equal((await readFile(downloadPath)).subarray(0, 5).toString(), "%PDF-");
  assert.deepEqual(errors, []);
  assert.deepEqual(await api("/project-bills/costing/tenders?limit=100"), before);
  assert.deepEqual(await api("/project-bills?limit=100"), billsBefore);
  assert.deepEqual(await api(`/project-bills/costing/tenders/${target.id}`), reportBefore);
  console.log("PASS: Print uses the real Bill PDF, not the ERP page; cleanup after print/navigation; failed fetch/native print retry; stale requests do not print; Download PDF unchanged; responsive buttons. No business records changed and no printer job submitted.");
  console.log(`Artifacts: ${artifacts}`);
} finally { await browser.close(); }
