import { AuthShell } from "@/features/auth/auth-shell";
import { SignupForm } from "@/features/auth/signup-form";

export default function SignupPage() {
  return (
    <AuthShell eyebrow="Workspace Onboarding" title="Create a believable ERP account flow instead of a dead placeholder screen.">
      <SignupForm />
    </AuthShell>
  );
}
