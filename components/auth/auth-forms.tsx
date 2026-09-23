"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient, safeRedirect } from "@/lib/auth/client";

const inputClass = "bg-white/10 border-white/20 text-white placeholder:text-gray-500";
const primaryClass = "w-full bg-violet-600 hover:bg-violet-700 text-white";
const secondaryClass = "w-full bg-white/10 border border-white/20 text-white hover:bg-white/20";

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
    return (
        <div className="space-y-2">
            <Label htmlFor={id} className="text-gray-300">{label}</Label>
            {children}
        </div>
    );
}

function Notice({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
    const cls = tone === "error"
        ? "border-red-500/40 bg-red-500/10 text-red-200"
        : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
    return <div role={tone === "error" ? "alert" : "status"} className={`rounded-md border px-3 py-2 text-sm ${cls}`}>{children}</div>;
}

function Divider() {
    return (
        <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="h-px flex-1 bg-white/20" />or<span className="h-px flex-1 bg-white/20" />
        </div>
    );
}

function GoogleButton({ callbackURL }: { callbackURL: string }) {
    const [busy, setBusy] = useState(false);
    return (
        <Button type="button" variant="outline" className={secondaryClass} disabled={busy}
            onClick={async () => {
                setBusy(true);
                await authClient.signIn.social({ provider: "google", callbackURL, errorCallbackURL: "/sign-in?error=google" });
                setBusy(false);
            }}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Continue with Google
        </Button>
    );
}

const errorText = (message?: string | null) => message || "Something went wrong. Please try again.";

export function SignInForm({ googleEnabled }: { googleEnabled: boolean }) {
    const params = useSearchParams();
    const redirectTo = safeRedirect(params.get("redirect_url"));
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState<"password" | "link" | null>(null);
    const [error, setError] = useState<string | null>(params.get("error") ? "That link is invalid or expired. Please try again." : null);
    const [info, setInfo] = useState<string | null>(null);

    async function onPassword(event: FormEvent) {
        event.preventDefault();
        setBusy("password"); setError(null); setInfo(null);
        const { error: failure } = await authClient.signIn.email({ email, password, callbackURL: redirectTo });
        setBusy(null);
        if (failure) {
            setError(failure.code === "EMAIL_NOT_VERIFIED"
                ? "Please confirm your email first. We sent you a new link."
                : failure.status === 401 ? "Wrong email or password. No password yet? Use the email link below." : errorText(failure.message));
            return;
        }
        window.location.assign(redirectTo);
    }

    async function onMagicLink() {
        if (!email) { setError("Enter your email first."); return; }
        setBusy("link"); setError(null); setInfo(null);
        const { error: failure } = await authClient.signIn.magicLink({ email, callbackURL: redirectTo, errorCallbackURL: "/sign-in?error=link" });
        setBusy(null);
        if (failure) { setError(errorText(failure.message)); return; }
        setInfo("Check your inbox. We sent you a sign-in link.");
    }

    return (
        <div className="space-y-5">
            {error ? <Notice tone="error">{error}</Notice> : null}
            {info ? <Notice tone="success">{info}</Notice> : null}
            {googleEnabled ? <><GoogleButton callbackURL={redirectTo} /><Divider /></> : null}
            <form onSubmit={onPassword} className="space-y-4">
                <Field id="email" label="Email">
                    <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
                </Field>
                <Field id="password" label="Password">
                    <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
                </Field>
                <div className="flex justify-end">
                    <Link href="/forgot-password" className="text-sm text-violet-400 hover:text-violet-300">Forgot password?</Link>
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
            <p className="text-center text-sm text-gray-400">
                No account? <Link href={`/sign-up${redirectTo !== "/dashboard" ? `?redirect_url=${encodeURIComponent(redirectTo)}` : ""}`} className="text-violet-400 hover:text-violet-300">Sign up</Link>
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
    const [done, setDone] = useState(false);

    async function onSubmit(event: FormEvent) {
        event.preventDefault();
        setBusy(true); setError(null);
        const [firstName, ...rest] = name.trim().split(/\s+/);
        const { error: failure } = await authClient.signUp.email({
            name: name.trim() || email.split("@")[0],
            email,
            password,
            firstName: firstName || undefined,
            lastName: rest.join(" ") || undefined,
            callbackURL: redirectTo,
        });
        setBusy(false);
        if (failure) {
            setError(failure.code === "USER_ALREADY_EXISTS" || failure.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
                ? "An account with this email exists. Sign in, or use Forgot password."
                : errorText(failure.message));
            return;
        }
        setDone(true);
    }

    if (done) {
        return <Notice tone="success">Check your inbox. Confirm your email with the link we sent, then you are signed in.</Notice>;
    }
    return (
        <div className="space-y-5">
            {error ? <Notice tone="error">{error}</Notice> : null}
            {googleEnabled ? <><GoogleButton callbackURL={redirectTo} /><Divider /></> : null}
            <form onSubmit={onSubmit} className="space-y-4">
                <Field id="name" label="Name">
                    <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
                </Field>
                <Field id="email" label="Email">
                    <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
                </Field>
                <Field id="password" label="Password (8+ characters)">
                    <Input id="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
                </Field>
                <Button type="submit" className={primaryClass} disabled={busy}>
                    {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Create account
                </Button>
            </form>
            <p className="text-center text-sm text-gray-400">
                Have an account? <Link href="/sign-in" className="text-violet-400 hover:text-violet-300">Sign in</Link>
            </p>
        </div>
    );
}

export function ForgotPasswordForm() {
    const [email, setEmail] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);

    async function onSubmit(event: FormEvent) {
        event.preventDefault();
        setBusy(true); setError(null);
        const { error: failure } = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
        setBusy(false);
        if (failure) { setError(errorText(failure.message)); return; }
        setDone(true);
    }

    if (done) return <Notice tone="success">If an account exists for this email, we sent a link to set a new password.</Notice>;
    return (
        <form onSubmit={onSubmit} className="space-y-4">
            {error ? <Notice tone="error">{error}</Notice> : null}
            <Field id="email" label="Email">
                <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
            </Field>
            <Button type="submit" className={primaryClass} disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Send reset link
            </Button>
            <p className="text-center text-sm text-gray-400"><Link href="/sign-in" className="text-violet-400 hover:text-violet-300">Back to sign in</Link></p>
        </form>
    );
}

export function ResetPasswordForm() {
    const params = useSearchParams();
    const token = params.get("token");
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
                <Button asChild className={primaryClass}><Link href="/sign-in">Sign in</Link></Button>
            </div>
        );
    }
    return (
        <form onSubmit={onSubmit} className="space-y-4">
            {error ? <Notice tone="error">{error}</Notice> : null}
            <Field id="password" label="New password (8+ characters)">
                <Input id="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} disabled={!token} />
            </Field>
            <Button type="submit" className={primaryClass} disabled={busy || !token}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Set password
            </Button>
            <p className="text-center text-sm text-gray-400"><Link href="/forgot-password" className="text-violet-400 hover:text-violet-300">Request a new link</Link></p>
        </form>
    );
}
