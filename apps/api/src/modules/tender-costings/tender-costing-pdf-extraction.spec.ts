import { BadRequestException } from "@nestjs/common";
import {
  extractTenderCostingPdfs,
  hasValidTenderCostingPdfSignature,
  parseTenderCostingPdfText,
  type UploadedTenderCostingPdf,
} from "./tender-costing-pdf-extraction";

function file(content: string, mimetype = "application/pdf"): UploadedTenderCostingPdf {
  const buffer = Buffer.from(content);
  return { originalname: "boq.pdf", mimetype, size: buffer.length, buffer };
}

describe("Tender costing PDF extraction", () => {
  it("extracts pipe-separated BOQ rows without importing headers or totals", () => {
    const rows = parseTenderCostingPdfText(`
      Bill of Quantities
      SL | Product / Work Name | Unit | Qty | Unit Price | Total Price
      1 | Desktop Computer with accessories | Nos | 10 | 50,000 | 500,000
      2 | Network Switch 24 Port | Pcs | 5 | 12,500 | 62,500
      Grand Total | 562,500
    `);

    expect(rows).toEqual([
      {
        description: "Desktop Computer with accessories",
        unit: "Nos",
        quantity: 10,
        unitPrice: 50000,
        totalPrice: 500000,
      },
      {
        description: "Network Switch 24 Port",
        unit: "Pcs",
        quantity: 5,
        unitPrice: 12500,
        totalPrice: 62500,
      },
    ]);
  });

  it("extracts rows when quantity appears before or after the unit", () => {
    const rows = parseTenderCostingPdfText(`
      Price Schedule Description Unit Quantity
      1 Supply and installation of CCTV Camera Nos 12 7500 90000
      2 Online UPS with batteries 4 Set 85000 340000
    `);

    expect(rows).toEqual([
      {
        description: "Supply and installation of CCTV Camera",
        unit: "Nos",
        quantity: 12,
        unitPrice: 7500,
        totalPrice: 90000,
      },
      {
        description: "Online UPS with batteries",
        unit: "Set",
        quantity: 4,
        unitPrice: 85000,
        totalPrice: 340000,
      },
    ]);
  });

  it("extracts a row whose cells are stacked on separate PDF text lines", () => {
    const rows = parseTenderCostingPdfText(`
      Schedule of Requirements
      1
      Repair and maintenance of conference sound system
      Service
      2
      150000
      300000
    `);

    expect(rows).toEqual([
      {
        description: "Repair and maintenance of conference sound system",
        unit: "Service",
        quantity: 2,
        unitPrice: 150000,
        totalPrice: 300000,
      },
    ]);
  });

  it("normalizes Bangla digits and removes duplicate BOQ rows", () => {
    const rows = parseTenderCostingPdfText(`
      Bill of Quantities Description Unit Qty
      ১ | LED Display Panel | Nos | ২ | ২৫,০০০ | ৫০,০০০
      ১ | LED Display Panel | Nos | ২ | ২৫,০০০ | ৫০,০০০
    `);
    expect(rows).toEqual([
      {
        description: "LED Display Panel",
        unit: "Nos",
        quantity: 2,
        unitPrice: 25000,
        totalPrice: 50000,
      },
    ]);
  });

  it("validates the PDF signature and rejects an empty upload", async () => {
    expect(hasValidTenderCostingPdfSignature(file("%PDF-1.7 test"))).toBe(true);
    expect(hasValidTenderCostingPdfSignature(file("not a pdf"))).toBe(false);
    await expect(extractTenderCostingPdfs([])).rejects.toThrow(BadRequestException);
  });
});
