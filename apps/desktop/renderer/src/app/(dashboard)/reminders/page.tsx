import { Suspense } from "react";
import { RemindersWorkspace } from "@/components/reminders/RemindersWorkspace";
export default function RemindersPage() {
  return (
    <Suspense fallback={null}>
      <RemindersWorkspace />
    </Suspense>
  );
}
