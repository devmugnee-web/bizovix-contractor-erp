interface SyncMetadata {
  syncStatus?: "SYNCED" | "PENDING" | "REJECTED";
  syncError?: { kind: string; message: string };
}

export function MasterSyncState({ record }: { record: SyncMetadata }) {
  if (!record.syncStatus) return null;
  return (
    <div className={`mt-1 text-[11px] font-normal ${record.syncStatus === "REJECTED" ? "text-biz-danger" : "text-biz-muted"}`}>
      <p>{record.syncStatus === "PENDING" ? "Saved on this PC · waiting to sync" : record.syncStatus === "REJECTED" ? "Saved on this PC · needs review" : "Synced"}</p>
      {record.syncError && <p className="mt-1 max-w-md text-biz-danger">{record.syncError.message}</p>}
    </div>
  );
}

export function MasterSyncReview({ error, hasCloudRecord, fields }: {
  error?: string;
  hasCloudRecord: boolean;
  fields: { label: string; local: string; cloud?: string }[];
}) {
  return (
    <div className="mb-3 rounded-md border border-biz-border bg-biz-bg p-3 text-[13px]">
      {error && <p className="mb-2 text-biz-danger">{error}</p>}
      {!hasCloudRecord && <p className="mb-2">This saved record has not been accepted by the cloud.</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead><tr><th className="pr-3 pb-1">Field</th><th className="pr-3 pb-1">Saved on this PC</th><th className="pb-1">Accepted cloud value</th></tr></thead>
          <tbody>{fields.map((field) => <tr key={field.label}><th className="pr-3 py-1 font-medium">{field.label}</th><td className="pr-3 py-1">{field.local || "—"}</td><td className="py-1">{hasCloudRecord ? field.cloud || "—" : "Not yet accepted"}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="mt-2">Review your saved values below before sending a revised change. The previous attempt stays in the local history.</p>
    </div>
  );
}
