import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ErrorPanel({
  title,
  description,
  onRetry,
}: {
  title: string;
  description: string;
  onRetry?: () => void;
}) {
  return (
    <div className="erp-card flex min-h-[260px] flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="rounded-full bg-[#fff2f0] p-3 text-danger">
        <TriangleAlert className="h-6 w-6" />
      </div>
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="max-w-md text-sm text-muted">{description}</p>
      </div>
      {onRetry ? (
        <Button variant="outline" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}
