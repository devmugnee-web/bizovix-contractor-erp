import { BadRequestException } from "@nestjs/common";
import {
  assertTenderPdf,
  hasValidTenderPdfSignature,
  parseTenderPdfText,
  type UploadedTenderPdf,
} from "./tender-pdf-extraction";

function file(content: string, mimetype = "application/pdf"): UploadedTenderPdf {
  const buffer = Buffer.from(content);
  return { originalname: "tender.pdf", mimetype, size: buffer.length, buffer };
}

describe("Tender PDF extraction", () => {
  it("validates PDF content instead of trusting the extension", () => {
    const pdf = file("%PDF-1.7 test");
    expect(hasValidTenderPdfSignature(pdf)).toBe(true);
    expect(() => assertTenderPdf(pdf)).not.toThrow();
    expect(() => assertTenderPdf(file("not a pdf"))).toThrow(BadRequestException);
    expect(() => assertTenderPdf(file("%PDF-1.7", "text/plain"))).toThrow(BadRequestException);
  });

  it("extracts the visible Add New Tender fields from an e-GP notice", () => {
    const data = parseTenderPdfText(`
      Procurement Nature : Goods
      Tender/Proposal ID : 1279267
      Procurement Method : Open Tendering Method (OTM)
      Tender/Proposal Package No. and Description : 36.01.1504.691.07.145.2026/515
      Procurement of Ten Lac Pcs. WPP+PE Bag
      Category : Packaging products of plastics
      Tender/Proposal Closing Date and Time : 13-Jul-2026 15:00
      Remarks : Samples must be submitted before closing.
      Eligibility of Tenderer : As per TDS
    `);

    expect(data).toEqual({
      egpTenderId: "1279267",
      workName: "Procurement of Ten Lac Pcs. WPP+PE Bag",
      tenderType: "Goods",
      procurementMethod: "OTM",
      submissionDeadline: "2026-07-13",
      remarks: "Samples must be submitted before closing",
    });
  });

  it("normalizes other supported procurement codes and common date formats", () => {
    const data = parseTenderPdfText(`
      Tender ID: 1032866
      Name of Work: Construction of New School Building
      Tender Type: Works
      Procurement Method: One Stage Two Envelopes Tendering Method (OSTETM)
      Closing Date: 21/09/2026 14:00
    `);
    expect(data).toMatchObject({
      egpTenderId: "1032866",
      workName: "Construction of New School Building",
      tenderType: "Works",
      procurementMethod: "OSTETM",
      submissionDeadline: "2026-09-21",
    });
  });

  it("handles the split-line layout used by exported e-GP notices", () => {
    const data = parseTenderPdfText(`
      Procurement Nature :
      Goods
      Tender/Proposal ID :
      1007396
      Procurement Method :
      Open Tendering Method
      (OTM)
      Tender/Proposal Package No. and
      Description :
      21-Aug-2024 10:00
      GR-001 2023-24
      Supply and delivery of underground copper cable
      Category :
      Electrical supplies
      Tender/Proposal Closing
      21-Jan-2026 11:30
      Tender/Proposal Opening
      Date and Time :
      Date and Time :
    `);

    expect(data).toMatchObject({
      egpTenderId: "1007396",
      workName: "Supply and delivery of underground copper cable",
      tenderType: "Goods",
      procurementMethod: "OTM",
      submissionDeadline: "2026-01-21",
    });
  });

  it("does not invent internal Found By or Finding Date values", () => {
    const data = parseTenderPdfText("Tender/Proposal ID: EGP-123456 Tender Type: Works");
    expect(data).toEqual({ egpTenderId: "EGP-123456", tenderType: "Works" });
    expect(data).not.toHaveProperty("foundByName");
    expect(data).not.toHaveProperty("findingDate");
  });

  it("does not fill an impossible closing date", () => {
    const data = parseTenderPdfText(
      "Tender/Proposal ID: 123456 Closing Date: 31-Feb-2026 Tender Type: Works",
    );
    expect(data).not.toHaveProperty("submissionDeadline");
  });
});
