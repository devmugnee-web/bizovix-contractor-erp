"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { BriefcaseBusiness, Save, Tags } from "lucide-react";
import { useAllOrganizations, useCreateCmsWork, useTender } from "@bizovix/api-client";
import { createCmsWorkSchema, type CreateCmsWorkFormValues } from "@bizovix/validation";
import { CurrencyInput, DateInput, FormField, PageHeader, PrimaryButton, SecondaryButton, SelectInput, TextInput } from "@bizovix/ui";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

export default function CreateOngoingWorkPage() {
  return (
    <Suspense fallback={null}>
      <CreateOngoingWorkForm />
    </Suspense>
  );
}

function CreateOngoingWorkForm() {
  useSetBreadcrumb([
    { label: "CMS" },
    { label: "Ongoing Works", href: "/cms/ongoing-works" },
    { label: "Add Manual Work" },
  ]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenderId = searchParams.get("tenderId") ?? undefined;
  const linkedTender = useTender(tenderId);
  const organizations = useAllOrganizations();
  const createWork = useCreateCmsWork();
  const { register, control, setValue, handleSubmit, formState: { errors } } = useForm<CreateCmsWorkFormValues>({
    resolver: zodResolver(createCmsWorkSchema),
    defaultValues: { organizationMasterId: "", workName: "", workCategory: "", startDate: "", expectedCompletionDate: "" },
  });

  const prefilledFromTender = React.useRef(false);
  React.useEffect(() => {
    // Wait for both the tender and the organization options to load — setValue on a native
    // <select> is a no-op if the matching <option> hasn't rendered yet.
    if (!linkedTender.data || !organizations.data || prefilledFromTender.current) return;
    prefilledFromTender.current = true;
    setValue("organizationMasterId", linkedTender.data.organizationMasterId);
    setValue("workName", linkedTender.data.workName);
    setValue("workCategory", linkedTender.data.category);
    const contractValue = Number(linkedTender.data.contractValue);
    if (contractValue > 0) setValue("contractValue", contractValue);
  }, [linkedTender.data, organizations.data, setValue]);

  function onSubmit(values: CreateCmsWorkFormValues) {
    createWork.mutate({
      ...values,
      contractValue: Number(values.contractValue),
      startDate: values.startDate || undefined,
      expectedCompletionDate: values.expectedCompletionDate || undefined,
      tenderId,
    }, { onSuccess: (work) => router.push(`/cms/ongoing-works/${work.id}`) });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={tenderId ? "Create Ongoing Work" : "Add Manual Work"}
        subtitle={
          tenderId
            ? "Carried forward from the awarded tender — review and save to start project execution"
            : "Add a project that did not originate from the tender workflow"
        }
      />
      <form onSubmit={handleSubmit(onSubmit)} className="max-w-4xl rounded-lg border border-biz-border bg-biz-surface p-6 shadow-card">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <FormField label="Organization" required error={errors.organizationMasterId?.message}>
            <SelectInput placeholder="Select organization" options={(organizations.data ?? []).map((org) => ({ label: `${org.shortName} - ${org.fullName}`, value: org.id }))} {...register("organizationMasterId")} />
          </FormField>
          <FormField label="Work Category" required error={errors.workCategory?.message}>
            <TextInput icon={Tags} placeholder="e.g. Electrical" {...register("workCategory")} />
          </FormField>
          <div className="md:col-span-2">
            <FormField label="Work / Project Name" required error={errors.workName?.message}>
              <TextInput icon={BriefcaseBusiness} placeholder="Enter work or project name" {...register("workName")} />
            </FormField>
          </div>
          <FormField label="Contract Value" required error={errors.contractValue?.message}>
            <CurrencyInput placeholder="Enter contract value" {...register("contractValue")} />
          </FormField>
          <div />
          <FormField label="Start Date" error={errors.startDate?.message}>
            <Controller control={control} name="startDate" render={({ field }) => <DateInput {...field} />} />
          </FormField>
          <FormField label="Expected Completion Date" error={errors.expectedCompletionDate?.message}>
            <Controller control={control} name="expectedCompletionDate" render={({ field }) => <DateInput {...field} />} />
          </FormField>
        </div>
        {createWork.isError && <p className="mt-4 text-[13px] text-biz-danger">Could not create this work. Please check the information and try again.</p>}
        <div className="mt-6 flex justify-end gap-3 border-t border-biz-border pt-5">
          <SecondaryButton type="button" onClick={() => router.push("/cms/ongoing-works")}>Cancel</SecondaryButton>
          <PrimaryButton type="submit" disabled={createWork.isPending}>
            <Save className="h-4 w-4" /> {createWork.isPending ? "Saving..." : "Save Work"}
          </PrimaryButton>
        </div>
      </form>
    </div>
  );
}
