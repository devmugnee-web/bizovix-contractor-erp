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
      },
      {
        description: "Network Switch 24 Port",
        unit: "Pcs",
        quantity: 5,
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
      },
      {
        description: "Online UPS with batteries",
        unit: "Set",
        quantity: 4,
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
      },
    ]);
  });

  it("maps only Description of Item, Measurement Unit and Quantity using the PDF headers", () => {
    const rows = parseTenderCostingPdfText(`
      Bill of Quantities
      SL | Group | Description of Item | Measurement Unit | Quantity | Unit Price | Total Price
      1 | N/A | Interactive Flat Panel Display | Nos | 4 | 250,000 | 1,000,000
      2 | IT Equipment | Desktop Computer with Monitor | Set | 8 | 75,000 | 600,000
      3 | N/A | Online UPS with Battery Backup | Pcs | 2 | 95,000 | 190,000
      4 | Electrical | Network Rack with Accessories | Nos | 1 | 45,000 | 45,000
      Grand Total | 1,835,000
    `);

    expect(rows).toEqual([
      { description: "Interactive Flat Panel Display", unit: "Nos", quantity: 4 },
      { description: "Desktop Computer with Monitor", unit: "Set", quantity: 8 },
      { description: "Online UPS with Battery Backup", unit: "Pcs", quantity: 2 },
      { description: "Network Rack with Accessories", unit: "Nos", quantity: 1 },
    ]);
  });

  it("keeps the complete Description of Item when it is longer than 500 characters", () => {
    const description =
      `Supply, installation, testing and commissioning of equipment ` +
      `with complete technical specifications, accessories and required services. `.repeat(8).trim();
    const rows = parseTenderCostingPdfText(`
      Bill of Quantities
      SL | Group | Description of Item | Measurement Unit | Quantity | Unit Price | Total Price
      1 | N/A | ${description} | Nos | 2 | 250,000 | 500,000
    `);

    expect(description.length).toBeGreaterThan(500);
    expect(rows[0]?.description).toBe(description);
  });

  it("preserves specification numbers at the start of Description of Item", () => {
    const rows = parseTenderCostingPdfText(`
      Bill of Quantities
      Item No | Description of Item | Measurement Unit | Quantity
      2 | 5 Thread Over Lock Machine | Nos | 2
      3 | 4 Thread Overlock Machine | Nos | 1
      4 | 3 Thread Overlock Machine | Nos | 1
    `);

    expect(rows.map((row) => row.description)).toEqual([
      "5 Thread Over Lock Machine",
      "4 Thread Overlock Machine",
      "3 Thread Overlock Machine",
    ]);
  });

  it("validates the PDF signature and rejects an empty upload", async () => {
    expect(hasValidTenderCostingPdfSignature(file("%PDF-1.7 test"))).toBe(true);
    expect(hasValidTenderCostingPdfSignature(file("not a pdf"))).toBe(false);
    await expect(extractTenderCostingPdfs([])).rejects.toThrow(BadRequestException);
  });
});
