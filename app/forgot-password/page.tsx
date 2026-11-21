import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/auth-forms";
import { safeRedirect } from "@/lib/auth/redirect";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ redirect_url?: string | string[] }> }) {
    const raw = (await searchParams).redirect_url;
    return (
        <AuthShell title="Set a password" subtitle="We email you a link to set a new password">
            <ForgotPasswordForm redirectTo={safeRedirect(typeof raw === "string" ? raw : null)} />
        </AuthShell>
    );
}
