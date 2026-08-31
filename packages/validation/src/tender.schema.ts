import { z } from "zod";
import { TENDER_PROCUREMENT_METHODS } from "@bizovix/types";

const optionalTrimmedText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal(""));

export const createTenderSchema = z.object({
  egpTenderId: z.string().trim().min(1, "Tender ID is required").max(100, "Tender ID is too long"),
  workName: z.string().trim().min(1, "Product / work name is required").max(300),
  tenderType: optionalTrimmedText(100),
  procurementMethod: z.enum(TENDER_PROCUREMENT_METHODS).default("OTM"),
  submissionDeadline: z.string().min(1, "Closing / submission date is required"),
  description: optionalTrimmedText(2000),
  foundByName: optionalTrimmedText(150),
  findingDate: z.string().optional().or(z.literal("")),
  remarks: optionalTrimmedText(2000),
});

export type CreateTenderFormValues = z.infer<typeof createTenderSchema>;

export const submitTenderSchema = z.object({
  submissionDate: z.string().min(1, "Submission date is required"),
  submissionMethod: z.string().min(1, "Submission method is required"),
  quotedAmount: z.coerce.number().positive("Quoted amount must be greater than 0"),
  submittedByName: z.string().optional().or(z.literal("")),
  submissionReference: z.string().optional().or(z.literal("")),
  checklistStatus: z.string().optional().or(z.literal("")),
  submissionRemarks: z.string().optional().or(z.literal("")),
});

export type SubmitTenderFormValues = z.infer<typeof submitTenderSchema>;

export const recordTenderOpeningSchema = z.object({
  openingDate: z.string().min(1, "Opening date is required"),
  status: z.enum(["OPENED", "UNDER_PROCESS", "AWARDED", "REJECTED"]),
  openingResult: z.string().optional().or(z.literal("")),
  lowestBidAmount: z.coerce.number().min(0).optional(),
  lowestBidder: z.string().optional().or(z.literal("")),
  resultRemarks: z.string().optional().or(z.literal("")),
});

export type RecordTenderOpeningFormValues = z.infer<typeof recordTenderOpeningSchema>;

export const submitTenderForCostingSchema = z.object({
  version: z.coerce.number().int().positive(),
});

export const approveTenderForCostingSchema = submitTenderForCostingSchema;

export const rejectTenderForCostingSchema = z.object({
  version: z.coerce.number().int().positive(),
  reason: z.string().trim().min(1, "Rejection reason is required").max(1000),
});

export const saveTenderCostingItemSchema = z.object({
  description: z.string().trim().min(1, "Item description is required").max(500),
  secondaryDescription: optionalTrimmedText(500),
  unit: z.string().trim().min(1, "Unit is required").max(50),
  quantity: z.coerce.number().positive("Quantity must be greater than 0"),
  unitCost: z.coerce.number().nonnegative("Unit cost cannot be negative"),
  marginPercent: z.coerce.number().min(0).max(100).default(0),
  remarks: optionalTrimmedText(1000),
  sortOrder: z.coerce.number().int().nonnegative().optional(),
});

export const saveTenderCostingSchema = z
  .object({
    version: z.coerce.number().int().positive(),
    status: z.enum(["READY", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
    costingDate: z.string().min(1, "Costing date is required"),
    source: optionalTrimmedText(150),
    currency: z.string().trim().length(3).default("BDT"),
    exchangeRate: z.coerce.number().positive("Exchange rate must be greater than 0").default(1),
    costingVersion: z.coerce.number().int().positive().default(1),
    remarks: optionalTrimmedText(2000),
    preparedByUserId: z.string().optional().or(z.literal("")),
    preparedByName: optionalTrimmedText(150),
    freightCost: z.coerce.number().nonnegative().default(0),
    installationCost: z.coerce.number().nonnegative().default(0),
    otherCost: z.coerce.number().nonnegative().default(0),
    contingencyPercent: z.coerce.number().min(0).max(100).default(0),
    validityDays: z.coerce.number().int().positive().optional(),
    paymentTermId: z.string().optional().or(z.literal("")),
    deliveryTime: optionalTrimmedText(150),
    warranty: optionalTrimmedText(300),
    assignedToUserId: z.string().optional().or(z.literal("")),
    assignedToName: optionalTrimmedText(150),
    items: z.array(saveTenderCostingItemSchema).max(200),
  })
  .superRefine((value, context) => {
    if (
      (value.status === "IN_PROGRESS" || value.status === "COMPLETED") &&
      value.items.length === 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["items"],
        message: "At least one costing item is required",
      });
    }
  });

export type SubmitTenderForCostingFormValues = z.infer<typeof submitTenderForCostingSchema>;
export type RejectTenderForCostingFormValues = z.infer<typeof rejectTenderForCostingSchema>;
export type SaveTenderCostingFormValues = z.infer<typeof saveTenderCostingSchema>;
