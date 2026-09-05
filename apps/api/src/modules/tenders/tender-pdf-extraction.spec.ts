import { BadRequestException } from "@nestjs/common";
import {
  assertTenderPdf,
  extractTenderSecurityFromTable,
  hasValidTenderPdfSignature,
  parseTenderPdfText,
  type UploadedTenderPdf,
} from "./tender-pdf-extraction";

function file(content: string, mimetype = "application/pdf"): UploadedTenderPdf {
  const buffer = Buffer.from(content);
  return { originalname: "tender.pdf", mimetype, size: buffer.length, buffer };
}

describe("Tender PDF extraction", () => {
  const tableItem = (str: string, x: number, y: number, width: number) => ({ str, x, y, width, fontSize: 7 });
  const securityTableHeader = [
    tableItem("Lot No.", 40, 65, 23),
    tableItem("Identification of Lot", 180, 65, 63),
    tableItem("Location", 369, 65, 28),
    tableItem("Tender/Proposal", 413, 77, 53),
    tableItem("security", 427, 69, 26),
    tableItem("(Amount in", 422, 61, 36),
    tableItem("BDT)", 432, 53, 16),
    tableItem("Tentative Start Date", 473, 65, 47),
    tableItem("Tentative Completion Date", 531, 65, 38),
  ];
  const singleLotRow = [
    tableItem("1", 50, 38, 4),
    tableItem("Repair of electrical equipment", 71, 38, 270),
    tableItem("Premises", 361, 38, 43),
    tableItem("100000", 428, 38, 23),
    tableItem("01-Sep-2026", 477, 38, 39),
    tableItem("01-Dec-2026", 530, 38, 39),
  ];

  it("reads a wrapped security table header from the correct column across a two-page single-lot notice", () => {
    expect(extractTenderSecurityFromTable([
      [...securityTableHeader, ...singleLotRow, tableItem("1/2", 577, 16, 11)],
      [tableItem("Procuring Entity Details:", 40, 720, 120)],
    ], "Invitation for : Tender - Single Lot")).toBe(100000);
  });

  it("does not substitute the lot number, location number or adjacent date for a missing amount", () => {
    expect(extractTenderSecurityFromTable([[...securityTableHeader, ...singleLotRow.filter((item) => item.str !== "100000")]], "")).toBeUndefined();
  });

  it("does not choose or total multiple security lots even when amounts are the same", () => {
    const secondLot = singleLotRow.map((item) => ({ ...item, str: item.str === "1" ? "2" : item.str, y: item.y - 14 }));
    expect(extractTenderSecurityFromTable([[...securityTableHeader, ...singleLotRow, ...secondLot]], "")).toBeUndefined();
    expect(extractTenderSecurityFromTable([[...securityTableHeader, ...singleLotRow], []], "Invitation for: Tender - Multiple Lots")).toBeUndefined();
  });

  it("reads the wrapped In BDT fee label and skips telephone words in category descriptions", () => {
    const data = parseTenderPdfText(`
      Category: Television cameras;Mobile telephones;Telephone equipment
      Document Fees : Package wise
      Tender/Proposal Document Price (In
      BDT) :
      1500
      Mode of Payment : Payment through Bank
      Procuring Entity Details:
      Contact details of Official Inviting Tender/Proposal : Phone No : 031-2510830
      Fax No : 031-2510889
    `);
    expect(data.documentFee).toBe(1500);
    expect(data.paPhone).toBe("031-2510830");
  });

  it("does not read category text or fax numbers as a PA phone number", () => {
    expect(parseTenderPdfText("Category: Mobile telephones;Telephone equipment;12345678 parts Fax No: 031-2510889").paPhone).toBeUndefined();
    expect(parseTenderPdfText("PA Phone Number : +880 (2) 55 66 77 88 Fax No : 0123456789").paPhone).toBe("+880 (2) 55 66 77 88");
    expect(parseTenderPdfText("Phone No : Fax No : 031-2510889").paPhone).toBeUndefined();
  });

  it("extracts notice costs, meeting time and PA information without merging adjacent fields", () => {
    const data = parseTenderPdfText(`
      Organization : Chattogram Port Authority
      Procuring Entity Name : Engineering Division
      Tender/Proposal Document Price (BDT) : 2,000.00
      Tender Security Amount (BDT) : 150,000.50
      Pre-Tender/Proposal Meeting End Date and Time : 10-Sep-2026 3:30 PM
      Name of Official Inviting Tender/Proposal : Md. Karim
      Designation of Official Inviting Tender/Proposal : Executive Engineer
      Address of Official Inviting Tender/Proposal : Port Road, Chattogram
      Phone No. : 01700123456
      Fax No. : 031123456
    `);
    expect(data).toMatchObject({
      noticeOrganization: "Chattogram Port Authority", documentFee: 2000,
      estimatedTenderSecurityAmount: 150000.5, preBidEndDate: "2026-09-10T15:30:00+06:00",
      paName: "Md. Karim", paDesignation: "Executive Engineer",
      paAddress: "Port Road, Chattogram", paPhone: "01700123456",
    });
  });

  it("supports a separate official-contact section and split-line values", () => {
    const data = parseTenderPdfText(`Official Inviting Tender/Proposal :
      Name :
      Ms. Ayesha
      Designation : Assistant Engineer
      Address : 12 Main Road
      Phone Number : 01800123456
      Email : office@example.test
    `);
    expect(data).toMatchObject({ paName: "Ms. Ayesha", paDesignation: "Assistant Engineer", paAddress: "12 Main Road", paPhone: "01800123456" });
  });

  it("reads the official PA fields instead of the preceding e-GP office-table headings", () => {
    const data = parseTenderPdfText(`
      Office Name PE Name Designation Lead Office
      Ministry of Public Administration MD. ALAMGIR KABIR Deputy Secretary Yes
      Procuring Entity Details:
      Name of Official Inviting
      Tender/Proposal :
      MD. ALAMGIR KABIR Designation of Official Inviting Tender/Proposal : Deputy Secretary
      Address of Official Inviting
      Tender/Proposal :
      Address : Bangladesh Secretariat. Dhaka-1000
      City : Dhaka
      Contact details of Official Inviting Tender/Proposal : Phone No : 02-9540540
      Fax No : 02-9545056
    `);
    expect(data).toMatchObject({
      paName: "MD. ALAMGIR KABIR", paDesignation: "Deputy Secretary",
      paAddress: "Bangladesh Secretariat. Dhaka-1000", paPhone: "02-9540540",
    });
  });

  it("does not treat an office table on its own as labelled PA fields", () => {
    const data = parseTenderPdfText(`Office Name PE Name Designation Lead Office
      Ministry of Public Administration MD. ALAMGIR KABIR Deputy Secretary Yes`);
    expect(data.paName).toBeUndefined();
    expect(data.paDesignation).toBeUndefined();
  });

  it.each([
    "Name of Official Inviting Tender/Proposal : Designation of Official Inviting Tender/Proposal : Lead Office",
    "PA Name : PA Designation : Lead Office",
    "PE Name : Designation : Lead Office",
    "Official Inviting Tender/Proposal : Name : Designation : Lead Office",
  ])("does not copy the next labelled field into an empty PA name: %s", (text) => {
    const data = parseTenderPdfText(text + " Phone No : 02-9540540");
    expect(data.paName).toBeUndefined();
    expect(data.paDesignation).toBe("Lead Office");
    expect(data.paPhone).toBe("02-9540540");
  });

  it("keeps missing official names empty instead of falling back to another office", () => {
    const data = parseTenderPdfText(`PE Name : Another office contact Designation : Director
      Procuring Entity Details:
      Name of Official Inviting Tender/Proposal :
      Designation of Official Inviting Tender/Proposal : Deputy Secretary
      Phone No : 02-9540540`);
    expect(data.paName).toBeUndefined();
    expect(data.paDesignation).toBe("Deputy Secretary");
  });

  it("preserves name words and ignores unrelated earlier contact labels", () => {
    const data = parseTenderPdfText(`PE Name : Earlier Contact Designation : Earlier Role
      Name of Official Inviting Tender/Proposal : Md. City Ali
      Designation of Official Inviting Tender/Proposal : Director of City Planning
      Address of Official Inviting Tender/Proposal : Address : City Road, Dhaka
      Phone No : 02-9540540`);
    expect(data).toMatchObject({
      paName: "Md. City Ali", paDesignation: "Director of City Planning",
      paAddress: "City Road, Dhaka",
    });
  });

  it.each(["N/A", "None", "Not applicable", "—"])("does not import a placeholder as a PA name: %s", (name) => {
    expect(parseTenderPdfText(`PA Name : ${name} Designation : Engineer`).paName).toBeUndefined();
  });

  it("keeps zero fees but does not guess percentages or different lot amounts", () => {
    expect(parseTenderPdfText("Document Fee: 0").documentFee).toBe(0);
    expect(parseTenderPdfText("Security Amount: 2 %").estimatedTenderSecurityAmount).toBeUndefined();
    expect(parseTenderPdfText("Security Amount: 20000 Security Amount: 30000").estimatedTenderSecurityAmount).toBeUndefined();
    expect(parseTenderPdfText("Name of Procuring Entity: Engineering Division").paName).toBeUndefined();
    expect(parseTenderPdfText("Meeting End Date and Time: 31-Feb-2026 15:30").preBidEndDate).toBeUndefined();
  });

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
