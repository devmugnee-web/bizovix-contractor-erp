// Real application reads and generated local fixtures only. Never creates a
// bill/challan, confirms delivery, changes costing or sends a printer job.
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
const zip = require(require.resolve("jszip", { paths: [require.resolve("docx")] }));
const { generateBillLetterWord } = require("../dist/modules/project-bills/bill-letter-word.js");
const { generateChallanLetterWord } = require("../dist/modules/challan-submissions/challan-letter-word.js");
const MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const base = "http://127.0.0.1:4000/api/v1";
const login = await fetch(`${base}/auth/dev-login`, { method: "POST" }).then((r) => r.json());
const headers = { Authorization: `Bearer ${login.data.accessToken}` };
async function read(route) { const r = await fetch(base + route, { headers }); assert.equal(r.status, 200, route); return (await r.json()).data; }
const billsBefore = await read("/project-bills/costing/tenders?limit=100");
const challansBefore = await read("/challan-submissions?limit=100");
const target = billsBefore.find((t) => t.tenderNumber === "1318963") || billsBefore[0];
const tenderBefore = await read(`/tenders/${target.tenderId}`);
const artifacts = await mkdtemp(path.join(tmpdir(), "bizovix-word-"));
const billPath = `/project-bills/costing/tenders/${target.id}/word`;
const challanPath = `/challan-submissions/costing/tenders/${target.id}/word`;
async function inspect(bytes, kind) {
  assert.equal(bytes.subarray(0, 2).toString(), "PK");
  const archive = await zip.loadAsync(bytes);
  assert.ok(archive.file("[Content_Types].xml"));
  assert.ok(!Object.keys(archive.files).some((name) => /vbaProject|word\/media\//i.test(name)));
  const xml = await archive.file("word/document.xml").async("string");
  assert.ok(xml.includes(kind)); assert.ok(xml.includes("<w:tbl>") && xml.includes("<w:tblHeader"));
  if (kind === "Bill") {
    for (const value of ["Unit BDT", "Total BDT", "Discount for Extended LED Display", "Grand Total =", "In Words:", "Therefore, you are kindly requested to pay the above bill in favor of Mugnee Multiple."]) assert.ok(xml.includes(value), value);
    assert.ok(xml.includes('w:top="1800"'));
  } else {
    assert.ok(xml.includes("Name of Goods") && xml.includes("Place of Delivery"));
    assert.ok(!/Unit BDT|Total BDT|Grand Total|Discount|In Words|pay the above bill/.test(xml));
  }
  return xml;
}
for (const [route, kind] of [[billPath, "Bill"], [challanPath, "Challan"]]) {
  assert.equal((await fetch(base + route)).status, 401);
  const response = await fetch(base + route, { headers });
  assert.equal(response.status, 200, route); assert.equal(response.headers.get("content-type"), MIME);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const bytes = Buffer.from(await response.arrayBuffer());
  const xml = await inspect(bytes, kind);
  if (tenderBefore.paName) assert.ok(xml.includes(tenderBefore.paName));
  await writeFile(path.join(artifacts, `live-${kind.toLowerCase()}.docx`), bytes);
}
assert.equal((await fetch(base + challanPath + "?date=2026-02-30", { headers })).status, 400);
for (const route of ["/project-bills/costing/tenders/missing/word", "/challan-submissions/costing/tenders/missing/word", "/challan-submissions/missing/word"]) assert.equal((await fetch(base + route, { headers })).status, 404);

const sampleRows = [
  ["CENTRAL UNIT\nBrand: Bosch\nModel: CCSD-CU", "Nos", "1", "122500.300", "122500.300"],
  ["TABLE TOP CHAIRMAN UNIT\nBrand: Bosch\nModel: CCSD-DL", "Nos", "1", "33923.160", "33923.160"],
  ["TABLE TOP DELEGATE UNIT\nBrand: Bosch\nModel: CCSD-DL", "Nos", "35", "33923.160", "1187310.600"],
  ["Extension cable", "Nos", "1", "28269.300", "28269.300"],
  ["UPS\nBrand: MaxGreen\nModel: MGOE-W1KS", "Nos", "1", "56538.600", "56538.600"],
  ["Indoor LED Video Wall Display\nBrand: Lampro Model: LC3.076P", "Psft", "39.6", "10993.580", "435345.768"],
  ["75inch Interactive Flat Panel\nBrand: Ingscreen\nModel: IS-7518", "Nos", "1", "376924.000", "376924.000"],
  ["Samsung 65 QLED | Tizen Smart TV\nBrand: Samsung\nModel: QA65Q7FAARSER", "Nos", "2", "320385.400", "640770.800"],
].map(([productName, unit, quantity, unitPrice, totalPrice], index) => ({ id: `fixture-${index}`, productName, unit, quantity, unitPrice, totalPrice }));
const sample = { source: "TENDER_COSTING", project: { id: "fixture", workName: "supply of Conference System, LED Display, Android LED TV", organizationName: "Office of the Deputy Commissioner" }, tenderNumber: "1275609", pa: { name: null, designation: "Deputy Commissioner,", address: "DC Office, Sunamganj Sadar, Sunamganj – 3600.", phone: null, email: null }, rows: sampleRows, itemsTotalPrice: "2881582.528", adjustments: [{ label: "Discount for Extended LED Display", amount: "-41582.528" }], totalPrice: "2840000.00", emptyReason: null };
const contract = { number: "03/2025-26", date: "2026-06-04", label: "NOA Contract No" };
const sampleChallan = { reference: "MM/BL/2025-26/75", date: "", tenderNumber: sample.tenderNumber, recipient: { ...sample.pa, organization: sample.project.organizationName }, contract, rows: sampleRows.map((row) => ({ description: row.productName, unit: row.unit, quantity: row.quantity, deliveryPlace: "DC Office, Sunamganj" })) };
await writeFile(path.join(artifacts, "sample-bill.docx"), await generateBillLetterWord(sample, { reference: "MM/BL/2025-26/78", contract }));
await writeFile(path.join(artifacts, "sample-challan.docx"), await generateChallanLetterWord(sampleChallan));
await writeFile(path.join(artifacts, "many-challan.docx"), await generateChallanLetterWord({ ...sampleChallan, rows: Array.from({ length: 80 }, (_, index) => ({ ...sampleChallan.rows[index % 8], description: `Product ${index + 1}\n${sampleChallan.rows[index % 8].description}` })) }));
await writeFile(path.join(artifacts, "bengali-challan.docx"), await generateChallanLetterWord({ ...sampleChallan, rows: [{ ...sampleChallan.rows[0], description: "এলইডি ডিসপ্লে & সাউন্ড সিস্টেম", deliveryPlace: "ঢাকা" }] }));

const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const browser = await chromium.launch({ headless: true, executablePath: process.argv[3] });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  page.setDefaultTimeout(25000);
  const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  let fail = false;
  await page.route((url) => /^\/api\/(v1|backend)\//.test(url.pathname), async (route) => {
    const request = route.request();
    assert.ok(["GET", "OPTIONS"].includes(request.method()) || request.url().includes("/auth/"), `Unexpected write: ${request.url()}`);
    if (fail && new URL(request.url()).pathname.endsWith("/word")) return route.fulfill({ status: 500, json: { message: "Download unavailable" } });
    return route.continue();
  });
  for (const kind of ["Bill", "Challan"]) {
    await page.goto(`http://localhost:3010/cms/documentation/${kind === "Bill" ? "bill" : "challan"}-submission`);
    await page.getByRole("heading", { name: "Costed Tenders" }).waitFor();
    await page.getByRole("textbox", { name: "Search costed tenders" }).fill(target.tenderNumber);
    await page.locator(`[data-costing-id="${target.id}"]`).getByRole("button", { name: target.tenderNumber, exact: true }).click();
    await page.getByRole("heading", { name: kind === "Bill" ? "Tender Costing Details" : "Product Details", exact: true }).waitFor();
    if (kind === "Challan") {
      await page.getByRole("textbox", { name: "Ref", exact: true }).fill("WORD-ONLY-REF/123");
      await page.locator('input[type="date"]').fill("2026-09-06");
      await page.getByRole("textbox", { name: "Place of Delivery", exact: true }).fill("Word export delivery site");
    }
    const word = page.getByRole("button", { name: "Download Word", exact: true });
    fail = true; await word.click(); await page.locator('p[role="alert"]').waitFor();
    assert.ok(await word.isEnabled()); fail = false;
    const event = page.waitForEvent("download"); await word.click(); const download = await event;
    assert.equal(download.suggestedFilename(), `${kind.toLowerCase()}-${target.tenderNumber}.docx`);
    const filename = path.join(artifacts, `download-${kind.toLowerCase()}.docx`); await download.saveAs(filename);
    const xml = await inspect(await readFile(filename), kind);
    if (kind === "Challan") for (const value of ["WORD-ONLY-REF/123", "06-Sept-2026", "Word export delivery site"]) assert.ok(xml.includes(value));
    for (const width of [1366, 768, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "No horizontal scroll");
      for (const name of ["Print", "Download PDF", "Download Word"]) assert.ok(await page.getByRole("button", { name, exact: true }).isVisible());
      await page.screenshot({ path: path.join(artifacts, `${kind.toLowerCase()}-${width}.png`) });
    }
    await page.setViewportSize({ width: 1366, height: 900 });
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
assert.deepEqual(await read("/project-bills/costing/tenders?limit=100"), billsBefore);
assert.deepEqual(await read("/challan-submissions?limit=100"), challansBefore);
assert.deepEqual(await read(`/tenders/${target.tenderId}`), tenderBefore);
console.log(`PASS Word downloads: genuine editable DOCX, both live pages, PA/totals, no Challan amounts, error/retry, 3 viewports, no business writes. Artifacts: ${artifacts}`);
