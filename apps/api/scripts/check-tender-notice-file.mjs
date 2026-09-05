// Verify a user-supplied PDF against expected values, without saving any tender.
// Arguments: pdfPath securityAmount documentFee phone [playwrightModule chromiumExecutable]
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

const [pdfPath, security, fee, phone, playwrightModule, chromiumExecutable] = process.argv.slice(2);
assert.ok(pdfPath && security && fee && phone, "Provide PDF path and three expected values");
const buffer = await readFile(pdfPath);
const login = await fetch("http://127.0.0.1:4000/api/v1/auth/dev-login", { method: "POST" }).then((response) => response.json());
assert.ok(login.data?.accessToken, "Development login failed");
const form = new FormData();
form.append("file", new Blob([buffer], { type: "application/pdf" }), path.basename(pdfPath));
const response = await fetch("http://127.0.0.1:4000/api/v1/tenders/extract-pdf", {
  method: "POST", headers: { Authorization: `Bearer ${login.data.accessToken}` }, body: form,
});
assert.equal(response.status, 200);
const data = (await response.json()).data.data;
assert.equal(data.estimatedTenderSecurityAmount, Number(security));
assert.equal(data.documentFee, Number(fee));
assert.equal(data.paPhone, phone);
console.log("User PDF API check passed:", JSON.stringify({ security: data.estimatedTenderSecurityAmount, fee: data.documentFee, phone: data.paPhone }));

if (playwrightModule && chromiumExecutable) {
  const { chromium } = await import(pathToFileURL(playwrightModule).href);
  const browser = await chromium.launch({ headless: true, executablePath: chromiumExecutable });
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    await page.goto("http://localhost:3010/tenders");
    await page.getByRole("button", { name: "Add New Tender", exact: true }).click({ timeout: 60000 });
    await page.locator('input[type="file"]').setInputFiles({ name: path.basename(pdfPath), mimeType: "application/pdf", buffer });
    for (const [field, value] of Object.entries({ estimatedTenderSecurityAmount: security, documentFee: fee, paPhone: phone })) {
      await page.waitForFunction(({ field, value }) => document.querySelector(`[name="${field}"]`)?.value === value, { field, value });
      assert.equal(await page.locator(`[name="${field}"]`).inputValue(), value);
    }
    console.log("User PDF browser check passed: all three inputs autofilled. No tender saved.");
  } finally {
    await browser.close();
  }
}
