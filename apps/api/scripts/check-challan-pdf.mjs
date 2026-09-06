// Read-only reference/geometry regression. Sample contents are confined to
// generated test files; they are never inserted into the ERP database.
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { extractText, getDocumentProxy } from "unpdf";
const require = createRequire(import.meta.url);
const { generateChallanLetterPdf } = require("../dist/modules/challan-submissions/challan-letter-pdf.js");
const artifacts = await mkdtemp(path.join(tmpdir(), "bizovix-challan-pdf-"));
const rows = [
  ["CENTRAL UNIT\nBrand: Bosch\nModel: CCSD-CU", "Pcs", "1"],
  ["TABLE TOP CHAIRMAN UNIT\nBrand: Bosch\nModel: CCSD-DL", "Pcs", "1"],
  ["TABLE TOP DELEGATE UNIT\nBrand: Bosch\nModel: CCSD-DL", "Pcs", "35"],
  ["Extension cable", "Pcs", "1"],
  ["UPS\nBrand: MaxGreen\nModel: MGOE-W1KS", "Pcs", "1"],
  ["Indoor LED Video Wall Display\nBrand: Lampro Model: LC3.076P", "sqft", "24"],
  ["Samsung 75 QLED | Tizen Smart TV\nBrand: Samsung\nModel: QA75Q8FAARSER", "Pcs", "1"],
  ["Samsung 65 QLED | Tizen Smart TV\nBrand: Samsung\nModel: QA65Q7FAARSER", "Pcs", "2"],
].map(([description, unit, quantity]) => ({ description, unit, quantity, deliveryPlace: "DC Office, Sunamganj" }));
const fixture = {
  reference: "MM/BL/2025-26/75", date: "", tenderNumber: "1275609",
  recipient: { name: null, designation: "Deputy Commissioner,", organization: "Office of the Deputy Commissioner", address: "DC Office, Sunamganj Sadar, Sunamganj – 3600." },
  contract: { number: "03/2025-26", date: "2026-06-04", label: "NOA Contract No" }, rows,
};
const files = new Map([
  ["reference-challan.pdf", await generateChallanLetterPdf(fixture)],
  ["many-goods.pdf", await generateChallanLetterPdf({ ...fixture, rows: Array.from({ length: 80 }, (_, index) => ({ ...rows[index % rows.length], description: `Item ${index + 1}\n${rows[index % rows.length].description}` })) })],
  ["long-goods.pdf", await generateChallanLetterPdf({ ...fixture, rows: [{ ...rows[0], description: "Full product specifications. ".repeat(600), deliveryPlace: "Detailed delivery address. ".repeat(300) }] })],
  ["bengali-goods.pdf", await generateChallanLetterPdf({ ...fixture, rows: [{ ...rows[0], description: "এলইডি ডিসপ্লে ও সাউন্ড সিস্টেম", deliveryPlace: "ঢাকা" }] })],
]);
for (const [name, bytes] of files) {
  await writeFile(path.join(artifacts, name), bytes);
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  try {
    const { text } = await extractText(pdf, { mergePages: true });
    const flat = text.replace(/\s+/g, " ");
    for (const title of ["Challan", "Ref:", "Date:", "Sub: Application for Acceptance of goods.", "Dear Sir,", "Sl. No.", "Name of Goods", "Unit", "Qty", "Place of Delivery", "Yours Truly,"]) assert.ok(flat.includes(title), `${name}: ${title}`);
    assert.ok(!/Unit BDT|Total BDT|Grand Total|In Words|Discount|pay the above bill|Unit Price|Total Price/i.test(text), `${name}: must be non-financial`);
    if (name === "reference-challan.pdf") {
      assert.equal(pdf.numPages, 1, "Eight goods must fit on one page like the reference");
      for (const row of rows) assert.ok(flat.replace(/\s/g, "").includes(row.description.replace(/\s/g, "")), row.description);
    }
    if (name === "many-goods.pdf" || name === "long-goods.pdf") assert.ok(pdf.numPages > 1);
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      assert.equal(viewport.width, 612); assert.equal(viewport.height, 792);
      const content = await page.getTextContent();
      const items = content.items.filter((item) => item.str?.trim());
      assert.ok(items.length, `${name}: no blank page ${number}`);
      for (const item of items) {
        const style = content.styles[item.fontName];
        const size = Math.hypot(item.transform[2], item.transform[3]);
        const baseline = viewport.height - item.transform[5];
        assert.ok(baseline - size * (style.ascent ?? 1) >= 71.5, `${name}: top ${item.str}`);
        assert.ok(baseline - size * (style.descent ?? 0) <= viewport.height - 71.5, `${name}: bottom ${item.str}`);
        assert.ok(item.transform[4] >= 40, `${name}: left ${item.str}`);
        assert.ok(item.transform[4] + item.width <= viewport.width - 40, `${name}: right ${item.str}`);
      }
      if (number === 1) {
        const title = items.find((item) => item.str === "Challan");
        assert.ok(Math.abs(title.transform[4] + title.width / 2 - 306) < 1);
        const ref = items.find((item) => item.str.startsWith("Ref:"));
        const date = items.find((item) => item.str.startsWith("Date:"));
        assert.ok(Math.abs(ref.transform[5] - date.transform[5]) < 0.5, "Ref/date same line");
      } else if (items.length > 5) {
        assert.ok(items.some((item) => item.str === "Name of Goods"), "Repeat table header on continued pages");
      }
    }
    console.log(`PASS ${name}: ${pdf.numPages} page(s), letter/table geometry, no amounts`);
  } finally { await pdf.destroy(); }
}
const base = "http://127.0.0.1:4000/api/v1";
const login = await fetch(`${base}/auth/dev-login`, { method: "POST" }).then((r) => r.json());
const headers = { Authorization: `Bearer ${login.data.accessToken}` };
const read = async (route) => {
  const response = await fetch(base + route, { headers });
  assert.equal(response.status, 200, route); return response.json();
};
const before = await read("/challan-submissions?limit=100");
const billsBefore = await read("/project-bills/costing/tenders?limit=100");
assert.equal((await fetch(`${base}/challan-submissions/not-a-record/pdf`)).status, 401);
assert.equal((await fetch(`${base}/challan-submissions/not-a-record/pdf`, { headers })).status, 404);
for (const saved of before.data) {
  const response = await fetch(`${base}/challan-submissions/${saved.id}/pdf`, { headers });
  assert.equal(response.status, saved.items.length ? 200 : 400);
  if (response.ok) assert.equal(response.headers.get("content-type"), "application/pdf");
}
assert.deepEqual((await read("/challan-submissions?limit=100")).data, before.data);
assert.deepEqual((await read("/project-bills/costing/tenders?limit=100")).data, billsBefore.data);
console.log(`PASS live authentication, missing-record handling, unchanged records (${before.data.length} saved challans)`);
if (process.argv[2] && process.argv[3]) {
  const { chromium } = await import(pathToFileURL(process.argv[2]).href);
  const browser = await chromium.launch({ headless: true, executablePath: process.argv[3] });
  try {
    const code = await readFile(path.join(path.dirname(require.resolve("unpdf")), "pdfjs.mjs"), "utf8");
    const page = await browser.newPage({ viewport: { width: 920, height: 1280 } });
    await page.setContent('<html><body style="margin:0;background:white"><canvas></canvas></body></html>');
    await page.evaluate(async (code) => { window.pdfjs = await import(URL.createObjectURL(new Blob([code], { type: "text/javascript" }))); }, code);
    for (const [name, bytes] of files) {
      const count = await page.evaluate(async (bytes) => { window.pdf = await window.pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise; return window.pdf.numPages; }, [...bytes]);
      for (const number of [...new Set([1, count])]) {
        await page.evaluate(async (number) => {
          const p = await window.pdf.getPage(number);
          const viewport = p.getViewport({ scale: 1.5 });
          const canvas = document.querySelector("canvas"); canvas.width = viewport.width; canvas.height = viewport.height;
          await p.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
        }, number);
        await page.locator("canvas").screenshot({ path: path.join(artifacts, `${name.replace(".pdf", "")}-${number}.png`) });
      }
      await page.evaluate(() => window.pdf.destroy());
    }
  } finally { await browser.close(); }
}
console.log(`Artifacts: ${artifacts}`);
