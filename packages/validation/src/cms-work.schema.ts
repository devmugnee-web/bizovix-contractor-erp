import { z } from "zod";

export const createCmsWorkSchema = z.object({
  organizationMasterId: z.string().min(1, "Organization is required"),
  workName: z.string().min(1, "Work name is required"),
  workCategory: z.string().min(1, "Work category is required"),
  contractValue: z.coerce.number().positive("Contract value must be greater than 0"),
  startDate: z.string().optional(),
  expectedCompletionDate: z.string().optional(),
});

export type CreateCmsWorkFormValues = z.infer<typeof createCmsWorkSchema>;
