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
    notificationBefore: 15,
    assignedToUserId: null,
    relatedEntityName: "Training Equipment Tender",
    referenceNo: "TS-001",
    sourceModule: "TENDER_SECURITY",
    sourceType: null,
    sourceId: "security-1",
  };

  const resolveStage = (daysUntilDue: number, status = "UPCOMING") =>
    (service as unknown as {
      resolveStage: (value: typeof reminder, days: number) => string | null;
    }).resolveStage({ ...reminder, status }, daysUntilDue);

  it("creates separate 15-day, 7-day and due-today stages", () => {
    expect(resolveStage(16)).toBeNull();
    expect(resolveStage(15)).toBe("TENDER_SECURITY_15_DAYS");
    expect(resolveStage(8)).toBe("TENDER_SECURITY_15_DAYS");
    expect(resolveStage(7)).toBe("TENDER_SECURITY_7_DAYS");
    expect(resolveStage(1)).toBe("TENDER_SECURITY_7_DAYS");
    expect(resolveStage(0, "DUE_TODAY")).toBe("DUE_TODAY");
  });
});
