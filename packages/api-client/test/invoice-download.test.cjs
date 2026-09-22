const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

test("invoice PDF uses the local capability transport and preserves bytes, MIME and invoice filename", async () => {
  const bytes = Buffer.from("%PDF-1.4\nisolated invoice transport fixture\n");
  let received;
  const server = http.createServer((request, response) => {
    received = { url: request.url, method: request.method, authorization: request.headers.authorization, capability: request.headers["x-bizovix-local-capability"] };
    response.writeHead(200, { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="server-name.pdf"' });
    response.end(bytes);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const original = { window: global.window, document: global.document, create: URL.createObjectURL, revoke: URL.revokeObjectURL };
  let downloadedBlob;
  let clicked = false;
  let removed = false;
  let revoked;
  const anchor = { href: "", download: "", click() { clicked = true; }, remove() { removed = true; } };
  const values = new Map([["bizovix_access_token", "local-session"]]);
  global.window = {
    localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) },
    bizovix: { localServiceEnabled: true, getRuntimeInfo: async () => ({ localApiUrl: `http://127.0.0.1:${server.address().port}/api/v1`, localCapability: "download-fixture-capability" }) },
  };
  global.document = { createElement: () => anchor, body: { appendChild: (value) => assert.equal(value, anchor) } };
  URL.createObjectURL = (blob) => { downloadedBlob = blob; return "blob:invoice-fixture"; };
  URL.revokeObjectURL = (url) => { revoked = url; };
  try {
    const client = require("../dist/index.js");
    client.configureApiClient({ baseUrl: "http://127.0.0.1:9/wrong-cloud-fallback" });
    await client.downloadInvoicePdf("invoice-id", "INV-007");
    assert.deepEqual(received, { url: "/api/v1/billing/invoices/invoice-id/pdf", method: "GET", authorization: "Bearer local-session", capability: "download-fixture-capability" });
    assert.equal(downloadedBlob.type, "application/pdf");
    assert.deepEqual(Buffer.from(await downloadedBlob.arrayBuffer()), bytes);
    assert.equal(anchor.download, "INV-007.pdf");
    assert.equal(anchor.href, "blob:invoice-fixture");
    assert.equal(clicked, true);
    assert.equal(removed, true);
    assert.equal(revoked, "blob:invoice-fixture");
  } finally {
    for (const key of ["window", "document"]) { if (original[key] === undefined) delete global[key]; else global[key] = original[key]; }
    URL.createObjectURL = original.create;
    URL.revokeObjectURL = original.revoke;
    await new Promise((resolve) => server.close(resolve));
  }
});
