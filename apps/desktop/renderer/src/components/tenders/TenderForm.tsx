"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Building2, Check, Save } from "lucide-react";
import {
  ApiError,
  useCreateTender,
  useSubmitTenderForCostingApproval,
  useTenderOptions,
  useUpdateTender,
} from "@bizovix/api-client";
import { createTenderSchema, type CreateTenderFormValues } from "@bizovix/validation";
import {
  DateInput,
  FormField,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  SelectInput,
  TextInput,
} from "@bizovix/ui";
import {
  TENDER_PROCUREMENT_METHODS,
  type TenderDetail,
  type TenderDuplicateConflict,
} from "@bizovix/types";
import { Modal } from "@/components/layout/Modal";

interface TenderFormProps {
  mode: "create" | "edit";
  tender?: TenderDetail;
  embedded?: boolean;
  onCancel?: () => void;
  onCompleted?: (message: string) => void;
}

type TenderFormInput = z.input<typeof createTenderSchema>;

const TENDER_TYPE_OPTIONS = [
  { value: "Works", label: "Works" },
  { value: "Goods", label: "Goods" },
  { value: "Services", label: "Services" },
  { value: "Physical Service", label: "Physical Service" },
];

interface DuplicateTenderState {
  tenderId: string;
  workName?: string;
  organization?: string;
  foundBy?: string;
  createdAt?: string;
  message: string;
}

function localDate(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function firstError(errors: Record<string, string[]> | undefined, key: string): string | undefined {
  return errors?.[key]?.[0];
}

function duplicateFromError(error: unknown, fallbackTenderId: string): DuplicateTenderState | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;

  const serialized = firstError(error.errors, "duplicate");
  if (serialized) {
    try {
      const conflict = JSON.parse(serialized) as TenderDuplicateConflict;
      if (conflict.code === "DUPLICATE_TENDER_ID") {
        return {
          tenderId: conflict.existing.egpTenderId,
          workName: conflict.existing.workName,
          organization: conflict.existing.organizationMaster?.shortName,
          foundBy: conflict.existing.foundBy?.name ?? conflict.existing.foundByName ?? undefined,
          createdAt: conflict.existing.createdAt,
          message: conflict.message,
        };
      }
    } catch {
      // Older API responses expose duplicate details as individual error fields.
    }
  }

  return {
    tenderId: firstError(error.errors, "tenderId") ?? fallbackTenderId,
    workName: firstError(error.errors, "existingWorkName") ?? firstError(error.errors, "workName"),
    organization:
      firstError(error.errors, "existingOrganizationShortName") ??
      firstError(error.errors, "organization"),
    foundBy:
      firstError(error.errors, "foundByName") ?? firstError(error.errors, "createdByName"),
    createdAt: firstError(error.errors, "createdAt"),
    message: error.message,
  };
}

export function TenderForm({
  mode,
  tender,
  embedded = false,
  onCancel,
  onCompleted,
}: TenderFormProps) {
  const router = useRouter();
  const tenderOptions = useTenderOptions();
  const createMutation = useCreateTender();
  const updateMutation = useUpdateTender();
  const submitForCosting = useSubmitTenderForCostingApproval();
  const isPending =
    createMutation.isPending || updateMutation.isPending || submitForCosting.isPending;

  const [duplicate, setDuplicate] = React.useState<DuplicateTenderState | null>(null);
  const [saveError, setSaveError] = React.useState("");

  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TenderFormInput, unknown, CreateTenderFormValues>({
    resolver: zodResolver(createTenderSchema),
    defaultValues: {
      egpTenderId: tender?.egpTenderId ?? "",
      workName: tender?.workName ?? "",
      tenderType: tender?.tenderType ?? "",
      procurementMethod: tender?.procurementMethod ?? "OTM",
      submissionDeadline: tender?.submissionDeadline?.slice(0, 10) ?? "",
      description: tender?.description ?? "",
      foundByName: tender?.foundBy?.name ?? tender?.foundByName ?? "",
      findingDate: tender?.findingDate?.slice(0, 10) ?? localDate(),
      remarks: tender?.remarks ?? tender?.description ?? "",
    },
  });

  const users = tenderOptions.data?.users ?? [];

  function finish(message: string) {
    if (onCompleted) {
      onCompleted(message);
      return;
    }
    router.push(`/tenders?notice=${encodeURIComponent(message)}`);
  }

  async function save(values: CreateTenderFormValues, action: "DRAFT" | "SUBMIT") {
    setSaveError("");
    const foundByText = values.foundByName?.trim() ?? "";
    const selectedUser =
      users.find(
        (user) =>
          user.name.localeCompare(foundByText, undefined, { sensitivity: "base" }) === 0,
      ) ??
      (tender?.foundBy?.name.localeCompare(foundByText, undefined, { sensitivity: "base" }) === 0
        ? tender.foundBy
        : undefined);
    const payload = {
      egpTenderId: values.egpTenderId.trim(),
      workName: values.workName,
      tenderType: values.tenderType || undefined,
      procurementMethod: values.procurementMethod,
      submissionDeadline: values.submissionDeadline,
      description: values.description || values.remarks || undefined,
      foundByUserId: selectedUser?.id ?? "",
      foundByName: selectedUser ? "" : foundByText,
      findingDate: values.findingDate || undefined,
      remarks: values.remarks || undefined,
    };

    try {
      const record =
        mode === "create"
          ? await createMutation.mutateAsync(payload)
          : tender
            ? await updateMutation.mutateAsync({ id: tender.id, payload })
            : null;
      if (!record) return;

      if (action === "SUBMIT") {
        try {
          await submitForCosting.mutateAsync({
            id: record.id,
            payload: { version: record.version },
          });
        } catch (submitError) {
          const detail = submitError instanceof ApiError ? ` ${submitError.message}` : "";
          finish(
            `Tender was saved as a draft, but it could not be submitted for costing approval.${detail}`,
          );
          return;
        }
      }

      const notice =
        action === "SUBMIT"
          ? "Tender submitted for costing approval successfully."
          : mode === "create"
            ? "Tender saved successfully as a draft."
            : "Tender changes saved successfully.";
      finish(notice);
    } catch (error) {
      const duplicateTender = duplicateFromError(error, values.egpTenderId);
      if (duplicateTender) {
        setDuplicate(duplicateTender);
        return;
      }
      setSaveError(
        error instanceof ApiError ? error.message : "Failed to save tender. Please try again.",
      );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {!embedded && (
        <PageHeader
          title={mode === "create" ? "Add Tender" : "Edit Tender"}
          subtitle="Enter the tender information, then save a draft or send it for costing approval."
        />
      )}

      {embedded && (
        <p className="text-[12px] text-biz-muted">
          Enter the tender information, then save a draft or send it for costing approval.
        </p>
      )}

      <form
        className={
          embedded
            ? "bg-biz-surface pt-1"
            : "rounded-lg border border-biz-border bg-biz-surface p-6"
        }
      >
        <div className="grid grid-cols-1 gap-x-5 gap-y-6 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <FormField
              label="Tender ID"
              required
              helper="Tender ID must be unique"
              error={errors.egpTenderId?.message}
            >
              <TextInput autoFocus placeholder="Enter Tender ID" {...register("egpTenderId")} />
            </FormField>
          </div>

          <div className="lg:col-span-8">
            <FormField label="Product / Work Name" required error={errors.workName?.message}>
              <TextInput
                icon={Building2}
                placeholder="Enter product / work name"
                {...register("workName")}
              />
            </FormField>
          </div>

          <div className="lg:col-span-4">
            <FormField label="Tender Type" error={errors.tenderType?.message}>
              <Controller
                control={control}
                name="tenderType"
                render={({ field }) => (
                  <SelectInput
                    {...field}
                    placeholder="Select tender type"
                    options={TENDER_TYPE_OPTIONS}
                  />
                )}
              />
            </FormField>
          </div>

          <div className="lg:col-span-4">
            <FormField
              label="Procurement Method"
              required
              error={errors.procurementMethod?.message}
            >
              <Controller
                control={control}
                name="procurementMethod"
                render={({ field }) => (
                  <SelectInput
                    {...field}
                    options={TENDER_PROCUREMENT_METHODS.map((method) => ({
                      value: method,
                      label: method,
                    }))}
                  />
                )}
              />
            </FormField>
          </div>

          <div className="lg:col-span-4">
            <FormField
              label="Closing / Submission Date"
              required
              error={errors.submissionDeadline?.message}
            >
              <Controller
                control={control}
                name="submissionDeadline"
                render={({ field }) => <DateInput {...field} />}
              />
            </FormField>
          </div>

          <div className="lg:col-span-8">
            <FormField
              label="Search By / Found By"
              helper="Select a suggested user or type a custom name"
              error={errors.foundByName?.message}
            >
              <TextInput
                list="tender-found-by-users"
                placeholder="Select or type a name"
                {...register("foundByName")}
              />
              <datalist id="tender-found-by-users">
                {users.map((user) => (
                  <option key={user.id} value={user.name} />
                ))}
              </datalist>
            </FormField>
          </div>

          <div className="lg:col-span-4">
            <FormField label="Finding Date" error={errors.findingDate?.message}>
              <Controller
                control={control}
                name="findingDate"
                render={({ field }) => <DateInput {...field} />}
              />
            </FormField>
          </div>

          <div className="lg:col-span-12">
            <FormField label="Remarks" error={errors.remarks?.message}>
              <textarea
                rows={3}
                placeholder="Additional notes about this tender..."
                className="w-full rounded-sm border border-biz-border bg-biz-surface px-3 py-2 text-[13px] text-biz-text placeholder:text-biz-muted focus:outline-none focus:ring-2 focus:ring-biz-blue/30"
                {...register("remarks")}
              />
            </FormField>
          </div>
        </div>

        {saveError && <p className="mt-4 text-[13px] text-biz-danger">{saveError}</p>}

        <div className="mt-8 flex flex-wrap items-center justify-end gap-3 border-t border-biz-border pt-5">
          <SecondaryButton
            type="button"
            onClick={() => (onCancel ? onCancel() : router.push("/tenders"))}
          >
            Cancel
          </SecondaryButton>
          <SecondaryButton
            type="button"
            disabled={isPending}
            onClick={handleSubmit((values) => save(values, "DRAFT"))}
          >
            <Save className="h-4 w-4" />
            {isPending ? "Saving..." : "Save Draft"}
          </SecondaryButton>
          <PrimaryButton
            type="button"
            disabled={isPending}
            onClick={handleSubmit((values) => save(values, "SUBMIT"))}
          >
            <Check className="h-4 w-4" />
            {isPending ? "Submitting..." : "Submit for Costing Approval"}
          </PrimaryButton>
        </div>
      </form>

      <Modal open={!!duplicate} onClose={() => setDuplicate(null)} title="Tender ID already exists">
        {duplicate && (
          <div className="flex flex-col gap-4">
            <div className="rounded-md border border-biz-danger/20 bg-biz-danger/5 p-3 text-[13px] text-biz-text">
              <p className="font-semibold text-biz-danger">{duplicate.message}</p>
              <dl className="mt-3 grid grid-cols-[110px_1fr] gap-x-3 gap-y-2">
                <dt className="text-biz-muted">Tender ID</dt>
                <dd className="font-medium">{duplicate.tenderId}</dd>
                {duplicate.workName && (
                  <>
                    <dt className="text-biz-muted">Product / Work</dt>
                    <dd>{duplicate.workName}</dd>
                  </>
                )}
                {duplicate.organization && (
                  <>
                    <dt className="text-biz-muted">Organization</dt>
                    <dd>{duplicate.organization}</dd>
                  </>
                )}
                <dt className="text-biz-muted">Added By</dt>
                <dd>{duplicate.foundBy ?? "Not specified"}</dd>
                <dt className="text-biz-muted">Added On</dt>
                <dd>
                  {duplicate.createdAt
                    ? new Date(duplicate.createdAt).toLocaleString()
                    : "Not available"}
                </dd>
              </dl>
            </div>
            <div className="flex justify-end">
              <SecondaryButton type="button" onClick={() => setDuplicate(null)}>
                Close
              </SecondaryButton>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
}
