import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/auth-forms";

export default function ResetPasswordPage() {
    return (
        <AuthShell title="Choose a new password" subtitle="Use at least 8 characters">
            <Suspense>
                <ResetPasswordForm />
            </Suspense>
        </AuthShell>
    );
}
