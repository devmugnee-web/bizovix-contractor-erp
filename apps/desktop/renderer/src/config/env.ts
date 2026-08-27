function resolveApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;

  if (typeof window !== "undefined") {
    const { hostname } = window.location;
    const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";
    // Accessed from another device via the host's LAN IP (or a hostname) — a
    // baked-in "localhost" API URL would point at the wrong machine, so derive
    // the API origin from whatever host served this page instead.
    if (!isLocalHost && (!configured || configured.includes("localhost") || configured.includes("127.0.0.1"))) {
      return `http://${hostname}:4000/api/v1`;
    }
  }

  return configured ?? "http://localhost:4000/api/v1";
}

export const API_BASE_URL = resolveApiBaseUrl();
