import type { ReactNode } from "react";
import Link from "next/link";
import type { AuthBackLink } from "@/lib/auth/auth-copy";
import { Logo } from "@/components/brand/logo";
import { AppBackground } from "@/components/layout/app-background";

// Push BS1: the terms are readable from the form. A new tab keeps what the visitor already typed.
function LegalLink({ href, children }: { href: string; children: ReactNode }) {
    return <a href={href} target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-foreground">{children}</a>;
}

export function AuthShell({ title, subtitle, children, footer, back, entry, lead }: {
    title: string;
    subtitle: string;
    children: ReactNode;
    footer?: ReactNode;
    back?: AuthBackLink | null;
    /** Push CJ1: ways on for a visitor who landed on the bare form (lib/auth/auth-copy authEntryLinks). */
    entry?: readonly AuthBackLink[];
    /** Push CM1: one way on above the form for a first-time visitor (lib/auth/auth-copy authLeadLink). */
    lead?: AuthBackLink | null;
}) {
    return (
        <AppBackground ambient className="min-h-dvh" contentClassName="flex min-h-dvh items-center justify-center p-4">
            <div className="relative z-10 w-full max-w-md">
                {back && (
                    <Link href={back.href} data-testid="auth-back" className="mb-4 inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground">
                        <span aria-hidden="true">←&nbsp;</span>{back.label}
                    </Link>
                )}
                <div className="flex justify-center mb-6">
                    <Logo size="lg" showText={false} href={undefined} />
                </div>
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-foreground mb-2">{title}</h1>
                    <p className="text-muted-foreground">{subtitle}</p>
                    {lead && (
                        <Link href={lead.href} data-testid="auth-lead" className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-2 hover:text-foreground">
                            {lead.label}<span aria-hidden="true">&nbsp;→</span>
                        </Link>
                    )}
                </div>
                <div className="overflow-hidden rounded-lg bg-card/80 p-6 backdrop-blur-xl sm:p-8">
                    {children}
                </div>
                {entry && entry.length > 0 && (
                    <nav aria-label="Without an account" data-testid="auth-entry" className="mt-4 flex flex-wrap justify-center gap-x-4">
                        {entry.map((link) => (
                            <Link key={link.href} href={link.href} className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-2 hover:underline">
                                {link.label}<span aria-hidden="true">&nbsp;→</span>
                            </Link>
                        ))}
                    </nav>
                )}
                {footer ?? (
                    <p className="text-center text-sm text-muted-foreground mt-6">
                        By continuing, you agree to our <LegalLink href="/terms">Terms of Service</LegalLink> and <LegalLink href="/privacy">Privacy Policy</LegalLink>
                    </p>
                )}
            </div>
        </AppBackground>
    );
}
