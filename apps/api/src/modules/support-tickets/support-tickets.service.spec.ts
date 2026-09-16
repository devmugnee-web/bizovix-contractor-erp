import { NotFoundException } from "@nestjs/common";
import { SupportTicketsService } from "./support-tickets.service";

describe("SupportTicketsService tenant access", () => {
  const findFirst = jest.fn();
  const prisma = {
    supportTicket: { findFirst },
  };
  const service = new SupportTicketsService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it("scopes customer ticket reads to the organization and creator", async () => {
    findFirst.mockResolvedValue(null);
    await expect(service.getMine("tenant-a", "user-a", "ticket-b")).rejects.toThrow(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "ticket-b", organizationId: "tenant-a", createdById: "user-a" },
    }));
  });

  it("does not read an attachment until ticket ownership is established", async () => {
    findFirst.mockResolvedValue(null);
    await expect(service.attachmentMine("tenant-a", "user-a", "ticket-b", "file-b")).rejects.toThrow(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "ticket-b", organizationId: "tenant-a", createdById: "user-a" },
    }));
  });
});
