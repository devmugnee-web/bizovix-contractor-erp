"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Building2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorPanel } from "@/components/shared/error-panel";
import { LoadingPanel } from "@/components/shared/loading-panel";
import { useSessionHydration } from "@/hooks/use-session-hydration";
import { listWorkspaces } from "@/services/workspace.service";
import { resetDemoData } from "@/services/demo.service";
import { useSessionStore } from "@/stores/session-store";

export function DemoWorkspaceScreen() {
  const router = useRouter();
  const hasHydrated = useSessionHydration();
  const demoSession = useSessionStore((state) => state.demoSession);
  const setWorkspace = useSessionStore((state) => state.setWorkspace);
  const query = useQuery({
    queryKey: ["demo", "workspaces"],
    queryFn: () => listWorkspaces("demo"),
  });

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    if (!demoSession) {
      router.replace("/demo/dashboard");
    }
  }, [demoSession, hasHydrated, router]);

  if (!hasHydrated || !demoSession || query.isLoading) {
    return <LoadingPanel lines={4} />;
  }

  if (query.error || !query.data) {
    return (
      <ErrorPanel
        title="Demo workspaces unavailable"
        description="The isolated demo environments could not be loaded."
        onRetry={() => query.refetch()}
      />
    );
  }

  return (
    <div className="min-h-screen bg-canvas px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Demo Mode</div>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight">Choose a workspace demo</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Each workspace runs with isolated mock data, keyboard shortcuts, reset controls, and safe simulated writes.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={async () => {
              await resetDemoData();
              toast.success("Demo data reset");
            }}
          >
            <RotateCcw className="h-4 w-4" />
            Reset Demo Data
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {query.data.map((workspace) => (
            <Card key={workspace.id} className="transition-transform hover:-translate-y-0.5">
              <CardHeader>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>{workspace.name}</CardTitle>
                  <CardDescription>{workspace.industry}</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-muted">Open period: {workspace.openPeriod}</div>
                <Button
                  className="w-full"
                  onClick={() => {
                    setWorkspace("demo", workspace.id);
                    router.push("/demo/dashboard");
                  }}
                >
                  Launch Workspace
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
