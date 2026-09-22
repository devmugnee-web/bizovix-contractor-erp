import type { Prisma } from "@bizovix/database";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { NUMBERING_MODULE_KEYS, NumberingService } from "./numbering.service";

describe("NumberingService client ownership", () => {
  it("uses only the supplied transaction for both defaults and counter consumption", async () => {
    const root = { numberSequence: { createMany: jest.fn() }, $queryRaw: jest.fn() };
    const tx = { numberSequence: { createMany: jest.fn().mockResolvedValue({ count: NUMBERING_MODULE_KEYS.length }) }, $queryRaw: jest.fn().mockResolvedValue([{ prefix: "ITM", includeYear: false, yearFormat: "YYYY", separator: "-", sequenceLength: 4, nextNumber: 2 }]) };
    const service = new NumberingService(root as unknown as PrismaService, {} as AuditLogService);
    await expect(service.next("new-tenant", "ITEM", tx as unknown as Prisma.TransactionClient)).resolves.toBe("ITM-0001");
    expect(root.numberSequence.createMany).not.toHaveBeenCalled();
    expect(root.$queryRaw).not.toHaveBeenCalled();
    expect(tx.numberSequence.createMany).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.numberSequence.createMany.mock.invocationCallOrder[0]).toBeLessThan(tx.$queryRaw.mock.invocationCallOrder[0]!);
  });

  it("retains the root client default for existing callers and never overwrites customized sequence configuration", async () => {
    const root = { numberSequence: { createMany: jest.fn().mockResolvedValue({ count: NUMBERING_MODULE_KEYS.length }) } };
    const service = new NumberingService(root as unknown as PrismaService, {} as AuditLogService);
    await service.ensureDefaults("existing-tenant");
    expect(root.numberSequence.createMany).toHaveBeenCalledTimes(1);
    const input = root.numberSequence.createMany.mock.calls[0][0];
    expect(input.skipDuplicates).toBe(true);
    expect(input.data).toHaveLength(NUMBERING_MODULE_KEYS.length);
    expect(input.data).toContainEqual({ organizationId: "existing-tenant", moduleKey: "RECEIPT", prefix: "RC", sequenceLength: 5 });
  });
});
