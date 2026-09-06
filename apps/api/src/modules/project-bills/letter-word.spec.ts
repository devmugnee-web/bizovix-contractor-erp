import { generateBillLetterWord } from "./bill-letter-word";
import { generateChallanLetterWord } from "../challan-submissions/challan-letter-word";
import type { ProjectCostingReport } from "@bizovix/types";
import type { ChallanLetter } from "../challan-submissions/challan-letter-pdf";
import { BILL_PAYMENT_REQUEST } from "./bill-letter-pdf";
import { WORD_MIME, sendWordDocument } from "../../common/documents/word-letter";
import type { Response } from "express";
import { createRequire } from "node:module";

// Inspect the OOXML archive using the ZIP implementation bundled with docx.
const readModule = createRequire(__filename);
const zip = readModule(readModule.resolve("jszip", { paths: [readModule.resolve("docx")] })) as {
  loadAsync(buffer: Buffer): Promise<{ files: Record<string, unknown>; file(name: string): { async(type: "string"): Promise<string> } }>;
};
const bill: ProjectCostingReport = {
  source: "TENDER_COSTING", project: { id: "tender-a", workName: "Display & Sound", organizationName: "Notice Organization" },
  tenderNumber: "1318963", pa: { name: "Saved PA", designation: "Engineer", phone: "01712345678", address: "Saved address", email: null },
  rows: [{ id: "row-a", productName: "Display <Panel> & Sound", unit: "Nos", quantity: "2.500", unitPrice: "18.200000", totalPrice: "45.50" }],
  itemsTotalPrice: "45.50", totalPrice: "45.50", emptyReason: null,
};
const challan: ChallanLetter = {
  reference: "REF/01", date: "2026-09-06", tenderNumber: "1318963",
  recipient: { name: "Saved PA", designation: "Engineer", organization: "Notice Organization", address: "Saved address" }, contract: null,
  rows: [{ description: "Display <Panel> & Sound\nBrand: A\nModel: B", unit: "Nos", quantity: "2.500", deliveryPlace: "Delivery site" }],
};

describe("Editable Bill and Challan Word exports", () => {
  it("generates a real, macro-free DOCX with editable text and tables", async () => {
    const buffer = await generateBillLetterWord(bill);
    expect(buffer.subarray(0, 2).toString()).toBe("PK");
    const archive = await zip.loadAsync(buffer);
    expect(archive.files).toHaveProperty(["[Content_Types].xml"]);
    expect(archive.files).toHaveProperty(["word/document.xml"]);
    expect(Object.keys(archive.files).some((name) => /vbaProject|word\/media/.test(name))).toBe(false);
    const xml = await archive.file("word/document.xml").async("string");
    expect(xml).toContain("<w:tbl>"); expect(xml).toContain("<w:t");
    expect(xml).toContain("Display &lt;Panel&gt; &amp; Sound");
    expect(xml).not.toContain("<Panel>");
    expect(xml).toContain('w:top="1800"'); expect(xml).toContain('w:bottom="1440"');
    expect(xml).toContain('w:left="1440"'); expect(xml).toContain('w:right="1440"');
    expect(xml).toContain('w:w="11906"'); expect(xml).toContain('w:h="16838"');
  });
  it("preserves Bill totals, exact payment text, blank discount and PA", async () => {
    const xml = await (await zip.loadAsync(await generateBillLetterWord(bill, { productDetails: { "row-a": "Brand: A\nModel: B" } }))).file("word/document.xml").async("string");
    for (const text of ["Saved PA", "01712345678", "Brand: A", "Model: B", "18.200", "45.500", "45.50", "Grand Total =", "In Words:", BILL_PAYMENT_REQUEST]) expect(xml).toContain(text);
    expect(xml.split("Discount for Extended LED Display").length - 1).toBe(1);
    expect(xml.indexOf("Total=")).toBeLessThan(xml.indexOf("Discount for Extended LED Display"));
    expect(xml.indexOf("Discount for Extended LED Display")).toBeLessThan(xml.indexOf("Grand Total ="));
    expect(xml).toContain('<w:gridSpan w:val="5"');
    expect(xml).toContain("<w:tblHeader");
  });
  it("retains all stored adjustments without inventing or duplicating the discount", async () => {
    const xml = await (await zip.loadAsync(await generateBillLetterWord({ ...bill, adjustments: [{ label: "Discount for Extended LED Display", amount: "-5" }, { label: "Freight Cost", amount: "10" }], totalPrice: "50.50" }))).file("word/document.xml").async("string");
    expect(xml.split("Discount for Extended LED Display").length - 1).toBe(1);
    for (const text of ["5.000", "Freight Cost", "10.000", "50.50"]) expect(xml).toContain(text);
  });
  it("exports the five-column Challan with Ref/Date/delivery but no financial fields", async () => {
    const xml = await (await zip.loadAsync(await generateChallanLetterWord(challan))).file("word/document.xml").async("string");
    for (const text of ["Challan", "REF/01", "06-Sept-2026", "Saved PA", "Name of Goods", "Place of Delivery", "Delivery site", "2.5", "Brand: A", "Model: B", "Yours Truly,"]) expect(xml).toContain(text);
    expect(xml).not.toMatch(/Unit BDT|Total BDT|Grand Total|In Words|Discount|pay the above bill/);
    expect(xml).toContain('w:w="12240"'); expect(xml).toContain('w:h="15840"');
    expect(xml).toContain('w:top="1440"'); expect(xml).toContain('w:w="10620"');
  });
  it("preserves Unicode, long descriptions and every row", async () => {
    const rows = Array.from({ length: 80 }, (_, index) => ({ ...challan.rows[0]!, description: `পণ্য ${index + 1} & Display` }));
    rows[0]!.description += " Specifications".repeat(500);
    const xml = await (await zip.loadAsync(await generateChallanLetterWord({ ...challan, rows }))).file("word/document.xml").async("string");
    for (let index = 1; index <= 80; index++) expect(xml).toContain(`পণ্য ${index} &amp; Display`);
    expect(xml.split("Specifications").length - 1).toBe(500);
  });
  it("omits an imported Address label from Challan delivery cells without changing recipient data", async () => {
    const letter = { ...challan, recipient: { ...challan.recipient, address: "Address : Recipient office" }, rows: [{ ...challan.rows[0]!, deliveryPlace: "Address : Address:\nDelivery site" }] };
    const before = JSON.stringify(letter);
    const xml = await (await zip.loadAsync(await generateChallanLetterWord(letter))).file("word/document.xml").async("string");
    expect(xml).toContain("Address : Recipient office");
    const table = xml.slice(xml.indexOf("Place of Delivery"));
    expect(table).toContain("Delivery site"); expect(table).not.toMatch(/Address\s*:/i);
    expect(JSON.stringify(letter)).toBe(before);
  });
  it("rejects empty documents and uses private download response headers", async () => {
    await expect(generateBillLetterWord({ ...bill, rows: [] })).rejects.toThrow("No saved costing items");
    await expect(generateChallanLetterWord({ ...challan, rows: [] })).rejects.toThrow("No goods");
    const response = { setHeader: jest.fn(), send: jest.fn() };
    const buffer = await generateChallanLetterWord(challan);
    sendWordDocument(response as unknown as Response, buffer, 'challan-REF/01.docx');
    expect(response.setHeader).toHaveBeenCalledWith("Content-Type", WORD_MIME);
    expect(response.setHeader).toHaveBeenCalledWith("Content-Disposition", 'attachment; filename="challan-REF_01.docx"');
    expect(response.setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    expect(response.send).toHaveBeenCalledWith(buffer);
  });
});
