"use client";

import { useState } from "react";
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
import { Mail, Loader2, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface EmailDialogProps {
    itineraryId: string;
    itineraryTitle: string;
}

export function EmailDialog({ itineraryId, itineraryTitle }: EmailDialogProps) {
    const [open, setOpen] = useState(false);
    const [email, setEmail] = useState("");
    const [name, setName] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isSent, setIsSent] = useState(false);
    const { toast } = useToast();

    const handleSend = async () => {
        if (!email) {
            toast({
                title: "Email required",
                description: "Please enter an email address",
                variant: "destructive",
            });
            return;
        }

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            toast({
                title: "Invalid email",
                description: "Please enter a valid email address",
                variant: "destructive",
            });
            return;
        }

        setIsLoading(true);
        try {
            const response = await fetch(`/api/itineraries/${itineraryId}/email`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    recipientEmail: email,
                    recipientName: name || undefined,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to send email");
            }

            setIsSent(true);
            toast({
                title: "Email sent!",
                description: `Itinerary sent to ${email}`,
            });

            // Reset after 2 seconds
            setTimeout(() => {
                setOpen(false);
                setIsSent(false);
                setEmail("");
                setName("");
            }, 2000);
        } catch (error) {
            console.error("Email error:", error);
            toast({
                title: "Failed to send",
                description: error instanceof Error ? error.message : "Please try again",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                    <Mail className="h-4 w-4" />
                    Email
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Email Itinerary</DialogTitle>
                    <DialogDescription>
                        Send "{itineraryTitle}" to your inbox or share with a friend.
                    </DialogDescription>
                </DialogHeader>

                {isSent ? (
                    <div className="flex flex-col items-center justify-center py-8">
                        <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
                        <p className="text-lg font-medium">Email sent!</p>
                        <p className="text-sm text-muted-foreground">
                            Check your inbox for the itinerary
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="email">Email address *</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="explorer@email.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    disabled={isLoading}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="name">Recipient name (optional)</Label>
                                <Input
                                    id="name"
                                    type="text"
                                    placeholder="Fellow Explorer"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    disabled={isLoading}
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => setOpen(false)}
                                disabled={isLoading}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSend}
                                disabled={isLoading || !email}
                                className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Sending...
                                    </>
                                ) : (
                                    <>
                                        <Mail className="mr-2 h-4 w-4" />
                                        Send Email
                                    </>
                                )}
                            </Button>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
