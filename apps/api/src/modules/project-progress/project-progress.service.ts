import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectBillsService } from "../project-bills/project-bills.service";

const D = (v: Prisma.Decimal | number | string) => new Prisma.Decimal(v);

@Injectable()
export class ProjectProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bills: ProjectBillsService,
  ) {}

  private async assertWork(organizationId: string, cmsWorkId: string) {
    const work = await this.prisma.cmsWork.findFirst({ where: { id: cmsWorkId, organizationId } });
    if (!work) throw new NotFoundException("Project / Work not found");
    return work;
  }

  async progress(organizationId: string, cmsWorkId: string) {
    const work = await this.assertWork(organizationId, cmsWorkId);
    const [items, contract, billStats] = await Promise.all([
      this.prisma.boqItem.findMany({ where: { organizationId, cmsWorkId }, orderBy: { sortOrder: "asc" } }),
      this.prisma.projectContract.findFirst({
        where: { organizationId, cmsWorkId, status: { not: "CANCELLED" } },
        orderBy: { createdAt: "desc" },
        select: { currentContractValue: true },
      }),
      this.bills.stats(organizationId, cmsWorkId),
    ]);

    const contractQtyValue = items.reduce((sum, i) => sum.add(i.contractAmount), D(0));
    const executedValue = items.reduce((sum, i) => sum.add(i.executedValue), D(0));
    const physicalProgressPct = contractQtyValue.gt(0) ? executedValue.div(contractQtyValue).mul(100).toFixed(2) : "0.00";

    const contractValue = contract?.currentContractValue ?? work.contractValue;
    const netCertified = D(billStats.netCertified);
    const received = D(billStats.received);
    const financialProgressPct = contractValue.gt(0) ? netCertified.div(contractValue).mul(100).toFixed(2) : "0.00";
    const collectionProgressPct = netCertified.gt(0) ? received.div(netCertified).mul(100).toFixed(2) : "0.00";

    return {
      physicalProgressPct,
      financialProgressPct,
      collectionProgressPct,
      grossCertified: billStats.grossCertified,
      netCertified: billStats.netCertified,
      received: billStats.received,
      outstanding: billStats.outstanding,
      retentionHeld: billStats.retentionHeld,
      contractValue: contractValue.toFixed(2),
      items: items.map((i) => ({
        id: i.id,
        itemCode: i.itemCode,
        description: i.description,
        unit: i.unit,
        contractQty: i.contractQty.toFixed(3),
        executedQty: i.executedQty.toFixed(3),
        remainingQty: i.contractQty.sub(i.executedQty).toFixed(3),
        progressPct: i.contractAmount.gt(0) ? i.executedValue.div(i.contractAmount).mul(100).toFixed(2) : "0.00",
        certifiedValue: i.executedValue.toFixed(2),
      })),
    };
  }
}
