import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/auth-forms";
import { redirect } from "next/navigation";
import { auth, isGoogleSignInEnabled } from "@/lib/auth/server";
import { safeRedirect } from "@/lib/auth/redirect";
import { authBackLink, authCopy, authEntryLinks } from "@/lib/auth/auth-copy";
import { KeptTripLine } from "@/components/auth/kept-trip-line";
import { GENERATED_PREVIEW_PATH } from "@/lib/trips/generated-preview";

export const dynamic = "force-dynamic";

// Auth pages are not search results (indexing diagnosis F6).
// Push BS3: the tab names the form.
export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<{ redirect_url?: string | string[] }> };

export default async function SignInPage({ searchParams }: Props) {
    const param = (await searchParams).redirect_url;
    const target = Array.isArray(param) ? param[0] : param;
    // A visitor who is already signed in (an account link from an email, an old tab) goes straight on. The 307 is
    // never stored by the edge HTML cache (200 only), and auth() reads the real session, so /dashboard agrees.
    if ((await auth()).userId) redirect(safeRedirect(target));
    const copy = authCopy("sign-in", target);
    return (
        <AuthShell title={copy.title} subtitle={copy.subtitle} back={authBackLink(target)} entry={authEntryLinks(target)}>
            {target?.split(/[?#]/)[0] === GENERATED_PREVIEW_PATH && <KeptTripLine />}
            <Suspense>
                <SignInForm googleEnabled={isGoogleSignInEnabled()} />
            </Suspense>
        </AuthShell>
    );
}
