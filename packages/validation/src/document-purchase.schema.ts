import { z } from "zod";
import { PurchaseType } from "@bizovix/types";

export const createDocumentPurchaseSchema = z
  .object({
    purchaseType: z.enum([PurchaseType.EGP, PurchaseType.MANUAL]),
    tenderId: z.string().optional().or(z.literal("")),
    organizationMasterId: z.string().min(1, "Organization is required"),
    tenderWorkName: z.string().min(1, "Tender / work name is required"),
    purchaseDate: z.string().min(1, "Purchase date is required"),
    documentPrice: z.coerce
      .number({ invalid_type_error: "Enter a valid amount" })
      .positive("Document price must be greater than 0"),
    paymentFromAccountId: z.string().min(1, "Payment account is required"),
  })
  .refine((data) => data.purchaseType !== PurchaseType.EGP || !!data.tenderId, {
    message: "Tender ID is required for e-GP purchases",
    path: ["tenderId"],
  });

export type CreateDocumentPurchaseFormValues = z.infer<typeof createDocumentPurchaseSchema>;

export const createOrganizationMasterSchema = z.object({
  shortName: z.string().min(1, "Short name is required").max(50),
  fullName: z.string().min(1, "Full name is required").max(200),
});

export type CreateOrganizationMasterFormValues = z.infer<typeof createOrganizationMasterSchema>;
