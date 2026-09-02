"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { domAnimation, LazyMotion } from "framer-motion";
import { useState } from "react";
import { Toaster } from "sonner";

import { ApiError } from "@/services/api-client";

// The desktop build runs the API as a local child process. It can be briefly
// unreachable right after launch or a restart (a few seconds), which used to
// surface as a hard "data could not be loaded" error after ~1s. A confirmed
// 401 means the refresh flow already ran and failed, so retrying it again
// wastes time instead of helping; anything else (network blips, a restarting
// local service, timeouts) is worth riding out with a longer backoff.
function shouldRetryQuery(failureCount: number, error: unknown) {
  if (error instanceof ApiError && error.status === 401) {
    return false;
  }

  return failureCount < 3;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: shouldRetryQuery,
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <LazyMotion features={domAnimation} strict>
        {children}
        <Toaster
          position="top-right"
          richColors
          toastOptions={{
            className: "border border-border bg-panel text-foreground",
          }}
        />
      </LazyMotion>
    </QueryClientProvider>
  );
}
