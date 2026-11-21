"use client";

import Link from "next/link";
import { useEffect, useState, type ComponentProps, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/auth-client";
import { safeRedirect } from "@/lib/auth/client";
import { verifiedCallbackURL } from "@/lib/auth/redirect";
import { useInAppBrowser } from "@/lib/in-app-browser";

const primaryClass = "w-full";
const secondaryClass = "w-full bg-raised text-foreground hover:bg-raised";

/** `path` with the return page as redirect_url; the default /dashboard return adds nothing. */
export function withReturn(path: string, redirectTo: string): string {
    const to = safeRedirect(redirectTo);
    return to === "/dashboard" ? path : `${path}${path.includes("?") ? "&" : "?"}redirect_url=${encodeURIComponent(to)}`;
}

// Push BT1: phones hide what was typed; a mistyped password lost the sign-up. One tap shows it.
// The name changes ("Show password" / "Hide password"), as in the GOV.UK pattern, so no aria-pressed.
type PasswordInputProps = Omit<ComponentProps<typeof Input>, "type">;
export function PasswordInput({ className, ...props }: PasswordInputProps) {
    const [shown, setShown] = useState(false);
    return (
        <div className="relative">
            <Input {...props} type={shown ? "text" : "password"} className={`pr-16 ${className ?? ""}`} />
            <button type="button" data-password-toggle aria-controls={props.id} aria-label={shown ? "Hide password" : "Show password"} onClick={() => setShown((value) => !value)}
                className="absolute inset-y-0 right-0 flex min-h-11 min-w-11 items-center justify-center px-3 text-sm font-medium text-primary">
                {shown ? "Hide" : "Show"}
            </button>
        </div>
    );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
    return (
        <div className="space-y-2">
            <Label htmlFor={id} className="text-muted-foreground">{label}</Label>
            {children}
        </div>
    );
}

function Notice({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
    const cls = tone === "error"
        ? " bg-red-500/10 text-red-200"
        : " bg-[rgb(var(--ll-success)/0.12)] text-foreground";
    return <div role={tone === "error" ? "alert" : "status"} className={`rounded-md px-3 py-2 text-sm ${cls}`}>{children}</div>;
}

function Divider() {
    return (
        <div className="flex items-center justify-center py-2 text-xs text-muted-foreground">
            <span>or</span>
        </div>
    );
}

function GoogleButton({ callbackURL }: { callbackURL: string }) {
    const [busy, setBusy] = useState(false);
    return (
        <Button type="button" variant="outline" className={secondaryClass} disabled={busy}
            onClick={async () => {
                setBusy(true);
                await authClient.signIn.social({ provider: "google", callbackURL, errorCallbackURL: withReturn("/sign-in?error=google", callbackURL) });
                setBusy(false);
            }}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Continue with Google
        </Button>
    );
}

// Push BN1: Google blocks OAuth inside social-app WebViews, so show the email path there instead of a dead button.
export function GoogleOption({ enabled, callbackURL }: { enabled: boolean; callbackURL: string }) {
    const inApp = useInAppBrowser();
    if (!enabled) return null;
    if (inApp) return <p data-testid="auth-inapp-hint" className="rounded-md bg-raised px-3 py-2 text-sm text-foreground">Google sign-in does not work in this app&apos;s browser. Use your email below, or open this page in Safari or Chrome.</p>;
    return <><GoogleButton callbackURL={callbackURL} /><Divider /></>;
}

// ?error=google (first param wins; Better Auth may append its own code) -> Google wording; any other error -> the link wording.
function signInErrorText(code: string | null): string | null {
    if (!code) return null;
    return code === "google" ? "Google sign-in did not finish. Please try again, or use your email below." : "That link is invalid or expired. Please try again.";
}

const errorText = (message?: string | null) => message || "Something went wrong. Please try again.";

export const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Shown after an email sign-up (and after a sign-in with an unverified email): our auth mail
 * can land in Spam, so name the sender, offer a resend with the same callbackURL (the verify
 * link must still return to the page that sent the visitor here) and a way to fix a typo.
 */
export function VerifyEmailHelp({ email, callbackURL, onChangeEmail }: { email: string; callbackURL: string; onChangeEmail?: () => void }) {
    const [busy, setBusy] = useState(false);
    // A mail was sent right before this shows (sign-up, or the sign-in resend), so start with the cool-down.
    const [wait, setWait] = useState(RESEND_COOLDOWN_SECONDS);
    const [status, setStatus] = useState<{ tone: "error" | "success"; text: string } | null>(null);

    useEffect(() => {
        if (wait <= 0) return;
        const timer = setTimeout(() => setWait((value) => value - 1), 1000);
        return () => clearTimeout(timer);
    }, [wait]);

    async function resend() {
        setBusy(true); setStatus(null);
        const { error: failure } = await authClient.sendVerificationEmail({ email, callbackURL: verifiedCallbackURL(callbackURL) });
        setBusy(false);
        if (failure) { setStatus({ tone: "error", text: errorText(failure.message) }); return; }
        setStatus({ tone: "success", text: `We sent a new link to ${email}.` });
        setWait(RESEND_COOLDOWN_SECONDS);
    }

    return (
        <div className="space-y-3 text-sm text-muted-foreground">
            <p>The mail comes from <span className="text-foreground">hello@localley.io</span>. Not there after a minute? Check Spam or Promotions.</p>
            {status ? <Notice tone={status.tone}>{status.text}</Notice> : null}
            <Button type="button" variant="outline" className={secondaryClass} disabled={busy || wait > 0} onClick={resend}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {wait > 0 ? `Resend link (${wait} s)` : "Resend link"}
            </Button>
            {onChangeEmail ? (
                <button type="button" onClick={onChangeEmail} className="block w-full min-h-11 text-center text-primary hover:text-primary">
                    Use another email
                </button>
            ) : null}
        </div>
    );
}

export function SignInForm({ googleEnabled }: { googleEnabled: boolean }) {
    const params = useSearchParams();
    const redirectTo = safeRedirect(params.get("redirect_url"));
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState<"password" | "link" | null>(null);
    const [error, setError] = useState<string | null>(signInErrorText(params.get("error")));
    const [info, setInfo] = useState<string | null>(null);
    const [unverified, setUnverified] = useState(false);

    async function onPassword(event: FormEvent) {
        event.preventDefault();
        setBusy("password"); setError(null); setInfo(null); setUnverified(false);
        const { error: failure } = await authClient.signIn.email({ email, password, callbackURL: redirectTo });
        if (failure) {
            setBusy(null);
            setUnverified(failure.code === "EMAIL_NOT_VERIFIED");
            setError(failure.code === "EMAIL_NOT_VERIFIED"
                ? "Please confirm your email first. We sent you a new link."
                : failure.status === 401 ? "Wrong email or password. No password yet? Use the email link below." : errorText(failure.message));
            return;
        }
        // Better Auth's default plugin follows the callbackURL once. A second
        // navigation here can cancel the new document while it hydrates.
    }

    async function onMagicLink() {
        if (!email) { setError("Enter your email first."); return; }
        setBusy("link"); setError(null); setInfo(null);
        const { error: failure } = await authClient.signIn.magicLink({ email, callbackURL: redirectTo, errorCallbackURL: withReturn("/sign-in?error=link", redirectTo) });
        setBusy(null);
        if (failure) { setError(errorText(failure.message)); return; }
        setInfo("Check your inbox. We sent you a sign-in link.");
    }

    return (
        <div className="space-y-5">
            {error ? <Notice tone="error">{error}</Notice> : null}
            {info ? <Notice tone="success">{info}</Notice> : null}
            {unverified && email ? <VerifyEmailHelp email={email} callbackURL={redirectTo} /> : null}
            <GoogleOption enabled={googleEnabled} callbackURL={redirectTo} />
            <form onSubmit={onPassword} className="space-y-4">
                <Field id="email" label="Email">
                    <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
                <Field id="password" label="Password">
                    <PasswordInput id="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </Field>
                <div className="flex justify-end">
                    <Link href={withReturn("/forgot-password", redirectTo)} className="text-sm text-primary hover:text-primary">Forgot password?</Link>
                </div>
                <Button type="submit" className={primaryClass} disabled={busy !== null || !password}>
                    {busy === "password" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Sign in
                </Button>
            </form>
            <Divider />
            <Button type="button" variant="outline" className={secondaryClass} disabled={busy !== null} onClick={onMagicLink}>
                {busy === "link" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Email me a sign-in link
            </Button>
            <p className="text-center text-sm text-muted-foreground">
                No account? <Link href={withReturn("/sign-up", redirectTo)} className="text-primary hover:text-primary">Sign up</Link>
            </p>
        </div>
    );
}

export function SignUpForm({ googleEnabled }: { googleEnabled: boolean }) {
    const params = useSearchParams();
    const redirectTo = safeRedirect(params.get("redirect_url"));
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Push BT3: the "account exists" error carries one-tap links to sign-in and reset, with the same return page.
    const [exists, setExists] = useState(false);
    const [done, setDone] = useState(false);
    const inApp = useInAppBrowser();

    async function onSubmit(event: FormEvent) {
        event.preventDefault();
        setBusy(true); setError(null); setExists(false);
        const [firstName, ...rest] = name.trim().split(/\s+/);
        const { error: failure } = await authClient.signUp.email({
            name: name.trim() || email.split("@")[0],
            email,
            password,
            firstName: firstName || undefined,
            lastName: rest.join(" ") || undefined,
            // Through the Worker route, so an expired link on a static page still reaches sign-in.
            callbackURL: verifiedCallbackURL(redirectTo),
        });
        setBusy(false);
        if (failure) {
            if (failure.code === "USER_ALREADY_EXISTS" || failure.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") setExists(true);
            else setError(errorText(failure.message));
            return;
        }
        setDone(true);
    }

    if (done) {
        return (
            <div className="space-y-4">
                <Notice tone="success">Check your inbox. We sent a link to <strong>{email}</strong>. Open it to confirm your email, then you are signed in.</Notice>
                {/* Push BO2: in a social-app WebView the link opens the phone's browser, not this one. */}
                {inApp ? <p data-testid="auth-inapp-verify-note" className="rounded-md bg-raised px-3 py-2 text-sm text-foreground">The link opens in your phone&apos;s browser. Then come back to this app and sign in with your password.</p> : null}
                <VerifyEmailHelp email={email} callbackURL={redirectTo} onChangeEmail={() => { setDone(false); setPassword(""); }} />
            </div>
        );
    }
    return (
        <div className="space-y-5">
            {error ? <Notice tone="error">{error}</Notice> : null}
            {exists ? (
                <Notice tone="error">
                    An account with this email exists.{" "}
                    <Link data-exists-sign-in href={withReturn("/sign-in", redirectTo)} className="font-medium text-primary underline underline-offset-2">Sign in</Link>
                    {" "}or{" "}
                    <Link data-exists-forgot href={withReturn("/forgot-password", redirectTo)} className="font-medium text-primary underline underline-offset-2">reset your password</Link>.
                </Notice>
            ) : null}
            <GoogleOption enabled={googleEnabled} callbackURL={redirectTo} />
            <form onSubmit={onSubmit} className="space-y-4">
                <Field id="email" label="Email">
                    <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
                <Field id="password" label="Password (8+ characters)">
                    <PasswordInput id="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
                </Field>
                {/* Optional and last (Push BC1): an empty name falls back to the email prefix. */}
                <Field id="name" label="Name (optional)">
                    <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
                <Button type="submit" className={primaryClass} disabled={busy}>
                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Create account
                </Button>
            </form>
            <p className="text-center text-sm text-muted-foreground">
                Have an account? <Link href={withReturn("/sign-in", redirectTo)} className="text-primary hover:text-primary">Sign in</Link>
            </p>
        </div>
    );
}

export function ForgotPasswordForm({ redirectTo = "/dashboard" }: { redirectTo?: string }) {
    const [email, setEmail] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);

    async function onSubmit(event: FormEvent) {
        event.preventDefault();
        setBusy(true); setError(null);
        const { error: failure } = await authClient.requestPasswordReset({ email, redirectTo: withReturn("/reset-password", redirectTo) });
        setBusy(false);
        if (failure) { setError(errorText(failure.message)); return; }
        setDone(true);
    }

    if (done) return <Notice tone="success">If an account exists for this email, we sent a link to set a new password.</Notice>;
    return (
        <form onSubmit={onSubmit} className="space-y-4">
            {error ? <Notice tone="error">{error}</Notice> : null}
            <Field id="email" label="Email">
                <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Button type="submit" className={primaryClass} disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Send reset link
            </Button>
            <p className="text-center text-sm text-muted-foreground"><Link href={withReturn("/sign-in", redirectTo)} className="text-primary hover:text-primary">Back to sign in</Link></p>
        </form>
    );
}

export function ResetPasswordForm() {
    const params = useSearchParams();
    const token = params.get("token");
    const redirectTo = safeRedirect(params.get("redirect_url"));
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(params.get("error") || !token ? "This reset link is invalid or expired. Request a new one." : null);
    const [done, setDone] = useState(false);

    async function onSubmit(event: FormEvent) {
        event.preventDefault();
        if (!token) return;
        setBusy(true); setError(null);
        const { error: failure } = await authClient.resetPassword({ newPassword: password, token });
        setBusy(false);
        if (failure) { setError(errorText(failure.message)); return; }
        setDone(true);
    }

    if (done) {
        return (
            <div className="space-y-4">
                <Notice tone="success">Your password is set.</Notice>
                <Button asChild className={primaryClass}><Link href={withReturn("/sign-in", redirectTo)}>Sign in</Link></Button>
            </div>
        );
    }
    return (
        <form onSubmit={onSubmit} className="space-y-4">
            {error ? <Notice tone="error">{error}</Notice> : null}
            <Field id="password" label="New password (8+ characters)">
                <PasswordInput id="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} disabled={!token} />
            </Field>
            <Button type="submit" className={primaryClass} disabled={busy || !token}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Set password
            </Button>
            <p className="text-center text-sm text-muted-foreground"><Link href={withReturn("/forgot-password", redirectTo)} className="text-primary hover:text-primary">Request a new link</Link></p>
        </form>
    );
}
