import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

export default function SettingsPage() {
    return (
        <div className="max-w-4xl mx-auto p-4 space-y-6">
            <div className="space-y-2">
                <h1 className="text-3xl font-bold">Settings</h1>
                <p className="text-muted-foreground">
                    Manage your account preferences and app settings
                </p>
            </div>

            {/* Preferences */}
            <Card>
                <CardHeader>
                    <CardTitle>Preferences</CardTitle>
                    <CardDescription>Customize your Localley experience</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label htmlFor="notifications">Push Notifications</Label>
                            <p className="text-sm text-muted-foreground">
                                Receive updates about new spots and itineraries
                            </p>
                        </div>
                        <Switch id="notifications" />
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label htmlFor="email-updates">Email Updates</Label>
                            <p className="text-sm text-muted-foreground">
                                Get weekly digest of trending spots
                            </p>
                        </div>
                        <Switch id="email-updates" />
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label htmlFor="location">Auto-detect Location</Label>
                            <p className="text-sm text-muted-foreground">
                                Automatically show spots near you
                            </p>
                        </div>
                        <Switch id="location" defaultChecked />
                    </div>
                </CardContent>
            </Card>

            {/* Display */}
            <Card>
                <CardHeader>
                    <CardTitle>Display</CardTitle>
                    <CardDescription>Adjust how content is displayed</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="language">Language</Label>
                        <Select defaultValue="en">
                            <SelectTrigger id="language">
                                <SelectValue placeholder="Select language" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="en">English</SelectItem>
                                <SelectItem value="ja">日本語 (Japanese)</SelectItem>
                                <SelectItem value="ko">한국어 (Korean)</SelectItem>
                                <SelectItem value="zh">中文 (Chinese)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="theme">Theme</Label>
                        <Select defaultValue="system">
                            <SelectTrigger id="theme">
                                <SelectValue placeholder="Select theme" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="light">Light</SelectItem>
                                <SelectItem value="dark">Dark</SelectItem>
                                <SelectItem value="system">System</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {/* Privacy */}
            <Card>
                <CardHeader>
                    <CardTitle>Privacy & Data</CardTitle>
                    <CardDescription>Control your data and privacy settings</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label htmlFor="analytics">Usage Analytics</Label>
                            <p className="text-sm text-muted-foreground">
                                Help us improve by sharing anonymous usage data
                            </p>
                        </div>
                        <Switch id="analytics" defaultChecked />
                    </div>

                    <Separator />

                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label htmlFor="personalization">Personalized Recommendations</Label>
                            <p className="text-sm text-muted-foreground">
                                Get spot suggestions based on your preferences
                            </p>
                        </div>
                        <Switch id="personalization" defaultChecked />
                    </div>
                </CardContent>
            </Card>

            {/* Account */}
            <Card>
                <CardHeader>
                    <CardTitle>Account</CardTitle>
                    <CardDescription>Manage your account settings</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="email">Email Address</Label>
                        <Input id="email" type="email" placeholder="your@email.com" disabled />
                        <p className="text-xs text-muted-foreground">
                            Managed by your authentication provider
                        </p>
                    </div>

                    <Separator />

                    <div className="space-y-2">
                        <Label>Danger Zone</Label>
                        <div className="flex gap-2">
                            <Button variant="outline" className="text-destructive hover:bg-destructive/10">
                                Clear All Data
                            </Button>
                            <Button variant="destructive">
                                Delete Account
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Save Button */}
            <div className="flex justify-end gap-2">
                <Button variant="outline">Cancel</Button>
                <Button className="bg-violet-600 hover:bg-violet-700">
                    Save Changes
                </Button>
            </div>
        </div>
    );
}
