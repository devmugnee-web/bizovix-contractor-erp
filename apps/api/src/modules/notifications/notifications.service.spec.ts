import { NotificationsService } from "./notifications.service";

describe("NotificationsService Tender Security stages", () => {
  const service = new NotificationsService({} as never);
  const reminder = {
    id: "reminder-1",
    type: "Tender Security",
    title: "Tender Security expiry approaching",
    priority: "HIGH",
    status: "UPCOMING",
    dueDate: new Date("2027-03-12T00:00:00.000Z"),
    dueTime: null,
    notificationBefore: 15,
    assignedToUserId: null,
    relatedEntityName: "Training Equipment Tender",
    referenceNo: "TS-001",
    sourceModule: "TENDER_SECURITY",
    sourceType: "Tender Security",
    sourceId: "security-1",
  };
  type TestReminder = Omit<typeof reminder, "dueTime"> & { dueTime: string | null };

  const resolveStage = (
    daysUntilDue: number,
    status = "UPCOMING",
    value: TestReminder = reminder,
    now?: Date,
  ) =>
    (
      service as unknown as {
        resolveStage: (
          reminderValue: TestReminder,
          days: number,
          currentTime?: Date,
          timeZone?: string,
        ) => string | null;
      }
    ).resolveStage({ ...value, status }, daysUntilDue, now, "Asia/Dhaka");

  it("creates separate 15-day, 7-day and due-today stages", () => {
    expect(resolveStage(16)).toBeNull();
    expect(resolveStage(15)).toBe("TENDER_SECURITY_15_DAYS");
    expect(resolveStage(8)).toBe("TENDER_SECURITY_15_DAYS");
    expect(resolveStage(7)).toBe("TENDER_SECURITY_7_DAYS");
    expect(resolveStage(1)).toBe("TENDER_SECURITY_7_DAYS");
    expect(resolveStage(0, "DUE_TODAY")).toBe("DUE_TODAY");
  });

  it("does not send an early notification when On Due Date is selected", () => {
    const manual = {
      ...reminder,
      sourceModule: "MANUAL",
      sourceType: "MANUAL",
      notificationBefore: 0,
    };
    expect(resolveStage(3, "UPCOMING", manual)).toBeNull();
    expect(resolveStage(0, "DUE_TODAY", manual)).toBe("DUE_TODAY");
  });

  it("waits for the selected local time before creating the due notification", () => {
    const timed = {
      ...reminder,
      sourceModule: "MANUAL",
      sourceType: "MANUAL",
      dueDate: new Date("2026-09-15T00:00:00.000Z"),
      dueTime: "14:30",
      notificationBefore: 0,
    };
    expect(resolveStage(0, "DUE_TODAY", timed, new Date("2026-09-15T08:29:00.000Z"))).toBeNull();
    expect(resolveStage(0, "DUE_TODAY", timed, new Date("2026-09-15T08:30:00.000Z"))).toBe(
      "DUE_NOW",
    );
  });
});
