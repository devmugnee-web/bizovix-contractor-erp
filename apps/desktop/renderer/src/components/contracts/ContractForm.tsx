"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { Briefcase, Save, User } from "lucide-react";
import { useCmsWorks, useCreateContract, useTenders, useUpdateContract } from "@bizovix/api-client";
import { createContractSchema, type CreateContractFormValues } from "@bizovix/validation";
import {
  CurrencyInput,
  DateInput,
  FormField,
  PageHeader,
  PrimaryButton,
  SearchSelect,
  SecondaryButton,
  SelectInput,
  TextInput,
} from "@bizovix/ui";
import type { ContractDetail } from "@bizovix/types";
import { CONTRACT_TYPE_OPTIONS } from "@/lib/contracts";

interface ContractFormProps {
  mode: "create" | "edit";
  contract?: ContractDetail;
  initialWork?: { id: string; workName: string };
}

export function ContractForm({ mode, contract, initialWork }: ContractFormProps) {
  const router = useRouter();
  const createMutation = useCreateContract();
  const updateMutation = useUpdateContract();
  const isPending = createMutation.isPending || updateMutation.isPending;

  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<CreateContractFormValues>({
    resolver: zodResolver(createContractSchema),
    defaultValues: {
      cmsWorkId: contract?.cmsWorkId ?? initialWork?.id ?? "",
      tenderId: contract?.tenderId ?? "",
      contractType: contract?.contractType ?? "WORK_ORDER",
      contractNo: contract?.contractNo ?? "",
      issueDate: contract?.issueDate.slice(0, 10) ?? "",
      contractDate: contract?.contractDate?.slice(0, 10) ?? "",
      originalContractValue: contract ? Number(contract.originalContractValue) : undefined,
      currentContractValue: contract ? Number(contract.currentContractValue) : undefined,
      currency: contract?.currency ?? "BDT",
      commencementDate: contract?.commencementDate.slice(0, 10) ?? "",
      originalCompletionDate: contract?.originalCompletionDate.slice(0, 10) ?? "",
      currentCompletionDate: contract?.currentCompletionDate?.slice(0, 10) ?? "",
      durationDays: contract?.durationDays ?? undefined,
      dlpDays: contract?.dlpDays ?? undefined,
      retentionPct: contract?.retentionPct ? Number(contract.retentionPct) : undefined,
      securityDepositPct: contract?.securityDepositPct ? Number(contract.securityDepositPct) : undefined,
      clientContactName: contract?.clientContactName ?? "",
      responsiblePerson: contract?.responsiblePerson ?? "",
      scopeOfWork: contract?.scopeOfWork ?? "",
      remarks: contract?.remarks ?? "",
    },
  });

  const [workQuery, setWorkQuery] = React.useState("");
  const [selectedWork, setSelectedWork] = React.useState<{ value: string; label: string } | null>(
    contract
      ? { value: contract.cmsWorkId, label: contract.cmsWork.workName }
      : initialWork
        ? { value: initialWork.id, label: initialWork.workName }
        : null,
  );
  const works = useCmsWorks({ search: workQuery, limit: 20 });

  const [tenderQuery, setTenderQuery] = React.useState("");
  const [selectedTender, setSelectedTender] = React.useState<{ value: string; label: string } | null>(
    contract?.tender ? { value: contract.tender.id, label: contract.tender.workName } : null,
  );
  const tenders = useTenders({ search: tenderQuery, limit: 20 });

  function onSubmit(values: CreateContractFormValues) {
    const payload = {
      cmsWorkId: values.cmsWorkId,
      tenderId: values.tenderId || undefined,
      contractType: values.contractType,
      contractNo: values.contractNo,
      issueDate: values.issueDate,
      contractDate: values.contractDate || undefined,
      originalContractValue: values.originalContractValue,
      currentContractValue: values.currentContractValue || undefined,
      currency: values.currency || undefined,
      commencementDate: values.commencementDate,
      originalCompletionDate: values.originalCompletionDate,
      currentCompletionDate: values.currentCompletionDate || undefined,
      durationDays: values.durationDays,
      dlpDays: values.dlpDays,
      retentionPct: values.retentionPct,
      securityDepositPct: values.securityDepositPct,
      clientContactName: values.clientContactName || undefined,
      responsiblePerson: values.responsiblePerson || undefined,
      scopeOfWork: values.scopeOfWork || undefined,
      remarks: values.remarks || undefined,
    };

    if (mode === "create") {
      createMutation.mutate(payload, { onSuccess: (record) => router.push(`/cms/contracts/${record.id}`) });
    } else if (contract) {
      updateMutation.mutate({ id: contract.id, payload }, { onSuccess: () => router.push(`/cms/contracts/${contract.id}`) });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={mode === "create" ? "Add Contract / Work Order" : "Edit Contract / Work Order"}
        subtitle="Manage awarded contracts, work orders and project execution details."
      />

      <form onSubmit={handleSubmit(onSubmit)} className="rounded-lg border border-biz-border bg-biz-surface p-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <FormField label="Linked Project / Work" required helper="Type minimum 2 characters to search" error={errors.cmsWorkId?.message}>
            <SearchSelect
              query={workQuery}
              value={selectedWork}
              onQueryChange={(q) => {
                setWorkQuery(q);
                if (selectedWork) {
                  setSelectedWork(null);
                  setValue("cmsWorkId", "");
                }
              }}
              onSelect={(option) => {
                setSelectedWork(option);
                setValue("cmsWorkId", option.value);
              }}
              options={(works.data?.items ?? []).map((work) => ({
                value: work.id,
                label: work.workName,
                sublabel: work.organizationMaster.shortName,
              }))}
              isLoading={works.isLoading}
              placeholder="Search project / work..."
            />
          </FormField>

          <FormField label="Linked Tender" helper="Optional — only if this contract originated from a tracked tender" error={errors.tenderId?.message}>
            <SearchSelect
              query={tenderQuery}
              value={selectedTender}
              onQueryChange={(q) => {
                setTenderQuery(q);
                if (selectedTender) {
                  setSelectedTender(null);
                  setValue("tenderId", "");
                }
              }}
              onSelect={(option) => {
                setSelectedTender(option);
                setValue("tenderId", option.value);
              }}
              options={(tenders.data?.items ?? []).map((tender) => ({
                value: tender.id,
                label: tender.workName,
                sublabel: tender.egpTenderId ?? undefined,
              }))}
              isLoading={tenders.isLoading}
              placeholder="Search tender..."
            />
          </FormField>

          <FormField label="Contract Type" required error={errors.contractType?.message}>
            <Controller
              control={control}
              name="contractType"
              render={({ field }) => <SelectInput options={CONTRACT_TYPE_OPTIONS} {...field} />}
            />
          </FormField>

          <FormField label="Contract / Work Order No." required error={errors.contractNo?.message}>
            <TextInput icon={Briefcase} placeholder="e.g. WO-2026-0012" {...register("contractNo")} />
          </FormField>

          <FormField label="Issue Date" required error={errors.issueDate?.message}>
            <Controller control={control} name="issueDate" render={({ field }) => <DateInput {...field} />} />
          </FormField>

          <FormField label="Contract Date" error={errors.contractDate?.message}>
            <Controller control={control} name="contractDate" render={({ field }) => <DateInput {...field} />} />
          </FormField>

          <FormField label="Original Contract Value" required error={errors.originalContractValue?.message}>
            <CurrencyInput placeholder="Enter contract value" {...register("originalContractValue")} />
          </FormField>

          <FormField label="Current Contract Value" helper="Defaults to original value if left blank" error={errors.currentContractValue?.message}>
            <CurrencyInput placeholder="Same as original" {...register("currentContractValue")} />
          </FormField>

          <FormField label="Commencement Date" required error={errors.commencementDate?.message}>
            <Controller control={control} name="commencementDate" render={({ field }) => <DateInput {...field} />} />
          </FormField>

          <FormField label="Original Completion Date" required error={errors.originalCompletionDate?.message}>
            <Controller control={control} name="originalCompletionDate" render={({ field }) => <DateInput {...field} />} />
          </FormField>

          <FormField label="Current Completion Date" helper="Defaults to original completion date" error={errors.currentCompletionDate?.message}>
            <Controller control={control} name="currentCompletionDate" render={({ field }) => <DateInput {...field} />} />
          </FormField>

          <FormField label="Duration (Days)" helper="Auto-calculated if left blank" error={errors.durationDays?.message}>
            <TextInput type="number" placeholder="Auto-calculated" {...register("durationDays")} />
          </FormField>

          <FormField label="Defect Liability Period (Days)" error={errors.dlpDays?.message}>
            <TextInput type="number" placeholder="Optional" {...register("dlpDays")} />
          </FormField>

          <FormField label="Retention %" error={errors.retentionPct?.message}>
            <TextInput type="number" step="0.01" placeholder="Optional" {...register("retentionPct")} />
          </FormField>

          <FormField label="Security Deposit %" error={errors.securityDepositPct?.message}>
            <TextInput type="number" step="0.01" placeholder="Optional" {...register("securityDepositPct")} />
          </FormField>

          <FormField label="Client Contact / PE" error={errors.clientContactName?.message}>
            <TextInput icon={User} placeholder="Optional" {...register("clientContactName")} />
          </FormField>

          <FormField label="Responsible Person" error={errors.responsiblePerson?.message}>
            <TextInput icon={User} placeholder="Optional" {...register("responsiblePerson")} />
          </FormField>

          <FormField label="Scope of Work" error={errors.scopeOfWork?.message}>
            <textarea
              rows={3}
              placeholder="Describe the scope of work..."
              className="w-full rounded-sm border border-biz-border bg-biz-surface px-3 py-2 text-[13px] text-biz-text placeholder:text-biz-muted focus:outline-none focus:ring-2 focus:ring-biz-blue/30"
              {...register("scopeOfWork")}
            />
          </FormField>

          <FormField label="Remarks" error={errors.remarks?.message}>
            <textarea
              rows={3}
              placeholder="Additional notes..."
              className="w-full rounded-sm border border-biz-border bg-biz-surface px-3 py-2 text-[13px] text-biz-text placeholder:text-biz-muted focus:outline-none focus:ring-2 focus:ring-biz-blue/30"
              {...register("remarks")}
            />
          </FormField>
        </div>

        {(createMutation.isError || updateMutation.isError) && (
          <p className="mt-4 text-[13px] text-biz-danger">Failed to save contract. Please try again.</p>
        )}

        <div className="mt-8 flex items-center justify-end gap-3 border-t border-biz-border pt-5">
          <SecondaryButton type="button" onClick={() => router.push(contract ? `/cms/contracts/${contract.id}` : "/cms/contracts")}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={isPending}>
            <Save className="h-4 w-4" />
            {isPending ? "Saving..." : "Save Draft"}
          </PrimaryButton>
        </div>
      </form>
    </div>
  );
}
