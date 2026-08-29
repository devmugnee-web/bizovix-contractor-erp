import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@bizovix/database";
import { PrismaService } from "./prisma.service";

type DbClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class ProjectLifecycleGuardService {
  constructor(private readonly prisma: PrismaService) {}

  async assertOperationalMutationAllowed(
    organizationId: string,
    workId: string,
    operation = "operational changes",
    client: DbClient = this.prisma,
  ) {
    const work = await client.cmsWork.findFirst({
      where: { id: workId, organizationId },
      select: { id: true, status: true },
    });
    if (!work) throw new NotFoundException("Project / Work not found");
    if (["COMPLETED", "ARCHIVED", "CANCELLED"].includes(work.status)) {
      throw new BadRequestException(
        work.status === "CANCELLED"
          ? `This project is cancelled. The requested operation (${operation}) is not allowed.`
          : `This project is ${work.status.toLowerCase()}. Reopen the project before ${operation}.`,
      );
    }
    return work;
  }
}
