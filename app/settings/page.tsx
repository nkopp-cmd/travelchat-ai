"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle, GlassCardDescription } from "@/components/ui/glass-card";
import { BentoGrid, BentoItem } from "@/components/ui/bento-grid";
import {
    Bell,
    Mail,
    MapPin,
    Palette,
    Globe,
    Shield,
    Sparkles,
    User,
    AlertTriangle,
    Trash2,
    Settings,
} from "lucide-react";

export default function SettingsPage() {
    return (
        <div className="min-h-screen">
            {/* Animated gradient background */}
            <div className="fixed inset-0 -z-10 overflow-hidden">
                <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-radial from-violet-500/15 to-transparent rounded-full blur-3xl animate-blob" />
                <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-gradient-radial from-indigo-500/15 to-transparent rounded-full blur-3xl animate-blob animation-delay-2000" />
                <div className="absolute -bottom-1/2 left-1/4 w-full h-full bg-gradient-radial from-purple-500/15 to-transparent rounded-full blur-3xl animate-blob animation-delay-4000" />
            </div>

            <div className="max-w-5xl mx-auto p-4 space-y-6 animate-in fade-in duration-500">
                {/* Header */}
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
                            <Settings className="h-6 w-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold bg-gradient-to-r from-violet-500 to-indigo-500 bg-clip-text text-transparent">
                                Settings
                            </h1>
                            <p className="text-muted-foreground">
                                Manage your account preferences and app settings
                            </p>
                        </div>
                    </div>
                </div>

                {/* Bento Grid Layout for Settings */}
                <BentoGrid columns={2}>
                    {/* Notifications - Large Card */}
                    <BentoItem colSpan={1} rowSpan={2}>
                        <GlassCard variant="gradient" hover={false} className="h-full">
                            <GlassCardHeader className="pb-4">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg">
                                        <Bell className="h-5 w-5 text-white" />
                                    </div>
                                    <div>
                                        <GlassCardTitle>Notifications</GlassCardTitle>
                                        <GlassCardDescription>Stay updated with alerts</GlassCardDescription>
                                    </div>
                                </div>
                            </GlassCardHeader>
                            <GlassCardContent className="space-y-6">
                                <SettingRow
                                    icon={Bell}
                                    iconColor="text-amber-500"
                                    title="Push Notifications"
                                    description="Receive updates about new spots and itineraries"
                                />
                                <SettingRow
                                    icon={Mail}
                                    iconColor="text-blue-500"
                                    title="Email Updates"
                                    description="Get weekly digest of trending spots"
                                />
                                <SettingRow
                                    icon={MapPin}
                                    iconColor="text-emerald-500"
                                    title="Auto-detect Location"
                                    description="Automatically show spots near you"
                                    defaultChecked
                                />
                            </GlassCardContent>
                        </GlassCard>
                    </BentoItem>

                    {/* Display Settings */}
                    <BentoItem>
                        <GlassCard variant="gradient" hover={false} className="h-full">
                            <GlassCardHeader className="pb-4">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
                                        <Palette className="h-5 w-5 text-white" />
                                    </div>
                                    <div>
                                        <GlassCardTitle>Display</GlassCardTitle>
                                        <GlassCardDescription>Customize appearance</GlassCardDescription>
                                    </div>
                                </div>
                            </GlassCardHeader>
                            <GlassCardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="theme" className="text-sm">Theme</Label>
                                    <Select defaultValue="system">
                                        <SelectTrigger id="theme" className="bg-white/5 border-white/20 focus:border-violet-500/50">
                                            <SelectValue placeholder="Select theme" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="light">Light</SelectItem>
                                            <SelectItem value="dark">Dark</SelectItem>
                                            <SelectItem value="system">System</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </GlassCardContent>
                        </GlassCard>
                    </BentoItem>

                    {/* Language */}
                    <BentoItem>
                        <GlassCard variant="gradient" hover={false} className="h-full">
                            <GlassCardHeader className="pb-4">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg">
                                        <Globe className="h-5 w-5 text-white" />
                                    </div>
                                    <div>
                                        <GlassCardTitle>Language</GlassCardTitle>
                                        <GlassCardDescription>Choose your language</GlassCardDescription>
                                    </div>
                                </div>
                            </GlassCardHeader>
                            <GlassCardContent>
                                <Select defaultValue="en">
                                    <SelectTrigger id="language" className="bg-white/5 border-white/20 focus:border-violet-500/50">
                                        <SelectValue placeholder="Select language" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="en">English</SelectItem>
                                        <SelectItem value="ja">日本語 (Japanese)</SelectItem>
                                        <SelectItem value="ko">한국어 (Korean)</SelectItem>
                                        <SelectItem value="zh">中文 (Chinese)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </GlassCardContent>
                        </GlassCard>
                    </BentoItem>

                    {/* Privacy & Data */}
                    <BentoItem colSpan={2}>
                        <GlassCard variant="gradient" hover={false} className="h-full">
                            <GlassCardHeader className="pb-4">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
                                        <Shield className="h-5 w-5 text-white" />
                                    </div>
                                    <div>
                                        <GlassCardTitle>Privacy & Data</GlassCardTitle>
                                        <GlassCardDescription>Control your data and privacy settings</GlassCardDescription>
                                    </div>
                                </div>
                            </GlassCardHeader>
                            <GlassCardContent>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <SettingRow
                                        icon={Shield}
                                        iconColor="text-emerald-500"
                                        title="Usage Analytics"
                                        description="Help us improve by sharing anonymous usage data"
                                        defaultChecked
                                    />
                                    <SettingRow
                                        icon={Sparkles}
                                        iconColor="text-violet-500"
                                        title="Personalized Recommendations"
                                        description="Get spot suggestions based on your preferences"
                                        defaultChecked
                                    />
                                </div>
                            </GlassCardContent>
                        </GlassCard>
                    </BentoItem>

                    {/* Account Settings */}
                    <BentoItem colSpan={2}>
                        <GlassCard variant="gradient" hover={false} className="h-full">
                            <GlassCardHeader className="pb-4">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
                                        <User className="h-5 w-5 text-white" />
                                    </div>
                                    <div>
                                        <GlassCardTitle>Account</GlassCardTitle>
                                        <GlassCardDescription>Manage your account settings</GlassCardDescription>
                                    </div>
                                </div>
                            </GlassCardHeader>
                            <GlassCardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="email" className="text-sm">Email Address</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="your@email.com"
                                        disabled
                                        className="bg-white/5 border-white/20"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Managed by your authentication provider
                                    </p>
                                </div>
                            </GlassCardContent>
                        </GlassCard>
                    </BentoItem>

                    {/* Danger Zone */}
                    <BentoItem colSpan={2}>
                        <GlassCard
                            hover={false}
                            className="h-full border-red-500/30 bg-red-500/5"
                        >
                            <GlassCardHeader className="pb-4">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-lg shadow-red-500/25">
                                        <AlertTriangle className="h-5 w-5 text-white" />
                                    </div>
                                    <div>
                                        <GlassCardTitle className="text-red-400">Danger Zone</GlassCardTitle>
                                        <GlassCardDescription>Irreversible actions</GlassCardDescription>
                                    </div>
                                </div>
                            </GlassCardHeader>
                            <GlassCardContent>
                                <div className="flex flex-wrap gap-3">
                                    <Button
                                        variant="outline"
                                        className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                                    >
                                        <Trash2 className="mr-2 h-4 w-4" />
                                        Clear All Data
                                    </Button>
                                    <Button
                                        className="bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white shadow-lg shadow-red-500/25"
                                    >
                                        <AlertTriangle className="mr-2 h-4 w-4" />
                                        Delete Account
                                    </Button>
                                </div>
                            </GlassCardContent>
                        </GlassCard>
                    </BentoItem>
                </BentoGrid>

                {/* Save Button */}
                <div className="flex justify-end gap-3 pt-4">
                    <Button
                        variant="outline"
                        className="bg-white/5 border-white/20 hover:bg-white/10"
                    >
                        Cancel
                    </Button>
                    <Button className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 shadow-lg shadow-violet-500/25">
                        Save Changes
                    </Button>
                </div>
            </div>
        </div>
    );
}

// Setting Row Component
function SettingRow({
    icon: Icon,
    iconColor,
    title,
    description,
    defaultChecked = false,
}: {
    icon: React.ElementType;
    iconColor: string;
    title: string;
    description: string;
    defaultChecked?: boolean;
}) {
    return (
        <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors">
            <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center">
                    <Icon className={`h-4 w-4 ${iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                    <Label className="text-sm font-medium block">{title}</Label>
                    <p className="text-xs text-muted-foreground truncate">
                        {description}
                    </p>
                </div>
            </div>
            <Switch defaultChecked={defaultChecked} className="data-[state=checked]:bg-violet-600" />
        </div>
    );
}
