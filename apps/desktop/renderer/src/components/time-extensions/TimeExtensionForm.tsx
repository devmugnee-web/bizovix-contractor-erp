"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { useContracts, useCreateTimeExtension } from "@bizovix/api-client";
import { DateInput, FormField, PageHeader, PrimaryButton, SecondaryButton, TextInput } from "@bizovix/ui";

export function TimeExtensionForm({ cmsWorkId }: { cmsWorkId: string }) {
  const router = useRouter();
  const contracts = useContracts({ cmsWorkId, limit: 1 });
  const contract = contracts.data?.items[0];
  const createEot = useCreateTimeExtension();

  const [requestDate, setRequestDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [requestedDays, setRequestedDays] = React.useState("30");
  const [reason, setReason] = React.useState("");
  const [description, setDescription] = React.useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contract) return;
    createEot.mutate(
      {
        contractId: contract.id,
        requestDate,
        requestedDays: Number(requestedDays),
        reason,
        description: description || undefined,
      },
      { onSuccess: (record) => router.push(`/cms/time-extensions/${record.id}`) },
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Add Time Extension" subtitle="Track requested and approved extensions of time (EOT) for this contract." />
      <form onSubmit={handleSubmit} className="rounded-lg border border-biz-border bg-biz-surface p-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <FormField label="Contract" required>
            <TextInput value={contract?.contractNo ?? "Loading..."} readOnly disabled />
          </FormField>
          <FormField label="Current Completion Date">
            <TextInput value={contract ? new Date(contract.currentCompletionDate).toLocaleDateString("en-GB") : "—"} readOnly disabled />
          </FormField>
          <FormField label="Request Date" required>
            <DateInput value={requestDate} onChange={(e) => setRequestDate(e.target.value)} />
          </FormField>
          <FormField label="Requested Extension Days" required>
            <TextInput type="number" min={1} value={requestedDays} onChange={(e) => setRequestedDays(e.target.value)} />
          </FormField>
          <FormField label="Reason" required>
            <TextInput placeholder="e.g. Force majeure, design change" value={reason} onChange={(e) => setReason(e.target.value)} />
          </FormField>
          <FormField label="Description">
            <textarea
              rows={3}
              className="w-full rounded-sm border border-biz-border bg-biz-surface px-3 py-2 text-[13px] text-biz-text placeholder:text-biz-muted focus:outline-none focus:ring-2 focus:ring-biz-blue/30"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </FormField>
        </div>

        {createEot.isError && <p className="mt-4 text-[13px] text-biz-danger">Failed to save time extension. Please try again.</p>}

        <div className="mt-8 flex items-center justify-end gap-3 border-t border-biz-border pt-5">
          <SecondaryButton type="button" onClick={() => router.back()}>
            Cancel
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={createEot.isPending || !contract || !reason}>
            <Save className="h-4 w-4" />
            {createEot.isPending ? "Saving..." : "Save Draft"}
          </PrimaryButton>
        </div>
      </form>
    </div>
  );
}
