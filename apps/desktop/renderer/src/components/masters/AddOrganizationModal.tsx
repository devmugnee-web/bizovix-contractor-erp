"use client";

import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ApiError, isAcceptedOrganizationMaster, useCreateOrganizationMaster, useOrganizationDraft, useOrganizationDrafts, useReviseOrganizationDraft } from "@bizovix/api-client";
import { createOrganizationMasterSchema, type CreateOrganizationMasterFormValues } from "@bizovix/validation";
import type { OrganizationMasterOption } from "@bizovix/types";
import { FormField, PrimaryButton, SecondaryButton, TextInput } from "@bizovix/ui";
import { Modal } from "@/components/layout/Modal";
import { MasterSyncReview, MasterSyncState } from "./MasterSyncNotice";

export function AddOrganizationModal({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated: (organization: OrganizationMasterOption) => void;
}) {
  const create = useCreateOrganizationMaster();
  const revise = useReviseOrganizationDraft();
  const [saved, setSaved] = useState<OrganizationMasterOption | null>(null);
  const [error, setError] = useState<string | null>(null);
  const drafts = useOrganizationDrafts(open);
  const edits = useRef(new Map<string, CreateOrganizationMasterFormValues>());
  const draft = useOrganizationDraft(open ? saved?.id : undefined);
  const current = draft.data ?? saved;
  const saving = create.isPending || revise.isPending;
  const accepted = !!current && isAcceptedOrganizationMaster(current);
  const canRevise = current?.syncStatus === "REJECTED" && !current.cloudRecord;
  const locked = saving || (!!current && !canRevise);
  const { register, handleSubmit, reset, getValues, formState: { errors } } = useForm<CreateOrganizationMasterFormValues>({
    resolver: zodResolver(createOrganizationMasterSchema),
    defaultValues: { shortName: "", fullName: "" },
  });
  const recoverable = drafts.data ?? [];
  const choices = current && !recoverable.some((record) => record.id === current.id)
    ? [current, ...recoverable]
    : recoverable.map((record) => record.id === current?.id ? current : record);

  function recover(id: string) {
    const record = choices.find((option) => option.id === id) ?? null;
    edits.current.set(saved?.id ?? "new", getValues());
    setSaved(record);
    setError(null);
    reset(edits.current.get(record?.id ?? "new") ?? (record ? { shortName: record.shortName, fullName: record.fullName } : { shortName: "", fullName: "" }));
  }

  function choose(organization: OrganizationMasterOption) {
    if (!isAcceptedOrganizationMaster(organization)) return;
    edits.current.delete(organization.id);
    reset();
    setSaved(null);
    setError(null);
    onCreated(organization);
  }

  async function submit(values: CreateOrganizationMasterFormValues) {
    if (locked) return;
    setError(null);
    try {
      const organization = current
        ? await revise.mutateAsync({ id: current.id, payload: values })
        : await create.mutateAsync(values);
      if (isAcceptedOrganizationMaster(organization)) choose(organization);
      else {
        edits.current.delete(current?.id ?? "new");
        setSaved(organization);
      }
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The organization could not be saved. Your entered values are preserved.");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={current ? "Saved Organization" : "Add New Organization"} contentClassName="max-h-[calc(100dvh-2rem)] overflow-y-auto">
      <form onSubmit={(event) => void handleSubmit(submit)(event)} className="flex flex-col gap-4">
        {choices.length > 0 && <FormField label="Saved organization drafts">
          <select aria-label="Saved organization drafts" disabled={saving} value={saved?.id ?? ""} onChange={(event) => recover(event.target.value)} className="w-full rounded-md border border-biz-border bg-biz-surface px-3 py-2 text-[13px]">
            <option value="">New organization</option>
            {choices.map((record) => <option key={record.id} value={record.id}>{record.shortName} — {record.fullName} ({record.syncStatus === "REJECTED" ? "needs review" : record.syncStatus === "SYNCED" ? "synced" : "waiting to sync"})</option>)}
          </select>
          <p className="mt-1 text-[12px] text-biz-muted">Choose a saved draft to continue. Switching keeps any names you have entered in this window.</p>
        </FormField>}
        {current && <div className="text-[13px]">
          <MasterSyncState record={current} />
          <p className="mt-2">{accepted ? "This organization is ready to use. Select it below to continue." : "The organization is saved on this PC. It can be selected for this document after the cloud accepts it. You can close this window; your entered document values will stay here."}</p>
        </div>}
        {canRevise && <MasterSyncReview error={current?.syncError?.message} hasCloudRecord={false} fields={[
          { label: "Short name", local: current.shortName },
          { label: "Full name", local: current.fullName },
        ]} />}
        <FormField label="Short Name" required error={errors.shortName?.message}>
          <TextInput disabled={locked} placeholder="e.g. DPHE" {...register("shortName")} />
        </FormField>
        <FormField label="Full Name" required error={errors.fullName?.message}>
          <TextInput disabled={locked} placeholder="e.g. Department of Public Health Engineering" {...register("fullName")} />
        </FormField>
        {error && <p role="alert" className="text-[13px] text-biz-danger">{error}</p>}
        {draft.isError && <p role="alert" className="text-[13px] text-biz-danger">{draft.error instanceof ApiError ? draft.error.message : "The saved organization's sync status could not be checked."}</p>}
        {drafts.isError && <p role="alert" className="text-[13px] text-biz-danger">{drafts.error instanceof ApiError ? drafts.error.message : "Saved organization drafts could not be loaded."}</p>}
        <div className="mt-2 flex justify-end gap-3">
          <SecondaryButton type="button" onClick={onClose}>{current ? "Close" : "Cancel"}</SecondaryButton>
          {accepted ? <PrimaryButton type="button" onClick={() => choose(current)}>Use organization</PrimaryButton> : <PrimaryButton type="submit" disabled={locked}>
            {saving ? "Saving..." : canRevise ? "Queue reviewed organization" : current ? "Waiting to sync" : "Save"}
          </PrimaryButton>}
        </div>
      </form>
    </Modal>
  );
}
