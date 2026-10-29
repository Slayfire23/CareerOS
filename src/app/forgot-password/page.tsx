import { RecoveryForm } from "@/components/recovery-form";
import { AuthShell } from "@/components/auth-shell";

export default function ForgotPasswordPage() {
  return <AuthShell><RecoveryForm mode="request" /></AuthShell>;
}
