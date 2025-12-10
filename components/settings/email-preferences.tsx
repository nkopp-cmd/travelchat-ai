"use client";

import { useState, useEffect } from "react";
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

const defaultPreferences: EmailPreferences = {
    marketing: true,
    weekly_digest: true,
    product_updates: true,
    itinerary_shared: true,
};

export function EmailPreferencesSection() {
    const [preferences, setPreferences] = useState<EmailPreferences>(defaultPreferences);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState<string | null>(null);
    const { toast } = useToast();

    useEffect(() => {
        fetchPreferences();
    }, []);

    const fetchPreferences = async () => {
        try {
            const response = await fetch("/api/user/email-preferences");
            if (response.ok) {
                const data = await response.json();
                setPreferences(data.preferences);
            }
        } catch (error) {
            console.error("Error fetching preferences:", error);
        } finally {
            setLoading(false);
        }
    };

    const updatePreference = async (key: keyof EmailPreferences, value: boolean) => {
        setUpdating(key);
        const previousValue = preferences[key];

        // Optimistic update
        setPreferences((prev) => ({ ...prev, [key]: value }));

        try {
            const response = await fetch("/api/user/email-preferences", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    preferences: { [key]: value },
                }),
            });

            if (!response.ok) {
                throw new Error("Failed to update");
            }

            toast({
                title: "Preference updated",
                description: "Your email preferences have been saved.",
            });
        } catch (error) {
            // Revert on error
            setPreferences((prev) => ({ ...prev, [key]: previousValue }));
            toast({
                title: "Error",
                description: "Failed to update preferences. Please try again.",
                variant: "destructive",
            });
        } finally {
            setUpdating(null);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Marketing Emails */}
            <div className="flex items-center justify-between">
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
                        checked={preferences.marketing}
                        onCheckedChange={(checked) => updatePreference("marketing", checked)}
                        disabled={updating !== null}
                    />
                </div>
            </div>

            <Separator />

            {/* Weekly Digest */}
            <div className="flex items-center justify-between">
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
                        checked={preferences.weekly_digest}
                        onCheckedChange={(checked) => updatePreference("weekly_digest", checked)}
                        disabled={updating !== null}
                    />
                </div>
            </div>

            <Separator />

            {/* Product Updates */}
            <div className="flex items-center justify-between">
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
                        checked={preferences.product_updates}
                        onCheckedChange={(checked) => updatePreference("product_updates", checked)}
                        disabled={updating !== null}
                    />
                </div>
            </div>

            <Separator />

            {/* Itinerary Shared */}
            <div className="flex items-center justify-between">
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
