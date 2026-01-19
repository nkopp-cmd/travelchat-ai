"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Settings, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface EditProfileDialogProps {
    initialBio?: string;
    initialDisplayName?: string;
}

export function EditProfileDialog({ initialBio = "", initialDisplayName = "" }: EditProfileDialogProps) {
    const { user, isLoaded } = useUser();
    const { toast } = useToast();
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [bio, setBio] = useState(initialBio);

    // Initialize form when dialog opens
    const handleOpenChange = (isOpen: boolean) => {
        if (isOpen && user) {
            setFirstName(user.firstName || "");
            setLastName(user.lastName || "");
            setBio(initialBio || (user.unsafeMetadata?.bio as string) || "");
        }
        setOpen(isOpen);
    };

    const handleSave = async () => {
        if (!user) return;

        setLoading(true);
        try {
            // Update Clerk user profile
            await user.update({
                firstName,
                lastName,
                unsafeMetadata: {
                    ...user.unsafeMetadata,
                    bio,
                },
            });

            toast({
                title: "Profile updated",
                description: "Your changes have been saved successfully.",
            });

            setOpen(false);
        } catch (error) {
            console.error("Error updating profile:", error);
            toast({
                title: "Update failed",
                description: "Could not update your profile. Please try again.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    if (!isLoaded) {
        return null;
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <Settings className="mr-2 h-4 w-4" />
                    <span className="hidden sm:inline">Edit Profile</span>
                    <span className="sm:hidden">Edit</span>
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Edit Profile</DialogTitle>
                    <DialogDescription>
                        Update your profile information visible to other users.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="firstName">First Name</Label>
                            <Input
                                id="firstName"
                                value={firstName}
                                onChange={(e) => setFirstName(e.target.value)}
                                placeholder="First name"
                                disabled={loading}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="lastName">Last Name</Label>
                            <Input
                                id="lastName"
                                value={lastName}
                                onChange={(e) => setLastName(e.target.value)}
                                placeholder="Last name"
                                disabled={loading}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="bio">Bio</Label>
                        <Textarea
                            id="bio"
                            value={bio}
                            onChange={(e) => setBio(e.target.value)}
                            placeholder="Tell us about yourself and your travel style..."
                            className="resize-none"
                            rows={3}
                            maxLength={200}
                            disabled={loading}
                        />
                        <p className="text-xs text-muted-foreground text-right">
                            {bio.length}/200
                        </p>
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button
                        variant="outline"
                        onClick={() => setOpen(false)}
                        disabled={loading}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={loading}
                        className="bg-violet-600 hover:bg-violet-700"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            "Save Changes"
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
