import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/auth-forms";
import { isGoogleSignInEnabled } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default function SignInPage() {
    return (
        <AuthShell title="Welcome Back" subtitle="Sign in to continue your local adventures">
            <Suspense>
                <SignInForm googleEnabled={isGoogleSignInEnabled()} />
            </Suspense>
        </AuthShell>
    );
}
