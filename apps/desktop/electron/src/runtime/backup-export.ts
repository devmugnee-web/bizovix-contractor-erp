export interface BackupExportResult {
  cancelled?: boolean;
  directory?: string;
  createdAt?: string;
  pendingCount?: number;
  rejectedCount?: number;
  error?: string;
}

interface ExportOptions {
  accessToken: unknown;
  origin: string;
  capability: string;
  controlCapability: string;
  chooseDirectory(): Promise<string | null>;
  assertCurrent(): void;
  fetchImpl?: typeof fetch;
}

/** Paths come exclusively from the native chooser, never from renderer input. */
export async function chooseAndExportBackup(options: ExportOptions): Promise<BackupExportResult> {
  const { accessToken, origin, capability, controlCapability, chooseDirectory, assertCurrent } = options;
  if (typeof accessToken !== "string" || !/^[A-Za-z0-9_-]{32,256}$/.test(accessToken)) return { error: "Sign in before exporting a backup." };
  const request = options.fetchImpl ?? fetch;
  const headers = { "X-Bizovix-Local-Capability": capability, Authorization: `Bearer ${accessToken}` };
  assertCurrent();
  // Validate the original session before displaying the native chooser. Never
  // retry with another account's token if sign-in changes while it is open.
  const status = await request(`${origin}/api/v1/desktop/status`, { headers, redirect: "error", signal: AbortSignal.timeout(10_000) });
  await status.body?.cancel();
  if (!status.ok) return { error: "Sign in again before exporting a backup." };
  const destinationDirectory = await chooseDirectory();
  if (!destinationDirectory) return { cancelled: true };
  assertCurrent();
  const response = await request(`${origin}/__desktop/backup-export`, {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(10 * 60_000),
    headers: { ...headers, "X-Bizovix-Control-Capability": controlCapability, "Content-Type": "application/json" },
    body: JSON.stringify({ destinationDirectory }),
  });
  if (!response.ok) {
    await response.body?.cancel();
    return { error: response.status === 401 || response.status === 403
      ? "Your sign-in changed. Sign in and export again."
      : "The export could not be verified. Check folder access and free space, then retry. Existing data was preserved." };
  }
  const body = await response.json() as { success?: boolean; data?: BackupExportResult };
  if (body.success !== true || !body.data || typeof body.data.directory !== "string") throw new Error("DESKTOP_EXPORT_RESPONSE_INVALID");
  return body.data;
}
