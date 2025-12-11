"use client";

import { useState } from "react";
import { Bell, BellOff, Loader2, Smartphone, Mail, Trophy, Star, Users, Target, Calendar } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useNotificationPreferences } from "@/hooks/use-notifications";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

export function NotificationPreferencesSection() {
    const { toast } = useToast();
    const {
        preferences,
        isLoading: prefsLoading,
        updatePreferences,
    } = useNotificationPreferences();

    const {
        isSupported,
        isSubscribed,
        isLoading: pushLoading,
        permission,
        subscribe,
        unsubscribe,
    } = usePushNotifications();

    const [isSaving, setIsSaving] = useState(false);

    const handleToggle = async (key: string, value: boolean) => {
        if (!preferences) return;

        setIsSaving(true);
        try {
            await updatePreferences({ [key]: value });
            toast({
                title: "Preferences updated",
                description: "Your notification preferences have been saved.",
            });
        } catch {
            toast({
                title: "Error",
                description: "Failed to update preferences. Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handlePushToggle = async () => {
        if (isSubscribed) {
            const success = await unsubscribe();
            if (success) {
                toast({
                    title: "Push notifications disabled",
                    description: "You won't receive push notifications anymore.",
                });
            }
        } else {
            const success = await subscribe();
            if (success) {
                toast({
                    title: "Push notifications enabled",
                    description: "You'll now receive push notifications for important updates.",
                });
            } else if (permission === "denied") {
                toast({
                    title: "Permission denied",
                    description: "Please enable notifications in your browser settings.",
                    variant: "destructive",
                });
            }
        }
    };

    if (prefsLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-8 w-48" />
                <div className="space-y-4">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="flex items-center justify-between">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-6 w-10" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Push Notification Toggle */}
            <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/50">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-violet-100 dark:bg-violet-900/30">
                        {isSubscribed ? (
                            <Bell className="h-5 w-5 text-violet-600" />
                        ) : (
                            <BellOff className="h-5 w-5 text-muted-foreground" />
                        )}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <Label className="font-medium">Push Notifications</Label>
                            {isSubscribed && (
                                <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">
                                    Enabled
                                </Badge>
                            )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                            {isSupported
                                ? isSubscribed
                                    ? "You'll receive notifications even when the app is closed"
                                    : "Enable to receive notifications when you're not using the app"
                                : "Push notifications are not supported in this browser"}
                        </p>
                    </div>
                </div>
                <Button
                    variant={isSubscribed ? "outline" : "default"}
                    size="sm"
                    onClick={handlePushToggle}
                    disabled={!isSupported || pushLoading}
                    className={isSubscribed ? "" : "bg-violet-600 hover:bg-violet-700"}
                >
                    {pushLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : isSubscribed ? (
                        "Disable"
                    ) : (
                        "Enable"
                    )}
                </Button>
            </div>

            <Separator />

            {/* Notification Categories */}
            <div className="space-y-4">
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Notification Types
                </h4>

                {/* Achievements & Progress */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Trophy className="h-4 w-4 text-amber-500" />
                        <div>
                            <Label htmlFor="achievements">Achievements & Level Ups</Label>
                            <p className="text-xs text-muted-foreground">
                                When you unlock achievements or level up
                            </p>
                        </div>
                    </div>
                    <Switch
                        id="achievements"
                        checked={preferences?.achievements ?? true}
                        onCheckedChange={(checked) => handleToggle("achievements", checked)}
                        disabled={isSaving}
                    />
                </div>

                {/* New Spots */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Star className="h-4 w-4 text-violet-500" />
                        <div>
                            <Label htmlFor="newSpots">New Spots</Label>
                            <p className="text-xs text-muted-foreground">
                                When new hidden gems are discovered in your saved areas
                            </p>
                        </div>
                    </div>
                    <Switch
                        id="newSpots"
                        checked={preferences?.newSpots ?? true}
                        onCheckedChange={(checked) => handleToggle("newSpots", checked)}
                        disabled={isSaving}
                    />
                </div>

                {/* Social */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Users className="h-4 w-4 text-indigo-500" />
                        <div>
                            <Label htmlFor="social">Social Activity</Label>
                            <p className="text-xs text-muted-foreground">
                                Friend requests, likes, and when someone finds your review helpful
                            </p>
                        </div>
                    </div>
                    <Switch
                        id="social"
                        checked={preferences?.social ?? true}
                        onCheckedChange={(checked) => handleToggle("social", checked)}
                        disabled={isSaving}
                    />
                </div>

                {/* Challenges */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Target className="h-4 w-4 text-orange-500" />
                        <div>
                            <Label htmlFor="challenges">Challenges</Label>
                            <p className="text-xs text-muted-foreground">
                                New challenges available and reminders when challenges are ending
                            </p>
                        </div>
                    </div>
                    <Switch
                        id="challenges"
                        checked={preferences?.challenges ?? true}
                        onCheckedChange={(checked) => handleToggle("challenges", checked)}
                        disabled={isSaving}
                    />
                </div>

                {/* Weekly Digest */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Calendar className="h-4 w-4 text-cyan-500" />
                        <div>
                            <Label htmlFor="weeklyDigest">Weekly Recap</Label>
                            <p className="text-xs text-muted-foreground">
                                Summary of your activity and discoveries each week
                            </p>
                        </div>
                    </div>
                    <Switch
                        id="weeklyDigest"
                        checked={preferences?.weeklyDigest ?? true}
                        onCheckedChange={(checked) => handleToggle("weeklyDigest", checked)}
                        disabled={isSaving}
                    />
                </div>
            </div>

            <Separator />

            {/* Delivery Methods */}
            <div className="space-y-4">
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    Delivery Methods
                </h4>

                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Smartphone className="h-4 w-4 text-green-500" />
                        <div>
                            <Label htmlFor="pushEnabled">In-App & Push</Label>
                            <p className="text-xs text-muted-foreground">
                                Show notifications in the app and as push notifications
                            </p>
                        </div>
                    </div>
                    <Switch
                        id="pushEnabled"
                        checked={preferences?.pushEnabled ?? true}
                        onCheckedChange={(checked) => handleToggle("pushEnabled", checked)}
                        disabled={isSaving}
                    />
                </div>

                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Mail className="h-4 w-4 text-blue-500" />
                        <div>
                            <Label htmlFor="emailEnabled">Email Notifications</Label>
                            <p className="text-xs text-muted-foreground">
                                Also send important notifications via email
                            </p>
                        </div>
                    </div>
                    <Switch
                        id="emailEnabled"
                        checked={preferences?.emailEnabled ?? true}
                        onCheckedChange={(checked) => handleToggle("emailEnabled", checked)}
                        disabled={isSaving}
                    />
                </div>
            </div>
        </div>
    );
}
