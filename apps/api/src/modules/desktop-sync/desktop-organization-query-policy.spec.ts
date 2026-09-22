import type { Prisma } from "@bizovix/database";
import { DesktopOrganizationQueryPolicy } from "./desktop-organization-query-policy";

describe("cloud-derived organization query policy", () => {
  const locale = { database: "isolated", databaseOid: "123", serverAddress: "127.0.0.1", serverPort: 5432, serverVersion: "180002", encoding: "UTF8", provider: "c", collate: "English_United States.1252", ctype: "English_United States.1252", recordedVersion: null, actualVersion: null, defaultColumns: true };
  function fixture(locales: unknown[] = [locale]) {
    const mappings = jest.fn().mockResolvedValue([{ source: "A", target: "a" }]);
    const query = jest.fn().mockImplementation((sql: TemplateStringsArray) => sql.join("").includes("generate_series") ? mappings() : Promise.resolve(locales));
    const ordered = jest.fn().mockResolvedValue([{ id: "cloud-first" }, { id: "cloud-second" }]);
    return { tx: { $queryRaw: query, organizationMaster: { findMany: ordered } } as unknown as Prisma.TransactionClient, query, mappings, ordered };
  }

  it("retains authoritative tenant ordering and caches complete mappings only for the same DB locale", async () => {
    const policy = new DesktopOrganizationQueryPolicy();
    const f = fixture();
    expect(await policy.index(f.tx, "org-a")).toEqual({ formatVersion: 1, orderedIds: ["cloud-first", "cloud-second"], caseMappings: [["A", "a"]] });
    await policy.index(f.tx, "org-b");
    expect(f.mappings).toHaveBeenCalledTimes(1);
    expect(f.ordered).toHaveBeenLastCalledWith({ where: { organizationId: "org-b" }, orderBy: { shortName: "asc" }, select: { id: true } });
    const differentDatabase = fixture([{ ...locale, database: "other", databaseOid: "456" }]);
    await policy.index(differentDatabase.tx, "org-c");
    expect(differentDatabase.mappings).toHaveBeenCalledTimes(1);
    const mapQuery = f.query.mock.calls.find(([sql]) => (sql as TemplateStringsArray).join("").includes("generate_series"))![0] as TemplateStringsArray;
    expect(mapQuery.join("")).toContain("generate_series(1, 55295)");
    expect(mapQuery.join("")).toContain("generate_series(57344, 1114111)");
  });

  it("fails closed on unreviewed locale providers, encodings, server versions or column collations", async () => {
    for (const difference of [{ provider: "i" }, { provider: "b" }, { encoding: "LATIN1" }, { serverVersion: "170006" }, { defaultColumns: false }]) {
      const f = fixture([{ ...locale, ...difference }]);
      await expect(new DesktopOrganizationQueryPolicy().index(f.tx, "org")).rejects.toMatchObject({ status: 503 });
      expect(f.mappings).not.toHaveBeenCalled();
      expect(f.ordered).not.toHaveBeenCalled();
    }
  });

  it("does not retain a failed transaction as a permanently poisoned case-map cache", async () => {
    const policy = new DesktopOrganizationQueryPolicy();
    const f = fixture();
    f.mappings.mockRejectedValueOnce(new Error("Temporary database timeout"));
    await expect(policy.index(f.tx, "org")).rejects.toThrow("Temporary");
    await expect(policy.index(f.tx, "org")).resolves.toMatchObject({ caseMappings: [["A", "a"]] });
    expect(f.mappings).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed, duplicate, context-expanding or non-scalar case mappings", async () => {
    for (const rows of [[{ source: "A", target: "" }], [{ source: "A", target: "a" }, { source: "A", target: "b" }], [{ source: "A", target: "aa" }], [{ source: "\ud800", target: "a" }], [{ source: "A", target: "\0" }]]) {
      const f = fixture();
      f.mappings.mockResolvedValueOnce(rows);
      await expect(new DesktopOrganizationQueryPolicy().index(f.tx, "org")).rejects.toMatchObject({ status: 503 });
      expect(f.ordered).not.toHaveBeenCalled();
    }
  });
});
