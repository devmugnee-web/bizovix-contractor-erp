import { desktopCaptureAvailable, lockDesktopCaptureBoundary } from "./desktop-sync-capture";
import type { Prisma } from "@bizovix/database";

describe("desktop capture availability is independent of endpoint pause", () => {
  const previous = process.env.DESKTOP_SYNC_ENABLED;
  afterAll(() => { if (previous === undefined) delete process.env.DESKTOP_SYNC_ENABLED; else process.env.DESKTOP_SYNC_ENABLED = previous; });
  const tables = ["desktop_master_sync_clocks", "desktop_master_sync_versions", "desktop_master_sync_changes"].map(name => ({ name, kind: "r" }));
  const fake = (...results: unknown[]) => {
    const query = jest.fn();
    for (const result of results) query.mockResolvedValueOnce(result);
    return { $queryRaw: query, $executeRaw: jest.fn().mockResolvedValue(1) };
  };

  it("allows an unmigrated disabled database and rechecks every call instead of caching absence", async () => {
    process.env.DESKTOP_SYNC_ENABLED = "false";
    const tx = fake([], tables);
    expect(await desktopCaptureAvailable(tx as unknown as Prisma.TransactionClient, "uom")).toBe(false);
    expect(await desktopCaptureAvailable(tx as unknown as Prisma.TransactionClient, "uom")).toBe(true);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    for (const [sql] of tx.$queryRaw.mock.calls) expect(sql.join("")).toContain("FROM pg_class");
  });

  it("refuses partial metadata even when endpoints are disabled", async () => {
    process.env.DESKTOP_SYNC_ENABLED = "false";
    await expect(desktopCaptureAvailable(fake(tables.slice(0, 2)) as unknown as Prisma.TransactionClient, "uom")).rejects.toThrow("complete reviewed sync migration");
    process.env.DESKTOP_SYNC_ENABLED = "true";
    await expect(desktopCaptureAvailable(fake([]) as unknown as Prisma.TransactionClient, "category")).rejects.toThrow("complete reviewed sync migration");
  });

  it("distinguishes original UOM/term metadata from the reviewed organization stream upgrade", async () => {
    process.env.DESKTOP_SYNC_ENABLED = "false";
    const legacy = Array.from({ length: 3 }, () => ({ definition: "CHECK (entityType IN ('uom'::text, 'paymentTerm'::text))" }));
    await expect(desktopCaptureAvailable(fake(tables, legacy) as unknown as Prisma.TransactionClient, "organizationMaster")).rejects.toThrow("Organizations/Clients sync migration");
    const current = legacy.map(row => ({ definition: row.definition.replace("'paymentTerm'::text", "'paymentTerm'::text, 'organizationMaster'::text") }));
    expect(await desktopCaptureAvailable(fake(tables, current) as unknown as Prisma.TransactionClient, "organizationMaster")).toBe(true);
  });

  it("uses one tenant advisory transaction lock before any metadata-dependent operation", async () => {
    const tx = fake();
    await lockDesktopCaptureBoundary(tx as unknown as Prisma.TransactionClient, "same-tenant");
    const args = tx.$executeRaw.mock.calls[0]!;
    expect(args[0].join("")).toContain("pg_advisory_xact_lock");
    expect(args[1]).toBe("bizovix:desktop-capture:same-tenant");
  });
});
