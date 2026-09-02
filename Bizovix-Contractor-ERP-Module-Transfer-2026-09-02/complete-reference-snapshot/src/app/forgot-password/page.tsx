import { AuthShell } from "@/features/auth/auth-shell";
import { ForgotPasswordForm } from "@/features/auth/forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <AuthShell eyebrow="Recovery Flow" title="Keep the recovery journey functional, fast, and demo-friendly.">
      <ForgotPasswordForm />
    </AuthShell>
  );
}
