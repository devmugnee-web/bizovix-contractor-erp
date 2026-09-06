// Inspect Microsoft Word's own PDF rendering of the generated DOCX files.
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { extractText, getDocumentProxy } from "unpdf";
const artifacts = process.argv[2];
const require = createRequire(import.meta.url);
const files = (await readdir(artifacts)).filter((name) => name.endsWith(".pdf"));
assert.ok(files.length >= 8);
for (const filename of files) {
  const pdf = await getDocumentProxy(new Uint8Array(await readFile(path.join(artifacts, filename))));
  try {
    const { text } = await extractText(pdf, { mergePages: true });
    if (filename.includes("bill")) {
      for (const value of ["Bill", "Unit BDT", "Total BDT", "Discount for Extended LED Display", "Grand Total", "In Words", "Mugnee Multiple."]) assert.ok(text.includes(value), `${filename}: ${value}`);
    } else {
      for (const value of ["Challan", "Name of Goods", "Place of Delivery", "Yours Truly,"]) assert.ok(text.includes(value), `${filename}: ${value}`);
      assert.ok(!/Grand Total|Total BDT|Discount|In Words/.test(text));
    }
    if (filename.startsWith("sample-")) assert.equal(pdf.numPages, 1, `${filename}: reference fits one page`);
    if (filename === "many-challan.pdf") for (let index = 1; index <= 80; index++) assert.ok(text.includes(`Product ${index}`));
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = content.items.filter((item) => item.str?.trim());
      assert.ok(items.length, `${filename}: no blank pages`);
      const margin = filename.includes("bill") ? 71 : 39;
      for (const item of items) {
        assert.ok(item.transform[4] >= margin, `${filename}: left overflow ${item.str}`);
        assert.ok(item.transform[4] + item.width <= viewport.width - margin + 1, `${filename}: right overflow ${item.str}`);
        assert.ok(viewport.height - item.transform[5] <= viewport.height - 70, `${filename}: bottom overflow ${item.str}`);
      }
    }
    console.log(`PASS Word layout: ${filename}, ${pdf.numPages} page(s)`);
  } finally { await pdf.destroy(); }
}
if (process.argv[3] && process.argv[4]) {
  const { chromium } = await import(pathToFileURL(process.argv[3]).href);
  const browser = await chromium.launch({ headless: true, executablePath: process.argv[4] });
  try {
    const code = await readFile(path.join(path.dirname(require.resolve("unpdf")), "pdfjs.mjs"), "utf8");
    const page = await browser.newPage({ viewport: { width: 920, height: 1300 } });
    await page.setContent('<html><body style="margin:0;background:white"><canvas></canvas></body></html>');
    await page.evaluate(async (code) => { window.pdfjs = await import(URL.createObjectURL(new Blob([code], { type: "text/javascript" }))); }, code);
    for (const filename of ["sample-bill.pdf", "sample-challan.pdf", "bengali-challan.pdf"]) {
      const bytes = await readFile(path.join(artifacts, filename));
      await page.evaluate(async (bytes) => {
        const pdf = await window.pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
        const p = await pdf.getPage(1); const viewport = p.getViewport({ scale: 1.5 });
        const canvas = document.querySelector("canvas"); canvas.width = viewport.width; canvas.height = viewport.height;
        await p.render({ canvasContext: canvas.getContext("2d"), viewport }).promise; await pdf.destroy();
      }, [...bytes]);
      await page.locator("canvas").screenshot({ path: path.join(artifacts, filename.replace(".pdf", "-word-render.png")) });
    }
  } finally { await browser.close(); }
}
