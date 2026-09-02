"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, ShieldAlert, ArrowRight, Database } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { MasterDataReadinessResult } from "@/types/domain";

interface MasterDataReadinessGuardProps {
  readiness: MasterDataReadinessResult;
  compact?: boolean;
  blockPosting?: boolean;
}

export function MasterDataReadinessGuard({
  readiness,
  compact = false,
  blockPosting = true,
}: MasterDataReadinessGuardProps) {
  if (readiness.isReadyForTransactions && compact) {
    return null;
  }

  const missingCritical = readiness.checks.filter((c) => !c.isReady && c.requiredForPosting);

  if (compact) {
    return (
      <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-900 dark:text-amber-100">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3 sm:items-center">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 sm:mt-0" />
            <div>
              <p className="font-semibold text-sm">
                Master Data Setup Incomplete ({readiness.passedChecks}/{readiness.totalChecks} Ready)
              </p>
              <p className="text-xs text-muted-foreground">
                {readiness.criticalMissingCount > 0
                  ? `${readiness.criticalMissingCount} critical setup item(s) missing. Posting new transactions is restricted until setup is complete.`
                  : "Some recommended setup items are missing."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {missingCritical.map((c) => (
              <Button key={c.id} variant="outline" size="sm" asChild className="h-8 text-xs">
                <Link href={c.actionRoute || "/app/dashboard"}>
                  {c.actionLabel || "Fix Setup"}
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card className="border-amber-500/30 bg-gradient-to-br from-amber-500/5 via-background to-background">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-500/15 p-2 text-amber-600 dark:text-amber-400">
              <Database className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2 text-lg font-bold">
                Master Data Setup Readiness Gating
                <Badge tone={readiness.isReadyForTransactions ? "green" : "red"}>
                  {readiness.passedChecks} / {readiness.totalChecks} Checks Passed
                </Badge>
              </CardTitle>
              <CardDescription>
                {readiness.isReadyForTransactions
                  ? "All critical master data dependencies exist. Transaction posting is enabled."
                  : "Transaction posting is gated until essential master data dependencies exist per Business OS rules."}
              </CardDescription>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {readiness.checks.map((check) => (
            <div
              key={check.id}
              className={`flex items-start justify-between rounded-lg border p-3 ${
                check.isReady
                  ? "border-emerald-500/20 bg-emerald-500/5"
                  : check.requiredForPosting
                  ? "border-destructive/30 bg-destructive/5"
                  : "border-amber-500/20 bg-amber-500/5"
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {check.isReady ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : check.requiredForPosting ? (
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  )}
                  <span className="font-medium text-sm">{check.title}</span>
                </div>
                <p className="text-xs text-muted-foreground">{check.description}</p>
                <p className="font-mono text-[11px] text-muted-foreground">{check.details}</p>
              </div>

              {!check.isReady && check.actionRoute && (
                <Button variant="ghost" size="sm" asChild className="ml-2 h-7 px-2 text-xs">
                  <Link href={check.actionRoute}>
                    {check.actionLabel || "Configure"}
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
              )}
            </div>
          ))}
        </div>

        {!readiness.isReadyForTransactions && blockPosting && (
          <div className="rounded-lg bg-destructive/10 p-3 text-destructive text-xs font-medium flex items-center justify-between">
            <span>
              🔒 **Posting Blocked**: Complete the required critical setup items listed above before creating transactions.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
