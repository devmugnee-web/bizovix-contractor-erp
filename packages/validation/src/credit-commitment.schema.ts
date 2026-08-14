import { z } from "zod";

export const createCreditCommitmentSchema = z.object({
  paymentFromAccountId: z.string().min(1, "Payment account is required"),
  paymentDate: z.string().min(1, "Payment date is required"),
  remarks: z.string().optional(),
  items: z
    .array(
      z.object({
        documentPurchaseId: z.string().min(1),
        bankAccountId: z.string().min(1, "Bank is required"),
        chargeAmount: z.coerce.number().positive("Charge amount must be greater than 0"),
        remarks: z.string().optional(),
      }),
    )
    .min(1, "Add at least one tender to the charge list"),
});

export type CreateCreditCommitmentFormValues = z.infer<typeof createCreditCommitmentSchema>;
