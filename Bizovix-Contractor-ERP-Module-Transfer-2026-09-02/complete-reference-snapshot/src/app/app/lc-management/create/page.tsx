"use client";

import { useRouter } from "next/navigation";

import { CreateLcWizardDialog } from "@/features/screens/create-lc-wizard-dialog";

export default function CreateLcPage() {
  const router = useRouter();

  return (
    <CreateLcWizardDialog
      open
      variant="page"
      onOpenChange={(open) => {
        if (!open) router.push("/app/lc-management?section=all-lc");
      }}
    />
  );
}
