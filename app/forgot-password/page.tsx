import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/auth-forms";

export default function ForgotPasswordPage() {
    return (
        <AuthShell title="Set a password" subtitle="We email you a link to set a new password">
            <ForgotPasswordForm />
        </AuthShell>
    );
}
