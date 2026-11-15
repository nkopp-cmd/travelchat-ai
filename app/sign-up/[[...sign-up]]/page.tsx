import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpForm } from "@/components/auth/auth-forms";
import { isGoogleSignInEnabled } from "@/lib/auth/server";
import { authCopy } from "@/lib/auth/auth-copy";

export const dynamic = "force-dynamic";

// Auth pages are not search results (indexing diagnosis F6).
export const metadata: Metadata = { robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ redirect_url?: string | string[] }> };

export default async function SignUpPage({ searchParams }: Props) {
    const redirect = (await searchParams).redirect_url;
    const copy = authCopy("sign-up", Array.isArray(redirect) ? redirect[0] : redirect);
    return (
        <AuthShell title={copy.title} subtitle={copy.subtitle}>
            <Suspense>
                <SignUpForm googleEnabled={isGoogleSignInEnabled()} />
            </Suspense>
        </AuthShell>
    );
}
