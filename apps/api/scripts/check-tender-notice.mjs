// Read-only application smoke test: imports an in-memory PDF, never saves a tender.
import assert from "node:assert/strict";
import PDFDocument from "pdfkit";

const base = "http://127.0.0.1:4000/api/v1";
const login = await fetch(`${base}/auth/dev-login`, { method: "POST" }).then((r) => r.json());
assert.ok(login.data?.accessToken, "Local development login failed");
const headers = { Authorization: `Bearer ${login.data.accessToken}` };
const pdf = new PDFDocument();
const chunks = [];
const bytes = new Promise((resolve, reject) => {
  pdf.on("data", (chunk) => chunks.push(chunk));
  pdf.on("end", () => resolve(Buffer.concat(chunks)));
  pdf.on("error", reject);
});
pdf.fontSize(10).text([
  "Tender/Proposal ID: 9912345",
  "Name of Work: Supply of Equipment",
  "Tender Type: Goods",
  "Procurement Method: OTM",
  "Closing Date: 20-Sep-2026",
  "Organization: Port Authority",
  "Tender/Proposal Document Price (BDT): 2000",
  "Tender Security Amount (BDT): 50000",
  "Pre-Tender/Proposal Meeting End Date and Time: 10-Sep-2026 15:30",
  "Name of Official Inviting Tender/Proposal: Md Karim",
  "Designation of Official Inviting Tender/Proposal: Engineer",
  "Address of Official Inviting Tender/Proposal: Port Road",
  "Phone No.: 01700123456",
].join("\n"));
pdf.end();
const form = new FormData();
form.append("file", new Blob([await bytes], { type: "application/pdf" }), "notice-test.pdf");
const imported = await fetch(`${base}/tenders/extract-pdf`, { method: "POST", headers, body: form });
assert.ok(imported.ok, `PDF import status ${imported.status}`);
const result = (await imported.json()).data;
assert.equal(result.data.documentFee, 2000);
assert.equal(result.data.estimatedTenderSecurityAmount, 50000);
assert.equal(result.data.preBidEndDate, "2026-09-10T15:30:00+06:00");
assert.equal(result.data.paName, "Md Karim");
assert.equal(result.data.paDesignation, "Engineer");
assert.equal(result.data.paPhone, "01700123456");
assert.equal(result.data.paAddress, "Port Road");
assert.equal(result.data.noticeOrganization, "Port Authority");
console.log(`PDF endpoint: passed (${result.extractedFieldCount} fields)`);
const unauthorized = await fetch(`${base}/tenders/extract-pdf`, { method: "POST" });
assert.equal(unauthorized.status, 401);
console.log("Unauthenticated import: blocked");
const tenders = await fetch(`${base}/tenders?limit=1`, { headers }).then((r) => r.json());
assert.ok(tenders.success, "Tender list failed");
const first = (Array.isArray(tenders.data) ? tenders.data : tenders.data.items)?.[0];
if (first) {
  const response = await fetch(`${base}/tenders/${first.id}`, { headers }).then((r) => r.json());
  assert.ok(response.success, "Tender detail failed");
  assert.ok(Object.hasOwn(response.data, "paName"));
  assert.ok(Object.hasOwn(response.data, "documentFee"));
  console.log("Existing tender read: passed (new nullable fields available)");
}
for (const path of ["/tenders", "/tenders/create"]) {
  const response = await fetch(`http://127.0.0.1:3010${path}`);
  assert.equal(response.status, 200);
  console.log(`Renderer ${path}: HTTP 200`);
}
