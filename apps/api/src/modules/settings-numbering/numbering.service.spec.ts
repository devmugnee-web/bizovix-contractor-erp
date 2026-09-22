import type { Prisma } from "@bizovix/database";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { NUMBERING_MODULE_KEYS, NumberingService } from "./numbering.service";

describe("NumberingService client ownership", () => {
  it("uses only the supplied transaction for both defaults and counter consumption", async () => {
    const root = { numberSequence: { upsert: jest.fn() }, $queryRaw: jest.fn() };
    const tx = { numberSequence: { upsert: jest.fn().mockResolvedValue({}) }, $queryRaw: jest.fn().mockResolvedValue([{ prefix: "ITM", includeYear: false, yearFormat: "YYYY", separator: "-", sequenceLength: 4, nextNumber: 2 }]) };
    const service = new NumberingService(root as unknown as PrismaService, {} as AuditLogService);
    await expect(service.next("new-tenant", "ITEM", tx as unknown as Prisma.TransactionClient)).resolves.toBe("ITM-0001");
    expect(root.numberSequence.upsert).not.toHaveBeenCalled();
    expect(root.$queryRaw).not.toHaveBeenCalled();
    expect(tx.numberSequence.upsert).toHaveBeenCalledTimes(NUMBERING_MODULE_KEYS.length);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.numberSequence.upsert.mock.invocationCallOrder.at(-1)).toBeLessThan(tx.$queryRaw.mock.invocationCallOrder[0]!);
  });

  it("retains the root client default for existing callers and never overwrites customized sequence configuration", async () => {
    const root = { numberSequence: { upsert: jest.fn().mockResolvedValue({}) } };
    const service = new NumberingService(root as unknown as PrismaService, {} as AuditLogService);
    await service.ensureDefaults("existing-tenant");
    expect(root.numberSequence.upsert).toHaveBeenCalledTimes(NUMBERING_MODULE_KEYS.length);
    for (const [input] of root.numberSequence.upsert.mock.calls) expect(input.update).toEqual({});
    expect(root.numberSequence.upsert).toHaveBeenCalledWith({ where: { organizationId_moduleKey: { organizationId: "existing-tenant", moduleKey: "RECEIPT" } }, update: {}, create: { organizationId: "existing-tenant", moduleKey: "RECEIPT", prefix: "RC", sequenceLength: 5 } });
  });
});
