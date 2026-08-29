const readyUrl = process.env.BIZOVIX_API_READY_URL ?? "http://127.0.0.1:4000/api/v1/auth/me";
const timeoutMs = Number(process.env.BIZOVIX_API_READY_TIMEOUT_MS ?? 120_000);
const pollIntervalMs = 750;
const expectedStatuses = new Set([200, 401, 403]);

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const startedAt = Date.now();

process.stdout.write(`[renderer] Waiting for ERP API at ${readyUrl}\n`);

while (Date.now() - startedAt < timeoutMs) {
  try {
    const response = await fetch(readyUrl, { signal: AbortSignal.timeout(1_500) });
    if (expectedStatuses.has(response.status)) {
      process.stdout.write(`[renderer] ERP API is ready (${response.status}). Starting Next.js.\n`);
      process.exit(0);
    }
  } catch {
    // The API process may still be compiling or starting.
  }

  await delay(pollIntervalMs);
}

process.stderr.write(`[renderer] ERP API was not ready after ${Math.round(timeoutMs / 1000)} seconds.\n`);
process.exit(1);
