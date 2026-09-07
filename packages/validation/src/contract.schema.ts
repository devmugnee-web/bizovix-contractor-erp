import { z } from "zod";

export const createContractSchema = z
  .object({
    cmsWorkId: z.string().min(1, "Linked Project / Work is required"),
    tenderId: z.string().optional().or(z.literal("")),
    pgBgWorkflowId: z.string().optional().or(z.literal("")),
    contractType: z.enum([
      "WORK_ORDER",
      "CONTRACT_AGREEMENT",
      "PURCHASE_ORDER",
      "SERVICE_CONTRACT",
      "OTHER",
    ]),
    contractNo: z.string().min(1, "Contract / Work Order No. is required"),
    issueDate: z.string().min(1, "Issue date is required"),
    contractDate: z.string().optional().or(z.literal("")),
    originalContractValue: z.coerce.number().positive("Contract value must be greater than 0"),
    currentContractValue: z.coerce.number().min(0).optional(),
    currency: z.string().optional().or(z.literal("")),
    commencementDate: z.string().min(1, "Commencement date is required"),
    originalCompletionDate: z.string().min(1, "Original completion date is required"),
    currentCompletionDate: z.string().optional().or(z.literal("")),
    durationDays: z.coerce.number().int().min(0).optional(),
    dlpDays: z.coerce.number().int().min(0).optional(),
    retentionPct: z.coerce.number().min(0).max(100).optional(),
    securityDepositPct: z.coerce.number().min(0).max(100).optional(),
    vatPct: z.coerce.number().min(0).max(100).optional(),
    taxPct: z.coerce.number().min(0).max(100).optional(),
    securityDepositMethod: z
      .enum(["SD_DEDUCTED_FROM_BILL", "PG_RETAINED_AS_SECURITY"])
      .optional()
      .or(z.literal("")),
    securityDepositStatus: z
      .enum(["HELD", "PARTIALLY_RELEASED", "RELEASED"])
      .optional()
      .or(z.literal("")),
    securityDepositReleasedAmount: z.coerce.number().min(0).optional(),
    securityDepositReleaseDueDate: z.string().optional().or(z.literal("")),
    securityDepositReleasedDate: z.string().optional().or(z.literal("")),
    clientContactName: z.string().optional().or(z.literal("")),
    responsiblePerson: z.string().optional().or(z.literal("")),
    scopeOfWork: z.string().optional().or(z.literal("")),
    remarks: z.string().optional().or(z.literal("")),
  })
  .refine((data) => new Date(data.originalCompletionDate) >= new Date(data.commencementDate), {
    message: "Original Completion Date must be on or after the Commencement Date",
    path: ["originalCompletionDate"],
  })
  .superRefine((data, context) => {
    const sdRate = Number(data.securityDepositPct ?? 0);
    const releasedAmount = Number(data.securityDepositReleasedAmount ?? 0);
    const hasReleasedDate = Boolean(data.securityDepositReleasedDate);

    if (sdRate > 0 && !data.securityDepositMethod) {
      context.addIssue({
        code: "custom",
        path: ["securityDepositMethod"],
        message: "Select how the security deposit is held",
      });
    }

    if (sdRate > 0 && !data.securityDepositStatus) {
      context.addIssue({
        code: "custom",
        path: ["securityDepositStatus"],
        message: "Select the current security deposit status",
      });
    }

    if (sdRate <= 0 && (data.securityDepositMethod || data.securityDepositStatus)) {
      context.addIssue({
        code: "custom",
        path: ["securityDepositPct"],
        message: "Enter an SD rate when an SD method or status is selected",
      });
    }

    if (data.securityDepositStatus === "HELD" && (releasedAmount > 0 || hasReleasedDate)) {
      context.addIssue({
        code: "custom",
        path: [releasedAmount > 0 ? "securityDepositReleasedAmount" : "securityDepositReleasedDate"],
        message: "A held security deposit cannot have released amount or date",
      });
    }

    if (
      data.securityDepositStatus === "PARTIALLY_RELEASED" ||
      data.securityDepositStatus === "RELEASED"
    ) {
      if (releasedAmount <= 0) {
        context.addIssue({
          code: "custom",
          path: ["securityDepositReleasedAmount"],
          message: "Enter the released SD amount",
        });
      }
      if (!hasReleasedDate) {
        context.addIssue({
          code: "custom",
          path: ["securityDepositReleasedDate"],
          message: "Enter the SD released date",
        });
      }
    }
  });

export type CreateContractFormValues = z.infer<typeof createContractSchema>;
