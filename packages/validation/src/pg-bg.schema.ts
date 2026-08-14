import { z } from "zod";

export const pgBgWorkflowSchema = z.object({
  documentPurchaseId: z.string().min(1, "Select a tender"),
  noaDate: z.string().min(1, "NOA date is required"),
  noaAmount: z.coerce.number().positive("NOA amount must be greater than 0"),
  workCategory: z.string().min(1, "Work category is required"),
  contact: z.object({
    name: z.string().min(1, "PE name is required"),
    designation: z.string().min(1, "Designation is required"),
    mobile: z.string().min(1, "Mobile number is required"),
    email: z.string().email("Enter a valid email").optional().or(z.literal("")),
    address: z.string().min(1, "Address is required"),
  }),
  acceptNoa: z.boolean(),
  pgBgRequired: z.boolean(),
  currentStep: z.number().min(1).max(5),
});

export type PgBgWorkflowFormValues = z.infer<typeof pgBgWorkflowSchema>;

export const pgBgDraftSchema = pgBgWorkflowSchema.deepPartial().extend({ documentPurchaseId: z.string().min(1, "Select a tender") });
