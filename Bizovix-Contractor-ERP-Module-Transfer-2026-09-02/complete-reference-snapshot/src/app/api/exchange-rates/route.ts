import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

type OpenExchangeRateResponse = {
  result?: string;
  base_code?: string;
  rates?: Record<string, number>;
  time_last_update_utc?: string;
  error_type?: string;
};

export async function GET(request: NextRequest) {
  const base = (request.nextUrl.searchParams.get("base") ?? "USD").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(base)) {
    return NextResponse.json({ message: "A valid three-letter base currency code is required" }, { status: 400 });
  }

  try {
    // Not `next: { revalidate }` — Next persists that fetch cache to disk
    // under the running server's own install directory, which the packaged
    // desktop app cannot write to on a per-machine Windows install (same
    // read-only-install-dir class of failure as the Prisma cache bug fixed in
    // desktop/main.cjs). A one-hour-old exchange rate is not worth trading
    // for a cache write that silently fails on some customers' machines.
    const response = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Exchange-rate provider returned ${response.status}`);

    const payload = await response.json() as OpenExchangeRateResponse;
    if (payload.result !== "success" || !payload.rates) {
      throw new Error(payload.error_type || "Exchange-rate provider returned an invalid response");
    }

    const providerUpdatedAt = payload.time_last_update_utc ? new Date(payload.time_last_update_utc) : new Date();
    return NextResponse.json({
      base: payload.base_code ?? base,
      rates: payload.rates,
      updatedAt: Number.isNaN(providerUpdatedAt.getTime()) ? new Date().toISOString() : providerUpdatedAt.toISOString(),
      provider: "ExchangeRate-API",
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Could not load live exchange rates" },
      { status: 502 },
    );
  }
}
