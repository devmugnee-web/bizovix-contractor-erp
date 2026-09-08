"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Building2, Check, FileCheck2, LoaderCircle, Save, UploadCloud } from "lucide-react";
import {
  ApiError,
  extractTenderPdf,
  useOrganizations,
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
  type TenderPdfExtractionResult,
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

function unwrapPdfExtractionResult(
  response: TenderPdfExtractionResult,
): TenderPdfExtractionResult {
  if (typeof response.extractedFieldCount === "number") return response;

  const nested = (response as unknown as { data?: TenderPdfExtractionResult }).data;
  if (nested && typeof nested.extractedFieldCount === "number") return nested;

  throw new Error("The tender PDF response did not contain readable form data.");
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
  const [pdfImportError, setPdfImportError] = React.useState("");
  const [pdfImportNotice, setPdfImportNotice] = React.useState("");
  const [isReadingPdf, setIsReadingPdf] = React.useState(false);
  const pdfInputRef = React.useRef<HTMLInputElement>(null);

  const {
    control,
    register,
    handleSubmit,
    clearErrors,
    getValues,
    reset,
    formState: { errors },
  } = useForm<TenderFormInput, unknown, CreateTenderFormValues>({
    resolver: zodResolver(createTenderSchema),
    defaultValues: {
      egpTenderId: tender?.egpTenderId ?? "",
      documentFee: tender?.documentFee == null ? null : Number(tender.documentFee),
      estimatedTenderSecurityAmount: tender?.estimatedTenderSecurityAmount == null ? null : Number(tender.estimatedTenderSecurityAmount),
      preBidEndDate: tender?.preBidEndDate ? new Date(new Date(tender.preBidEndDate).getTime() + 6 * 60 * 60 * 1000).toISOString().slice(0, 16) : "",
      paName: tender?.paName ?? "",
      paDesignation: tender?.paDesignation ?? "",
      paPhone: tender?.paPhone ?? "",
      paAddress: tender?.paAddress ?? "",
      noticeOrganization: tender?.noticeOrganization ?? tender?.organizationMaster?.fullName ?? "",
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

  const organizationName = useWatch({ control, name: "noticeOrganization" }) ?? "";
  const organizations = useOrganizations(organizationName);
  const meetingEnd = useWatch({ control, name: "preBidEndDate" });
  const users = tenderOptions.data?.users ?? [];

  async function readTenderPdf(file: File | undefined) {
    if (!file || isReadingPdf) return;
    setPdfImportError("");
    setPdfImportNotice("");
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setPdfImportError("Only PDF files can be imported.");
      if (pdfInputRef.current) pdfInputRef.current.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setPdfImportError("Tender PDF must be 10 MB or smaller.");
      if (pdfInputRef.current) pdfInputRef.current.value = "";
      return;
    }

    setIsReadingPdf(true);
    try {
      const result = unwrapPdfExtractionResult(await extractTenderPdf(file));
      const { data } = result;
      const current = getValues();
      const preBidEndDate = data.preBidEndDate
        ? new Date(new Date(data.preBidEndDate).getTime() + 6 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 16)
        : current.preBidEndDate;

      reset(
        {
          ...current,
          egpTenderId: data.egpTenderId ?? current.egpTenderId,
          documentFee: data.documentFee ?? current.documentFee,
          estimatedTenderSecurityAmount:
            data.estimatedTenderSecurityAmount ?? current.estimatedTenderSecurityAmount,
          preBidEndDate,
          paName: data.paName ?? current.paName,
          paDesignation: data.paDesignation ?? current.paDesignation,
          paPhone: data.paPhone ?? current.paPhone,
          paAddress: data.paAddress ?? current.paAddress,
          noticeOrganization: data.noticeOrganization ?? current.noticeOrganization,
          workName: data.workName ?? current.workName,
          tenderType: data.tenderType ?? current.tenderType,
          procurementMethod: data.procurementMethod ?? current.procurementMethod,
          submissionDeadline: data.submissionDeadline ?? current.submissionDeadline,
          remarks: data.remarks ?? current.remarks,
        },
        { keepDefaultValues: true },
      );
      clearErrors();

      const warningText = result.warnings.length > 0 ? ` ${result.warnings.join(". ")}.` : "";
      setPdfImportNotice(
        `${result.extractedFieldCount} field${result.extractedFieldCount === 1 ? "" : "s"} filled from ${result.totalPages} PDF page${result.totalPages === 1 ? "" : "s"}. The PDF was not saved.${warningText}`,
      );
    } catch (error) {
      setPdfImportError(
        error instanceof Error ? error.message : "Could not read this tender PDF.",
      );
    } finally {
      setIsReadingPdf(false);
      if (pdfInputRef.current) pdfInputRef.current.value = "";
    }
  }

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
      documentFee: values.documentFee,
      estimatedTenderSecurityAmount: values.estimatedTenderSecurityAmount,
      preBidEndDate: values.preBidEndDate ? values.preBidEndDate + ":00+06:00" : null,
      paName: values.paName ?? "",
      paDesignation: values.paDesignation ?? "",
      paPhone: values.paPhone ?? "",
      paAddress: values.paAddress ?? "",
      noticeOrganization: values.noticeOrganization ?? "",
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
        error instanceof Error && error.message
          ? error.message
          : "Failed to save tender. Please try again.",
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
        {mode === "create" && (
          <div className="mb-6 rounded-md border border-dashed border-blue-300 bg-blue-50/50 p-3">
            <input
              ref={pdfInputRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(event) => void readTenderPdf(event.target.files?.[0])}
            />
            <button
              type="button"
              disabled={isReadingPdf}
              onClick={() => pdfInputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                void readTenderPdf(event.dataTransfer.files?.[0]);
              }}
              className="flex w-full items-center justify-center gap-3 rounded-sm px-3 py-3 text-left transition-colors hover:bg-blue-100/60 disabled:cursor-wait disabled:opacity-70"
            >
              {isReadingPdf ? (
                <LoaderCircle className="h-6 w-6 shrink-0 animate-spin text-biz-blue" />
              ) : (
                <UploadCloud className="h-6 w-6 shrink-0 text-biz-blue" />
              )}
              <span>
                <span className="block text-[13px] font-semibold text-biz-text">
                  {isReadingPdf ? "Reading tender PDF..." : "Import Tender PDF"}
                </span>
                <span className="block text-[11px] text-biz-muted">
                  Drop a PDF here or click to browse. It fills this form temporarily and is never
                  saved. Max 10 MB.
                </span>
              </span>
            </button>
            {pdfImportNotice && (
              <p
                aria-live="polite"
                className="mt-2 flex items-start gap-2 rounded-sm bg-emerald-50 px-3 py-2 text-[11px] font-medium text-emerald-700"
              >
                <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{pdfImportNotice} Please review the filled information before saving.</span>
              </p>
            )}
            {pdfImportError && (
              <p aria-live="polite" className="mt-2 text-[12px] font-medium text-biz-danger">
                {pdfImportError}
              </p>
            )}
          </div>
        )}

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
            <FormField label="Procurement Nature" error={errors.tenderType?.message}>
              <Controller
                control={control}
                name="tenderType"
                render={({ field }) => (
                  <SelectInput
                    {...field}
                    placeholder="Select procurement nature"
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
            <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {([{ key: "estimatedTenderSecurityAmount", label: "Tender Security (BDT)" }, { key: "documentFee", label: "Document Fee (BDT)" }] as const).map(({ key, label }) => (
                <FormField key={key} label={label} htmlFor={key} error={errors[key]?.message}>
                  <Controller control={control} name={key} render={({ field }) => (
                    <TextInput id={key} name={field.name} type="number" min="0" step="0.01" value={field.value ?? ""} onBlur={field.onBlur} ref={field.ref}
                      onChange={(event) => field.onChange(event.target.value === "" ? null : Number(event.target.value))} />
                  )} />
                </FormField>
              ))}
              <FormField label="Meeting End Date & Time (BD)" htmlFor="preBidEndDate" error={errors.preBidEndDate?.message}>
                <TextInput id="preBidEndDate" type="datetime-local" {...register("preBidEndDate")} />
                {meetingEnd && !Number.isNaN(Date.parse(meetingEnd)) && <span className="text-xs text-biz-muted">{new Date(meetingEnd).toLocaleDateString("en-GB", { weekday: "long" })}</span>}
              </FormField>
              <FormField label="Organization" htmlFor="noticeOrganization" error={errors.noticeOrganization?.message}>
                <TextInput id="noticeOrganization" list="tender-notice-organizations" {...register("noticeOrganization")} />
                <datalist id="tender-notice-organizations">
                  {(organizations.data ?? []).map((org) => <option key={org.id} value={org.fullName}>{org.shortName}</option>)}
                </datalist>
              </FormField>
              <FormField label="PA Name" htmlFor="paName" error={errors.paName?.message}><TextInput id="paName" {...register("paName")} /></FormField>
              <FormField label="PA Designation" htmlFor="paDesignation" error={errors.paDesignation?.message}><TextInput id="paDesignation" {...register("paDesignation")} /></FormField>
              <FormField label="PA Phone Number" htmlFor="paPhone" error={errors.paPhone?.message}><TextInput id="paPhone" type="tel" {...register("paPhone")} /></FormField>
              <div className="sm:col-span-2">
                <FormField label="PE Address" htmlFor="paAddress" error={errors.paAddress?.message}><TextInput id="paAddress" {...register("paAddress")} /></FormField>
              </div>
            </div>
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
