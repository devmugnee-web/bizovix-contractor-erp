import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { generateChallanLetterPdf, type ChallanLetter } from "./challan-letter-pdf";
import { generateChallanLetterWord } from "./challan-letter-word";

@Injectable()
export class ChallanPdfService {
  constructor(private readonly prisma: PrismaService) {}

  async letter(organizationId: string, id: string): Promise<ChallanLetter> {
    // Select only the fields needed by the non-financial document.
    const challan = await this.prisma.challanSubmission.findFirst({
      where: { id, organizationId },
      select: {
        challanNo: true, challanDate: true, receivedAt: true, cmsWorkId: true,
        cmsWork: { select: { organizationId: true, tenderId: true, documentPurchase: { select: { organizationId: true, linkedTenderId: true } } } },
        contract: { select: { organizationId: true, cmsWorkId: true, tenderId: true, contractNo: true, contractDate: true, issueDate: true, contractType: true } },
        items: { where: { organizationId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }], select: { description: true, unit: true, quantity: true } },
      },
    });
    if (!challan || challan.cmsWork.organizationId !== organizationId) throw new NotFoundException("Challan not found");
    if (!challan.items.length) throw new BadRequestException("Add goods and save the challan before downloading its document");
    const contract = challan.contract?.organizationId === organizationId && challan.contract.cmsWorkId === challan.cmsWorkId ? challan.contract : null;
    const purchase = challan.cmsWork.documentPurchase;
    const tenderId = contract?.tenderId ?? challan.cmsWork.tenderId ?? (purchase?.organizationId === organizationId ? purchase.linkedTenderId : null);
    const tender = tenderId ? await this.prisma.tender.findFirst({
      where: { id: tenderId, organizationId },
      select: { egpTenderId: true, paName: true, paDesignation: true, paAddress: true, noticeOrganization: true, organizationMaster: { select: { fullName: true, shortName: true } } },
    }) : null;
    return {
      reference: challan.challanNo, date: challan.challanDate.toISOString(), tenderNumber: tender?.egpTenderId ?? null,
      recipient: { name: tender?.paName || null, designation: tender?.paDesignation || null, address: tender?.paAddress || null, organization: tender?.noticeOrganization || tender?.organizationMaster?.fullName || tender?.organizationMaster?.shortName || null },
      contract: contract ? { number: contract.contractNo, date: (contract.contractDate ?? contract.issueDate).toISOString(), label: contract.contractType === "WORK_ORDER" ? "Work Order No" : "Contract No" } : null,
      // Delivery location is the saved Received At field, never guessed from PA address.
      rows: challan.items.map((item) => ({ description: item.description, unit: item.unit, quantity: item.quantity.toFixed(3), deliveryPlace: challan.receivedAt })),
    };
  }

  async pdf(organizationId: string, id: string) {
    const letter = await this.letter(organizationId, id);
    return { buffer: await generateChallanLetterPdf(letter), reference: letter.reference };
  }

  async word(organizationId: string, id: string) {
    const letter = await this.letter(organizationId, id);
    return { buffer: await generateChallanLetterWord(letter), reference: letter.reference };
  }
}
