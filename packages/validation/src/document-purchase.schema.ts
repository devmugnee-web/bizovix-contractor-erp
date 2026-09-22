import { z } from "zod";
import { PurchaseType } from "@bizovix/types";

export const createDocumentPurchaseSchema = z
  .object({
    purchaseType: z.enum([PurchaseType.EGP, PurchaseType.MANUAL]),
    tenderId: z.string().optional().or(z.literal("")),
    requestId: z.string().optional().or(z.literal("")),
    organizationMasterId: z.string().min(1, "Organization is required"),
    tenderWorkName: z.string().min(1, "Tender / work name is required"),
    purchaseDate: z.string().min(1, "Purchase date is required"),
    documentPrice: z.coerce
      .number({ invalid_type_error: "Enter a valid amount" })
      .positive("Document price must be greater than 0"),
    bankCharge: z.coerce
      .number({ invalid_type_error: "Enter a valid bank charge" })
      .nonnegative("Bank charge cannot be negative")
      .multipleOf(0.01, "Use at most 2 decimal places")
      .optional(),
    paymentFromAccountId: z.string().min(1, "Payment account is required"),
    category: z.string().trim().min(1, "Work category is required"),
    estimatedTenderAmount: z.coerce
      .number({ invalid_type_error: "Enter a valid amount" })
      .positive("Estimated tender amount must be greater than 0"),
    submissionDate: z.string().optional().or(z.literal("")),
    openingDate: z.string().optional().or(z.literal("")),
    remarks: z.string().optional().or(z.literal("")),
  })
  .refine((data) => data.purchaseType !== PurchaseType.EGP || !!data.tenderId, {
    message: "Tender ID is required for e-GP purchases",
    path: ["tenderId"],
  });

export type CreateDocumentPurchaseFormValues = z.infer<typeof createDocumentPurchaseSchema>;

// Match the API's pinned validator.js @MaxLength behavior, including Unicode
// surrogate pairs and presentation selectors. Preserve the entered names.
function organizationNameLength(value: string) {
  return value.length - (value.match(/[^\uFE0F\uFE0E][\uFE0F\uFE0E]/g)?.length ?? 0)
    - (value.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g)?.length ?? 0);
}

export const createOrganizationMasterSchema = z.object({
  shortName: z.string().min(1, "Short name is required").refine((value) => organizationNameLength(value) <= 50, "Short name must contain at most 50 characters"),
  fullName: z.string().min(1, "Full name is required").refine((value) => organizationNameLength(value) <= 200, "Full name must contain at most 200 characters"),
});

export type CreateOrganizationMasterFormValues = z.infer<typeof createOrganizationMasterSchema>;
