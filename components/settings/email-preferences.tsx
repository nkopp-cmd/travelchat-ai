"use client";

import { useState, useEffect, useRef } from "react";
import { useAppSession } from "@/providers/app-session-provider";
import { boundedFetch } from "@/lib/auth/bounded-fetch";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Loader2, Mail, Newspaper, Bell, Share2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface EmailPreferences {
    marketing: boolean;
    weekly_digest: boolean;
    product_updates: boolean;
    itinerary_shared: boolean;
}

export function EmailPreferencesSection() {
    const session = useAppSession();
    const enabled = session.status === "ready" && !!session.accountKey && !!session.sessionId && !!session.ownerId;
    const key = JSON.stringify([session.provider, session.status, session.accountKey, session.sessionId, session.ownerId]);
    const scopeRef = useRef({ key, request: null as AbortController | null });
    if (scopeRef.current.key !== key) scopeRef.current = { key, request: null };
    const scope = scopeRef.current;
    const [state, setState] = useState({ scope, preferences: null as EmailPreferences | null,
        updating: null as string | null, loading: false, error: "", saved: false });
    const displayed = state.scope === scope ? state : { scope, preferences: null, updating: null, loading: false, error: "", saved: false };
    const { preferences, updating } = displayed;
    const { toast } = useToast();

    const request = async (change?: { key: keyof EmailPreferences; value: boolean }) => {
        if (!enabled || scopeRef.current !== scope || scope.request || (change && !preferences)) return;
        const controller = new AbortController();
        scope.request = controller;
        const current = () => scopeRef.current === scope && scope.request === controller && !controller.signal.aborted;
        setState({ scope, preferences, updating: change?.key ?? null, loading: !change, error: "", saved: false });
        try {
            const response = await boundedFetch("/api/user/email-preferences", {
                method: change ? "PUT" : "GET", cache: "no-store", signal: controller.signal,
                headers: { "Content-Type": "application/json", "x-localley-session-id": session.sessionId! },
                ...(change ? { body: JSON.stringify({ preferences: { [change.key]: change.value } }) } : {}),
            });
            if (!current()) return;
            if (!response.ok) throw new Error("Could not confirm email preferences. Refresh your account or retry.");
            const data = await response.json();
            if (!current()) return;
            if (!data?.preferences || ["marketing", "weekly_digest", "product_updates", "itinerary_shared"]
                .some(field => typeof data.preferences[field] !== "boolean") || (change && data.success !== true)) {
                throw new Error("Invalid email preferences response. Retry to check the current settings.");
            }
            setState({ scope, preferences: data.preferences, updating: null, loading: false, error: "", saved: !!change });
            if (change) toast({ title: "Preference updated", description: "Your email preferences have been saved." });
        } catch (error) {
            if (!current()) return;
            setState({ scope, preferences: null, updating: null, loading: false, saved: false,
                error: change ? "The update could not be confirmed. It may have saved. Retry to read current preferences before changing them."
                    : error instanceof Error ? error.message : "Could not load email preferences." });
        } finally {
            if (current()) scope.request = null;
        }
    };

    useEffect(() => {
        if (enabled) void request();
        return () => { scope.request?.abort(); scope.request = null; };
        // Scope contains the account and session used by every request.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scope]);

    const updatePreference = (key: keyof EmailPreferences, value: boolean) => request({ key, value });
    if (!enabled) return <p role="status">Sign in with a complete account to manage email preferences.</p>;
    if (displayed.loading || (!preferences && !displayed.error)) {
        return (
            <div className="flex items-center justify-center gap-2 py-8" role="status">
                <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-muted-foreground" />
                Loading email preferences...
            </div>
        );
    }
    if (!preferences) return <div role="alert" className="space-y-3"><p>{displayed.error}</p>
        <Button variant="outline" className="border-foreground" onClick={() => void request()}>Retry email preferences</Button></div>;

    return (
        <div className="space-y-6 [&_[data-slot=switch-thumb]]:border [&_[data-slot=switch-thumb]]:border-foreground">
            {displayed.saved && <p role="status">Email preferences saved.</p>}
            {/* Marketing Emails */}
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                    <Mail className="h-5 w-5 text-violet-500 mt-0.5" />
                    <div className="space-y-0.5">
                        <Label htmlFor="marketing" className="text-base">Marketing Emails</Label>
                        <p className="text-sm text-muted-foreground">
                            Receive tips, travel inspiration, and special offers
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {updating === "marketing" && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    <Switch
                        id="marketing"
                        className="h-11 w-14 justify-start border-foreground px-1 [&_[data-slot=switch-thumb]]:size-5 [&_[data-state=checked]]:translate-x-6"
                        checked={preferences.marketing}
                        onCheckedChange={(checked) => updatePreference("marketing", checked)}
                        disabled={updating !== null}
                    />
                </div>
            </div>

            <Separator />

            {/* Weekly Digest */}
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                    <Newspaper className="h-5 w-5 text-indigo-500 mt-0.5" />
                    <div className="space-y-0.5">
                        <Label htmlFor="weekly_digest" className="text-base">Weekly Digest</Label>
                        <p className="text-sm text-muted-foreground">
                            Get a weekly roundup of trending spots and your activity
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {updating === "weekly_digest" && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    <Switch
                        id="weekly_digest"
                        className="h-11 w-14 justify-start border-foreground px-1 [&_[data-slot=switch-thumb]]:size-5 [&_[data-state=checked]]:translate-x-6"
                        checked={preferences.weekly_digest}
                        onCheckedChange={(checked) => updatePreference("weekly_digest", checked)}
                        disabled={updating !== null}
                    />
                </div>
            </div>

            <Separator />

            {/* Product Updates */}
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                    <Bell className="h-5 w-5 text-emerald-500 mt-0.5" />
                    <div className="space-y-0.5">
                        <Label htmlFor="product_updates" className="text-base">Product Updates</Label>
                        <p className="text-sm text-muted-foreground">
                            Get notified about new features and improvements
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {updating === "product_updates" && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    <Switch
                        id="product_updates"
                        className="h-11 w-14 justify-start border-foreground px-1 [&_[data-slot=switch-thumb]]:size-5 [&_[data-state=checked]]:translate-x-6"
                        checked={preferences.product_updates}
                        onCheckedChange={(checked) => updatePreference("product_updates", checked)}
                        disabled={updating !== null}
                    />
                </div>
            </div>

            <Separator />

            {/* Itinerary Shared */}
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                    <Share2 className="h-5 w-5 text-rose-500 mt-0.5" />
                    <div className="space-y-0.5">
                        <Label htmlFor="itinerary_shared" className="text-base">Shared Itinerary Alerts</Label>
                        <p className="text-sm text-muted-foreground">
                            Get notified when someone shares an itinerary with you
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {updating === "itinerary_shared" && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    <Switch
                        id="itinerary_shared"
                        className="h-11 w-14 justify-start border-foreground px-1 [&_[data-slot=switch-thumb]]:size-5 [&_[data-state=checked]]:translate-x-6"
                        checked={preferences.itinerary_shared}
                        onCheckedChange={(checked) => updatePreference("itinerary_shared", checked)}
                        disabled={updating !== null}
                    />
                </div>
            </div>

            <p className="text-xs text-muted-foreground pt-2">
                You can unsubscribe from any email by clicking the link at the bottom of the email.
            </p>
        </div>
    );
}
