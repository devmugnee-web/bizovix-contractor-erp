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
import { SuccessPopup } from "@/components/layout/SuccessPopup";

const DEFAULT_VAT_RATE = 10;
const DEFAULT_TAX_RATE = 5;
const DEFAULT_SECURITY_DEPOSIT_RATE = 10;

interface ContractFormProps {
  mode: "create" | "edit";
  contract?: ContractDetail;
  initialWork?: {
    id: string;
    workName: string;
    tender?: { id: string; workName: string };
    contractValue?: string;
    startDate?: string | null;
    expectedCompletionDate?: string | null;
    clientContactName?: string;
  };
}

export function ContractForm({ mode, contract, initialWork }: ContractFormProps) {
  const router = useRouter();
  const createMutation = useCreateContract();
  const updateMutation = useUpdateContract();
  const isPending = createMutation.isPending || updateMutation.isPending;
  const [createdContract, setCreatedContract] = React.useState<{
    id: string;
    cmsWorkId: string;
  } | null>(null);

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
      tenderId: contract?.tenderId ?? initialWork?.tender?.id ?? "",
      contractType: contract?.contractType ?? "WORK_ORDER",
      contractNo: contract?.contractNo ?? "",
      issueDate: contract?.issueDate.slice(0, 10) ?? "",
      contractDate: contract?.contractDate?.slice(0, 10) ?? "",
      originalContractValue: contract
        ? Number(contract.originalContractValue)
        : initialWork?.contractValue
          ? Number(initialWork.contractValue)
          : undefined,
      currentContractValue: contract ? Number(contract.currentContractValue) : undefined,
      currency: contract?.currency ?? "BDT",
      commencementDate:
        contract?.commencementDate.slice(0, 10) ?? initialWork?.startDate?.slice(0, 10) ?? "",
      originalCompletionDate:
        contract?.originalCompletionDate.slice(0, 10) ??
        initialWork?.expectedCompletionDate?.slice(0, 10) ??
        "",
      currentCompletionDate: contract?.currentCompletionDate?.slice(0, 10) ?? "",
      durationDays: contract?.durationDays ?? undefined,
      dlpDays: contract?.dlpDays ?? undefined,
      retentionPct: contract?.retentionPct ? Number(contract.retentionPct) : undefined,
      securityDepositPct: contract
        ? contract.securityDepositPct == null
          ? DEFAULT_SECURITY_DEPOSIT_RATE
          : Number(contract.securityDepositPct)
        : DEFAULT_SECURITY_DEPOSIT_RATE,
      vatPct: contract
        ? contract.vatPct == null
          ? DEFAULT_VAT_RATE
          : Number(contract.vatPct)
        : DEFAULT_VAT_RATE,
      taxPct: contract
        ? contract.taxPct == null
          ? DEFAULT_TAX_RATE
          : Number(contract.taxPct)
        : DEFAULT_TAX_RATE,
      securityDepositMethod: (contract?.securityDepositMethod ??
        "") as CreateContractFormValues["securityDepositMethod"],
      securityDepositStatus: (contract?.securityDepositStatus ??
        "") as CreateContractFormValues["securityDepositStatus"],
      securityDepositReleasedAmount: contract?.securityDepositReleasedAmount
        ? Number(contract.securityDepositReleasedAmount)
        : undefined,
      securityDepositReleaseDueDate: contract?.securityDepositReleaseDueDate?.slice(0, 10) ?? "",
      securityDepositReleasedDate: contract?.securityDepositReleasedDate?.slice(0, 10) ?? "",
      clientContactName: contract?.clientContactName ?? initialWork?.clientContactName ?? "",
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
  const [selectedTender, setSelectedTender] = React.useState<{
    value: string;
    label: string;
  } | null>(
    contract?.tender
      ? { value: contract.tender.id, label: contract.tender.workName }
      : initialWork?.tender
        ? { value: initialWork.tender.id, label: initialWork.tender.workName }
        : null,
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
      vatPct: values.vatPct,
      taxPct: values.taxPct,
      securityDepositMethod: values.securityDepositMethod || undefined,
      securityDepositStatus: values.securityDepositStatus || undefined,
      securityDepositReleasedAmount: values.securityDepositReleasedAmount,
      securityDepositReleaseDueDate: values.securityDepositReleaseDueDate || undefined,
      securityDepositReleasedDate: values.securityDepositReleasedDate || undefined,
      clientContactName: values.clientContactName || undefined,
      responsiblePerson: values.responsiblePerson || undefined,
      scopeOfWork: values.scopeOfWork || undefined,
      remarks: values.remarks || undefined,
    };

    if (mode === "create") {
      createMutation.mutate(payload, {
        onSuccess: (record) =>
          setCreatedContract({ id: record.id, cmsWorkId: record.cmsWorkId }),
      });
    } else if (contract) {
      updateMutation.mutate(
        { id: contract.id, payload },
        {
          onSuccess: (record) =>
            setCreatedContract({ id: record.id, cmsWorkId: record.cmsWorkId }),
        },
      );
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <SuccessPopup
        open={createdContract !== null}
        title={
          mode === "create"
            ? "Contract & Financials Saved Successfully"
            : "Contract & Financials Updated Successfully"
        }
        message={
          mode === "create"
            ? "The contract and project financial information have been saved."
            : "The updated contract and project financial information have been saved."
        }
        onClose={() => {
          if (createdContract) router.push(`/cms/contracts/${createdContract.id}`);
        }}
        primaryLabel="Back to Ongoing Work"
        onPrimary={() => {
          if (createdContract) router.push(`/cms/ongoing-works/${createdContract.cmsWorkId}`);
        }}
        secondaryLabel="View Contract Details"
        onSecondary={() => {
          if (createdContract) router.push(`/cms/contracts/${createdContract.id}`);
        }}
        dismissOnBackdrop={false}
        dismissOnEscape={false}
      />
      <button
        type="button"
        onClick={() => router.back()}
        className="flex h-9 w-fit items-center gap-2 rounded-md border border-biz-border bg-white px-4 text-[12px] font-semibold text-biz-navy shadow-sm transition-colors hover:border-biz-blue hover:bg-biz-blue-soft hover:text-biz-blue"
      >
        <span aria-hidden="true">&larr;</span>
        Back
      </button>
      <PageHeader
        title={mode === "create" ? "Set Up Contract & Financials" : "Edit Contract & Financials"}
        subtitle={mode === "create" ? "Enter the official contract details and financial deductions. You can update progress and release information later." : "Update contract, financial and lifecycle information."}
      />

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="rounded-lg border border-biz-border bg-biz-surface p-4"
      >
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 lg:grid-cols-2">
          <div className="border-b border-biz-border pb-1 text-[11px] font-bold uppercase tracking-wide text-biz-blue lg:col-span-2">Contract Basics</div>
          <FormField
            label="Linked Project / Work"
            required
            helper="Type minimum 2 characters to search"
            error={errors.cmsWorkId?.message}
          >
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

          <FormField
            label="Linked Tender"
            helper="Optional — only if this contract originated from a tracked tender"
            error={errors.tenderId?.message}
          >
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
            <TextInput
              icon={Briefcase}
              placeholder="e.g. WO-2026-0012"
              {...register("contractNo")}
            />
          </FormField>

          <FormField label="Issue Date" required error={errors.issueDate?.message}>
            <Controller
              control={control}
              name="issueDate"
              render={({ field }) => <DateInput {...field} />}
            />
          </FormField>

          <FormField label="Contract Date" error={errors.contractDate?.message}>
            <Controller
              control={control}
              name="contractDate"
              render={({ field }) => <DateInput {...field} />}
            />
          </FormField>

          <FormField
            label="Original Contract Value"
            required
            error={errors.originalContractValue?.message}
          >
            <CurrencyInput
              placeholder="Enter contract value"
              {...register("originalContractValue")}
            />
          </FormField>

          {mode === "edit" && (

            <FormField

                        label="Current Contract Value"

                        helper="Defaults to original value if left blank"

                        error={errors.currentContractValue?.message}

                      >

                        <CurrencyInput placeholder="Same as original" {...register("currentContractValue")} />

                      </FormField>

          )}

          <div className="border-b border-biz-border pb-1 text-[11px] font-bold uppercase tracking-wide text-biz-blue lg:col-span-2">Schedule</div>

          <FormField label="Commencement Date" required error={errors.commencementDate?.message}>
            <Controller
              control={control}
              name="commencementDate"
              render={({ field }) => <DateInput {...field} />}
            />
          </FormField>

          <FormField
            label="Original Completion Date"
            required
            error={errors.originalCompletionDate?.message}
          >
            <Controller
              control={control}
              name="originalCompletionDate"
              render={({ field }) => <DateInput {...field} />}
            />
          </FormField>

          {mode === "edit" && (

            <FormField

                        label="Current Completion Date"

                        helper="Defaults to original completion date"

                        error={errors.currentCompletionDate?.message}

                      >

                        <Controller

                          control={control}

                          name="currentCompletionDate"

                          render={({ field }) => <DateInput {...field} />}

                        />

                      </FormField>

          )}

          {mode === "edit" && (

            <FormField

                        label="Duration (Days)"

                        helper="Auto-calculated if left blank"

                        error={errors.durationDays?.message}

                      >

                        <TextInput type="number" placeholder="Auto-calculated" {...register("durationDays")} />

                      </FormField>

          )}

          <div className="border-b border-biz-border pb-1 text-[11px] font-bold uppercase tracking-wide text-biz-blue lg:col-span-2">Financial Terms</div>

          <FormField label="Defect Liability Period (Days)" error={errors.dlpDays?.message}>
            <TextInput type="number" placeholder="Optional" {...register("dlpDays")} />
          </FormField>

          <FormField label="Retention %" error={errors.retentionPct?.message}>
            <TextInput
              type="number"
              step="0.01"
              placeholder="Optional"
              {...register("retentionPct")}
            />
          </FormField>

          <FormField label="Security Deposit (SD) %" error={errors.securityDepositPct?.message}>
            <TextInput
              type="number"
              step="0.01"
              placeholder="Optional"
              {...register("securityDepositPct")}
            />
          </FormField>

          <FormField label="VAT %" error={errors.vatPct?.message}>
            <TextInput type="number" step="0.01" placeholder="Optional" {...register("vatPct")} />
          </FormField>

          <FormField label="Tax %" error={errors.taxPct?.message}>
            <TextInput type="number" step="0.01" placeholder="Optional" {...register("taxPct")} />
          </FormField>

          <FormField label="How SD Is Held" error={errors.securityDepositMethod?.message}>
            <Controller
              control={control}
              name="securityDepositMethod"
              render={({ field }) => (
                <SelectInput
                  options={[
                    { value: "", label: "Not configured" },
                    { value: "SD_DEDUCTED_FROM_BILL", label: "SD Deducted from Bill" },
                    { value: "PG_RETAINED_AS_SECURITY", label: "PG Retained as Security" },
                  ]}
                  {...field}
                />
              )}
            />
          </FormField>

          <FormField label="Current SD Status" error={errors.securityDepositStatus?.message}>
            <Controller
              control={control}
              name="securityDepositStatus"
              render={({ field }) => (
                <SelectInput
                  options={[
                    { value: "", label: "Not configured" },
                    { value: "HELD", label: "Held" },
                    { value: "PARTIALLY_RELEASED", label: "Partially Released" },
                    { value: "RELEASED", label: "Released" },
                  ]}
                  {...field}
                />
              )}
            />
          </FormField>

          {mode === "edit" && (

            <FormField

                        label="SD Released Amount"

                        error={errors.securityDepositReleasedAmount?.message}

                      >

                        <CurrencyInput placeholder="Optional" {...register("securityDepositReleasedAmount")} />

                      </FormField>

          )}

          {mode === "edit" && (

            <FormField

                        label="SD Release Due Date"

                        error={errors.securityDepositReleaseDueDate?.message}

                      >

                        <Controller

                          control={control}

                          name="securityDepositReleaseDueDate"

                          render={({ field }) => <DateInput {...field} />}

                        />

                      </FormField>

          )}

          {mode === "edit" && (

            <FormField label="SD Released Date" error={errors.securityDepositReleasedDate?.message}>

                        <Controller

                          control={control}

                          name="securityDepositReleasedDate"

                          render={({ field }) => <DateInput {...field} />}

                        />

                      </FormField>

          )}

          <div className="border-b border-biz-border pb-1 text-[11px] font-bold uppercase tracking-wide text-biz-blue lg:col-span-2">Contacts & Scope</div>

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
          <p className="mt-4 text-[13px] text-biz-danger">
            Failed to save contract. Please try again.
          </p>
        )}

        <div className="mt-8 flex items-center justify-end gap-3 border-t border-biz-border pt-5">
          <SecondaryButton
            type="button"
            onClick={() =>
              router.push(contract ? `/cms/contracts/${contract.id}` : "/cms/contracts")
            }
          >
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={isPending}>
            <Save className="h-4 w-4" />
            {isPending ? "Saving..." : "Save Contract"}
          </PrimaryButton>
        </div>
      </form>
    </div>
  );
}
