import { Injectable } from "@nestjs/common";
import type { BankAccount } from "@bizovix/database";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class BankAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(organizationId: string): Promise<BankAccount[]> {
    return this.prisma.bankAccount.findMany({
      where: { organizationId },
      orderBy: { accountName: "asc" },
    });
  }
}
