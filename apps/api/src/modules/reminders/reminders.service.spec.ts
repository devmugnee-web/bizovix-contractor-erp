import { RemindersService } from "./reminders.service";

describe("RemindersService repeat completion", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("completes the current reminder and creates the next future occurrence", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-09-15T08:30:00.000Z"));
    const old = {
      id: "reminder-1",
      organizationId: "org-1",
      type: "Tender Security",
      title: "Follow up",
      description: "Call the bank",
      subtitle: null,
      priority: "MEDIUM",
      status: "DUE_TODAY",
      dueDate: new Date("2026-09-15T00:00:00.000Z"),
      dueTime: "14:30",
      assignedToUserId: "user-1",
      assignedToName: "Test User",
      sourceModule: "MANUAL",
      sourceType: "MANUAL",
      sourceId: null,
      relatedEntityType: "TENDER",
      relatedEntityId: "tender-1",
      relatedEntityName: "Test Tender",
      referenceNo: "T-001",
      organizationMasterId: "client-1",
      organizationName: "Client",
      notificationBefore: 1,
      repeatType: "DAILY",
      repeatConfig: null,
      remarks: null,
    };
    const completed = { ...old, status: "COMPLETED" };
    const repeated = {
      ...old,
      id: "reminder-2",
      status: "UPCOMING",
      dueDate: new Date("2026-09-16T00:00:00.000Z"),
    };
    const update = jest.fn().mockResolvedValue(completed);
    const create = jest.fn().mockResolvedValue(repeated);
    const prisma = {
      reminder: { findFirst: jest.fn().mockResolvedValue(old) },
      generalSetting: {
        findUnique: jest.fn().mockResolvedValue({ timezone: "Asia/Dhaka" }),
      },
      $transaction: jest.fn(async (callback: (tx: unknown) => unknown) =>
        callback({ reminder: { update, create } }),
      ),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const notifications = { resolveForReminder: jest.fn().mockResolvedValue(undefined) };
    const service = new RemindersService(
      prisma as never,
      audit as never,
      notifications as never,
      {} as never,
      {} as never,
    );

    await service.complete("org-1", { id: "user-1", name: "Test User" }, old.id);

    expect(update).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dueDate: new Date("2026-09-16T00:00:00.000Z"),
          repeatType: "DAILY",
          repeatConfig: { seriesId: "reminder-1", occurrence: 2 },
        }),
      }),
    );
    expect(notifications.resolveForReminder).toHaveBeenCalledWith("org-1", old.id);
  });
});
