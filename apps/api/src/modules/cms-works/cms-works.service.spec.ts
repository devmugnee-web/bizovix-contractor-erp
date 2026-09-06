import "reflect-metadata";
import { CmsWorksService } from "./cms-works.service";

describe("CmsWorksService", () => {
  it("shows newly-created ongoing works first", async () => {
    const prisma = {
      cmsWork: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const service = new CmsWorksService(prisma as never, {} as never, {} as never);

    await service.findAll("org-1", { page: 1, limit: 12, status: "ONGOING" });

    expect(prisma.cmsWork.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      }),
    );
  });
});
