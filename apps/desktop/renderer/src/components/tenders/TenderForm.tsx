"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { Building2, Check, Plus, Save, User, X } from "lucide-react";
import {
  useCreateOrganizationMaster,
  useCreateTender,
  useOrganizations,
  useTenderCategories,
  useUpdateTender,
} from "@bizovix/api-client";
import { createTenderSchema, type CreateTenderFormValues } from "@bizovix/validation";
import {
  CurrencyInput,
  DateInput,
  FormField,
  PageHeader,
  PrimaryButton,
  RadioCardGroup,
  SearchSelect,
  SecondaryButton,
  TextInput,
} from "@bizovix/ui";
import type { TenderDetail } from "@bizovix/types";
import { Modal } from "@/components/layout/Modal";

interface TenderFormProps {
  mode: "create" | "edit";
  tender?: TenderDetail;
}

export function TenderForm({ mode, tender }: TenderFormProps) {
  const router = useRouter();
  const categories = useTenderCategories();
  const createMutation = useCreateTender();
  const updateMutation = useUpdateTender();
  const isPending = createMutation.isPending || updateMutation.isPending;

  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateTenderFormValues>({
    resolver: zodResolver(createTenderSchema),
    defaultValues: {
      organizationMasterId: tender?.organizationMasterId ?? "",
      egpTenderId: tender?.egpTenderId ?? "",
      workName: tender?.workName ?? "",
      category: tender?.category ?? "",
      tenderType: tender?.tenderType ?? "",
      procurementMethod: tender?.procurementMethod ?? "",
      tenderMethod: tender?.tenderMethod ?? "",
      contractValue: tender ? Number(tender.contractValue) : undefined,
      publishedDate: tender?.publishedDate?.slice(0, 10) ?? "",
      documentPurchaseDeadline: tender?.documentPurchaseDeadline?.slice(0, 10) ?? "",
      preBidDate: tender?.preBidDate?.slice(0, 10) ?? "",
      submissionDeadline: tender?.submissionDeadline?.slice(0, 10) ?? "",
      openingDate: tender?.openingDate?.slice(0, 10) ?? "",
      tenderSecurityRequired: tender?.tenderSecurityRequired ?? false,
      estimatedTenderSecurityAmount: tender?.estimatedTenderSecurityAmount
        ? Number(tender.estimatedTenderSecurityAmount)
        : undefined,
      assignedToName: tender?.assignedToName ?? "",
      description: tender?.description ?? "",
    },
  });

  const organizationMasterId = watch("organizationMasterId");
  const tenderSecurityRequired = watch("tenderSecurityRequired");

  const [orgQuery, setOrgQuery] = React.useState("");
  const [selectedOrg, setSelectedOrg] = React.useState<{ value: string; label: string } | null>(
    tender ? { value: tender.organizationMasterId, label: tender.organizationMaster.shortName } : null,
  );
  const organizations = useOrganizations(orgQuery);
  const [addOrgOpen, setAddOrgOpen] = React.useState(false);

  function onSubmit(values: CreateTenderFormValues) {
    const payload = {
      organizationMasterId: values.organizationMasterId,
      egpTenderId: values.egpTenderId || undefined,
      workName: values.workName,
      category: values.category,
      tenderType: values.tenderType || undefined,
      procurementMethod: values.procurementMethod || undefined,
      tenderMethod: values.tenderMethod || undefined,
      contractValue: values.contractValue,
      publishedDate: values.publishedDate || undefined,
      documentPurchaseDeadline: values.documentPurchaseDeadline || undefined,
      preBidDate: values.preBidDate || undefined,
      submissionDeadline: values.submissionDeadline,
      openingDate: values.openingDate || undefined,
      tenderSecurityRequired: values.tenderSecurityRequired,
      estimatedTenderSecurityAmount: values.estimatedTenderSecurityAmount,
      assignedToName: values.assignedToName || undefined,
      description: values.description || undefined,
    };

    if (mode === "create") {
      createMutation.mutate(payload, { onSuccess: (record) => router.push(`/tenders/${record.id}`) });
    } else if (tender) {
      updateMutation.mutate(
        { id: tender.id, payload },
        { onSuccess: () => router.push(`/tenders/${tender.id}`) },
      );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={mode === "create" ? "Add Tender" : "Edit Tender"}
        subtitle="Manage tender opportunities, submission status and award lifecycle."
      />

      <form onSubmit={handleSubmit(onSubmit)} className="rounded-lg border border-biz-border bg-biz-surface p-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <FormField label="Organization" required helper="Type minimum 2 characters to search" error={errors.organizationMasterId?.message}>
            <div className="flex items-start gap-3">
              <SearchSelect
                className="flex-1"
                query={orgQuery}
                value={selectedOrg}
                onQueryChange={(q) => {
                  setOrgQuery(q);
                  if (selectedOrg) {
                    setSelectedOrg(null);
                    setValue("organizationMasterId", "");
                  }
                }}
                onSelect={(option) => {
                  setSelectedOrg(option);
                  setValue("organizationMasterId", option.value);
                }}
                options={(organizations.data ?? []).map((org) => ({
                  value: org.id,
                  label: org.shortName,
                  sublabel: org.fullName,
                }))}
                isLoading={organizations.isLoading}
                placeholder="Search organization..."
              />
              <SecondaryButton type="button" onClick={() => setAddOrgOpen(true)}>
                <Plus className="h-4 w-4" />
                Add New
              </SecondaryButton>
            </div>
            <input type="hidden" value={organizationMasterId} readOnly />
          </FormField>

          <FormField
            label="e-GP / Tender ID"
            helper="Optional — only applicable for e-GP sourced tenders"
            error={errors.egpTenderId?.message}
          >
            <TextInput placeholder="Enter e-GP Tender ID" {...register("egpTenderId")} />
          </FormField>

          <FormField label="Tender / Work Name" required error={errors.workName?.message}>
            <TextInput icon={Building2} placeholder="Enter tender / work name" {...register("workName")} />
          </FormField>

          <FormField label="Work Category" required error={errors.category?.message}>
            <TextInput list="tender-categories" placeholder="e.g. LED Display" {...register("category")} />
            <datalist id="tender-categories">
              {(categories.data ?? []).map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </FormField>

          <FormField label="Tender Type" error={errors.tenderType?.message}>
            <TextInput placeholder="e.g. Open Tender" {...register("tenderType")} />
          </FormField>

          <FormField label="Procurement Method" error={errors.procurementMethod?.message}>
            <TextInput placeholder="e.g. OTM" {...register("procurementMethod")} />
          </FormField>

          <FormField label="Tender Method" error={errors.tenderMethod?.message}>
            <TextInput placeholder="e.g. Single Stage One Envelope" {...register("tenderMethod")} />
          </FormField>

          <FormField label="Estimated Tender Value" error={errors.contractValue?.message}>
            <CurrencyInput placeholder="Enter estimated value" {...register("contractValue")} />
          </FormField>

          <FormField label="Published Date" error={errors.publishedDate?.message}>
            <Controller control={control} name="publishedDate" render={({ field }) => <DateInput {...field} />} />
          </FormField>

          <FormField label="Document Purchase Deadline" error={errors.documentPurchaseDeadline?.message}>
            <Controller
              control={control}
              name="documentPurchaseDeadline"
              render={({ field }) => <DateInput {...field} />}
            />
          </FormField>

          <FormField label="Pre-Bid Date" error={errors.preBidDate?.message}>
            <Controller control={control} name="preBidDate" render={({ field }) => <DateInput {...field} />} />
          </FormField>

          <FormField label="Submission Deadline" required error={errors.submissionDeadline?.message}>
            <Controller
              control={control}
              name="submissionDeadline"
              render={({ field }) => <DateInput {...field} />}
            />
          </FormField>

          <FormField label="Opening Date" error={errors.openingDate?.message}>
            <Controller control={control} name="openingDate" render={({ field }) => <DateInput {...field} />} />
          </FormField>

          <FormField label="Tender Security Required?">
            <Controller
              control={control}
              name="tenderSecurityRequired"
              render={({ field }) => (
                <RadioCardGroup
                  name="tenderSecurityRequired"
                  value={field.value ? "yes" : "no"}
                  onChange={(value) => field.onChange(value === "yes")}
                  options={[
                    { value: "yes", label: "Yes", icon: Check, iconClassName: "text-biz-success" },
                    { value: "no", label: "No", icon: X, iconClassName: "text-biz-muted" },
                  ]}
                />
              )}
            />
          </FormField>

          {tenderSecurityRequired && (
            <FormField label="Estimated Tender Security Amount" error={errors.estimatedTenderSecurityAmount?.message}>
              <CurrencyInput placeholder="If known" {...register("estimatedTenderSecurityAmount")} />
            </FormField>
          )}

          <FormField label="Assigned To" error={errors.assignedToName?.message}>
            <TextInput icon={User} placeholder="Enter responsible person's name" {...register("assignedToName")} />
          </FormField>

          <FormField label="Description / Remarks" error={errors.description?.message}>
            <textarea
              rows={3}
              placeholder="Additional notes about this tender..."
              className="w-full rounded-sm border border-biz-border bg-biz-surface px-3 py-2 text-[13px] text-biz-text placeholder:text-biz-muted focus:outline-none focus:ring-2 focus:ring-biz-blue/30"
              {...register("description")}
            />
          </FormField>
        </div>

        {(createMutation.isError || updateMutation.isError) && (
          <p className="mt-4 text-[13px] text-biz-danger">Failed to save tender. Please try again.</p>
        )}

        <div className="mt-8 flex items-center justify-end gap-3 border-t border-biz-border pt-5">
          <SecondaryButton type="button" onClick={() => router.push(tender ? `/tenders/${tender.id}` : "/tenders")}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={isPending}>
            <Save className="h-4 w-4" />
            {isPending ? "Saving..." : "Save Tender"}
          </PrimaryButton>
        </div>
      </form>

      <AddOrganizationModal
        open={addOrgOpen}
        onClose={() => setAddOrgOpen(false)}
        onCreated={(org) => {
          setSelectedOrg({ value: org.id, label: org.shortName });
          setValue("organizationMasterId", org.id);
          setAddOrgOpen(false);
        }}
      />
    </div>
  );
}

function AddOrganizationModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (org: { id: string; shortName: string }) => void;
}) {
  const createOrg = useCreateOrganizationMaster();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<{ shortName: string; fullName: string }>();

  function onSubmit(values: { shortName: string; fullName: string }) {
    createOrg.mutate(values, {
      onSuccess: (org) => {
        reset();
        onCreated(org);
      },
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="Add New Organization">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormField label="Short Name" required error={errors.shortName?.message}>
          <TextInput placeholder="e.g. DPHE" {...register("shortName", { required: "Short name is required" })} />
        </FormField>
        <FormField label="Full Name" required error={errors.fullName?.message}>
          <TextInput
            placeholder="e.g. Department of Public Health Engineering"
            {...register("fullName", { required: "Full name is required" })}
          />
        </FormField>
        <div className="mt-2 flex justify-end gap-3">
          <SecondaryButton type="button" onClick={onClose}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={createOrg.isPending}>
            {createOrg.isPending ? "Saving..." : "Save"}
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}
