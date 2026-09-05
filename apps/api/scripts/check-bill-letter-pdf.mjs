// Read-only PDF visual/geometry regression. The supplied example is a test fixture,
// never a source for saved tenders, reference numbers, completion status or money.
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { extractText, getDocumentProxy } from "unpdf";
const require = createRequire(import.meta.url);
const { generateBillLetterPdf } = require("../dist/modules/project-bills/bill-letter-pdf.js");
const artifacts = await mkdtemp(path.join(tmpdir(), "bizovix-bill-letter-"));
const rows = [
  ["CENTRAL UNIT\nBrand: Bosch\nModel: CCSD-CU", "Nos", "1", "122500.300", "122500.300"],
  ["TABLE TOP CHAIRMAN UNIT\nBrand: Bosch\nModel: CCSD-DL", "Nos", "1", "33923.160", "33923.160"],
  ["TABLE TOP DELEGATE UNIT\nBrand: Bosch\nModel: CCSD-DL", "Nos", "35", "33923.160", "1187310.600"],
  ["Extension cable", "Nos", "1", "28269.300", "28269.300"],
  ["UPS\nBrand: MaxGreen\nModel: MGOE-W1KS", "Nos", "1", "56538.600", "56538.600"],
  ["Indoor LED Video Wall Display\nBrand: Lampro Model: LC3.076P", "Psft", "39.6", "10993.580", "435345.768"],
  ["75inch Interactive Flat Panel\nBrand: Ingscreen\nModel: IS-7518", "Nos", "1", "376924.000", "376924.000"],
  ["Samsung 65 QLED | Tizen Smart TV\nBrand: Samsung\nModel: QA65Q7FAARSER", "Nos", "2", "320385.400", "640770.800"],
].map(([productName, unit, quantity, unitPrice, totalPrice], index) => ({ id: `fixture-${index}`, productName, unit, quantity, unitPrice, totalPrice }));
const fixture = {
  source: "TENDER_COSTING", project: { id: "fixture-only", workName: "supply of Conference System, LED Display, Android LED TV", organizationName: "Office of the Deputy Commissioner" },
  tenderNumber: "1275609", pa: { name: null, designation: "Deputy Commissioner,", address: "DC Office, Sunamganj Sadar, Sunamganj - 3600.", phone: null, email: null },
  rows, itemsTotalPrice: "2881582.528", adjustments: [{ label: "Discount for Extended LED Display", amount: "-41582.528" }], totalPrice: "2840000.00", emptyReason: null,
};
const context = { reference: "MM/BL/2025-26/78", payeeName: "Mugnee Multiple", contract: { number: "03/2025-26", date: "2026-06-04", label: "NOA Contract No" } };
const files = new Map();
files.set("reference-example.pdf", await generateBillLetterPdf(fixture, context));
files.set("large-description.pdf", await generateBillLetterPdf({ ...fixture, rows: [{ ...rows[0], productName: "Long description " + "Complete specifications and installation accessories. ".repeat(250) }], adjustments: [], totalPrice: "122500.30", itemsTotalPrice: "122500.30" }));
files.set("bengali-example.pdf", await generateBillLetterPdf({ ...fixture, project: { ...fixture.project, workName: "এলইডি ডিসপ্লে সরবরাহ" }, rows: [{ ...rows[0], productName: "এলইডি ডিসপ্লে", unit: "Nos" }], adjustments: [], totalPrice: "122500.30", itemsTotalPrice: "122500.30" }));
const base = "http://127.0.0.1:4000/api/v1";
const login = await fetch(`${base}/auth/dev-login`, { method: "POST" }).then((r) => r.json());
const headers = { Authorization: `Bearer ${login.data.accessToken}` };
const get = async (route) => {
  const response = await fetch(base + route, { headers });
  assert.equal(response.status, 200, route);
  return (await response.json()).data;
};
const summaries = await get("/project-bills/costing/tenders?limit=100");
const target = summaries.find((item) => item.tenderNumber === "1318963");
assert.ok(target, "Expected saved tender 1318963");
const before = await get(`/tenders/${target.tenderId}`);
const reportBefore = await get(`/project-bills/costing/tenders/${target.id}`);
const response = await fetch(`${base}/project-bills/costing/tenders/${target.id}/pdf`, { headers });
assert.equal(response.status, 200);
files.set("tender-1318963.pdf", Buffer.from(await response.arrayBuffer()));
for (const [name, bytes] of files) {
  await writeFile(path.join(artifacts, name), bytes);
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  try {
    const { text } = await extractText(pdf, { mergePages: true });
    assert.ok(text.includes("Bill") && text.includes("In Words:") && text.includes("Yours Truly,"), name);
    const flatText = text.replace(/\s+/g, " ");
    assert.ok(flatText.includes("Therefore, you are kindly requested to pay the above bill in favor of Mugnee Multiple."), `${name}: exact payment request`);
    assert.equal(text.split("Discount for Extended LED Display").length - 1, 1, `${name}: one discount row`);
    assert.ok(text.indexOf("Total=") < text.indexOf("Discount for Extended LED Display") && text.indexOf("Discount for Extended LED Display") < text.indexOf("Grand Total ="), `${name}: discount row order`);
    assert.ok(!text.includes("successfully completed"), name);
    if (name === "reference-example.pdf") {
      assert.equal(pdf.numPages, 1, "The eight-product example should fit on one page");
      assert.ok(text.includes("Twenty-Eight Lakh Forty Thousand Taka Only."));
      for (const row of rows) assert.ok(text.replace(/\s+/g, "").includes(row.productName.replace(/\s+/g, "")), row.productName);
    }
    if (name === "large-description.pdf") assert.ok(pdf.numPages > 1);
    if (name === "tender-1318963.pdf") {
      assert.ok(text.includes(before.paName) && text.includes(before.paDesignation));
      assert.ok(!text.includes(context.reference) && !text.includes(context.contract.number), "Do not copy reference fixture identifiers into real bills");
    }
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = content.items.filter((item) => item.str?.trim());
      assert.ok(items.length, `${name}: blank page ${number}`);
      const discount = items.find((item) => item.str === "Discount for Extended LED Display");
      if (discount && name === "tender-1318963.pdf" && !reportBefore.adjustments?.some((entry) => entry.label === "Discount for Extended LED Display")) {
        assert.equal(items.filter((item) => item.transform[4] > viewport.width - 72 - 84 && Math.abs(item.transform[5] - discount.transform[5]) < 3).length, 0, "Unassigned discount amount must be blank");
      }
      for (const item of items) {
        const style = content.styles[item.fontName];
        const fontSize = Math.hypot(item.transform[2], item.transform[3]);
        const baseline = viewport.height - item.transform[5];
        assert.ok(baseline - fontSize * (style.ascent ?? 1) >= 89.5, `${name} p${number}: top margin: ${item.str}`);
        assert.ok(baseline - fontSize * (style.descent ?? 0) <= viewport.height - 71.5, `${name} p${number}: bottom margin: ${item.str}`);
        assert.ok(item.transform[4] >= 71.5, `${name} p${number}: left margin: ${item.str}`);
        assert.ok(item.transform[4] + item.width <= viewport.width - 71.5, `${name} p${number}: right margin: ${item.str}`);
      }
      if (number === 1) {
        const bill = items.find((item) => item.str === "Bill");
        assert.ok(bill);
        assert.ok(Math.abs(bill.transform[4] + bill.width / 2 - viewport.width / 2) < 1, "Bill must be centered");
        const ref = items.find((item) => item.str.startsWith("Ref:"));
        const date = items.find((item) => item.str.startsWith("Date:"));
        assert.ok(ref && date && date.transform[4] > ref.transform[4]);
        assert.ok(Math.abs(ref.transform[5] - date.transform[5]) < 0.5, "Ref and Date must share a row");
      }
    }
    console.log(`PASS ${name}: ${pdf.numPages} page(s), four margins, letter content and geometry`);
  } finally { await pdf.destroy(); }
}
assert.deepEqual(await get(`/tenders/${target.tenderId}`), before);
assert.deepEqual(await get(`/project-bills/costing/tenders/${target.id}`), reportBefore);
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
        await page.locator("canvas").screenshot({ path: path.join(artifacts, `${name.replace(".pdf", "")}-page-${number}.png`) });
      }
      await page.evaluate(async () => { await window.pdf.destroy(); });
    }
  } finally { await browser.close(); }
}
console.log(`No business records changed. Artifacts: ${artifacts}`);
