import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/auth-forms";
import { isGoogleSignInEnabled } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

// Auth pages are not search results (indexing diagnosis F6).
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function SignInPage() {
    return (
        <AuthShell title="Welcome Back" subtitle="Sign in to continue your local adventures">
            <Suspense>
                <SignInForm googleEnabled={isGoogleSignInEnabled()} />
            </Suspense>
        </AuthShell>
    );
}
