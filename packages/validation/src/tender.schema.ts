import { z } from "zod";

export const createTenderSchema = z.object({
  organizationMasterId: z.string().min(1, "Organization is required"),
  egpTenderId: z.string().optional().or(z.literal("")),
  workName: z.string().min(1, "Tender / work name is required"),
  category: z.string().min(1, "Work category is required"),
  tenderType: z.string().optional().or(z.literal("")),
  procurementMethod: z.string().optional().or(z.literal("")),
  tenderMethod: z.string().optional().or(z.literal("")),
  contractValue: z.coerce.number().min(0, "Estimated tender value cannot be negative").optional(),
  publishedDate: z.string().optional().or(z.literal("")),
  documentPurchaseDeadline: z.string().optional().or(z.literal("")),
  preBidDate: z.string().optional().or(z.literal("")),
  submissionDeadline: z.string().min(1, "Submission deadline is required"),
  openingDate: z.string().optional().or(z.literal("")),
  tenderSecurityRequired: z.boolean().optional(),
  estimatedTenderSecurityAmount: z.coerce.number().min(0).optional(),
  assignedToName: z.string().optional().or(z.literal("")),
  description: z.string().optional().or(z.literal("")),
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
