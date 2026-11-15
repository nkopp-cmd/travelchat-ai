import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpForm } from "@/components/auth/auth-forms";
import { isGoogleSignInEnabled } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

// Auth pages are not search results (indexing diagnosis F6).
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function SignUpPage() {
    return (
        <AuthShell title="Join Localley" subtitle="Start discovering hidden gems like a local">
            <Suspense>
                <SignUpForm googleEnabled={isGoogleSignInEnabled()} />
            </Suspense>
        </AuthShell>
    );
}
