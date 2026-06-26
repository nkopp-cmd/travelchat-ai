"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
    ArrowLeft,
    Loader2,
    MapPin,
    DollarSign,
    Users,
    TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { AppBackground } from "@/components/layout/app-background";
import { CityImageAvatar } from "@/components/ui/city-image";

const SPECIALTIES = [
    "Food & Dining",
    "Culture & History",
    "Nightlife",
    "Nature & Outdoors",
    "Shopping",
    "Architecture",
    "Art & Museums",
    "Local Hidden Gems",
];

const CITIES = ["Seoul", "Tokyo", "Bangkok", "Singapore"];

export default function GuideApplyPage() {
    const [bio, setBio] = useState("");
    const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>([]);
    const [selectedCities, setSelectedCities] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const router = useRouter();
    const { toast } = useToast();

    const toggleSpecialty = (s: string) => {
        setSelectedSpecialties((prev) =>
            prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
        );
    };

    const toggleCity = (c: string) => {
        setSelectedCities((prev) =>
            prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
        );
    };

    const handleSubmit = async () => {
        if (!bio.trim() || selectedCities.length === 0) {
            toast({ title: "Please fill in all required fields", variant: "destructive" });
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await fetch("/api/connect/onboard", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    bio,
                    specialties: selectedSpecialties,
                    cities: selectedCities.map((c) => c.toLowerCase()),
                }),
            });

            const data = await res.json();

            if (data.url) {
                // Redirect to Stripe onboarding
                window.location.href = data.url;
            } else if (data.status === "pending") {
                toast({ title: "Application submitted! We'll review it shortly." });
                router.push("/guide/dashboard");
            } else {
                toast({ title: data.message || "Application submitted", variant: "default" });
            }
        } catch {
            toast({ title: "Failed to submit application", variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <AppBackground ambient className="min-h-screen">
        <div className="container max-w-4xl mx-auto py-8 px-4">
            <Link
                href="/"
                className="inline-flex items-center text-sm text-white/65 hover:text-white mb-6"
            >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
            </Link>

            <div className="mb-8 rounded-lg border border-white/10 bg-white/[0.08] p-6 shadow-2xl shadow-violet-950/30 backdrop-blur-xl sm:p-8">
                <Badge className="mb-4 border-violet-300/30 bg-violet-400/15 text-violet-100 hover:bg-violet-400/20">
                    Creator program
                </Badge>
                <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">Become a Local Guide</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65 sm:text-base">
                    Share city knowledge, build paid guide content, and help travelers follow routes that feel local from the first day.
                </p>
            </div>

            {/* Benefits */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                <Card className="liquid-panel border-white/10">
                    <CardContent className="pt-6 flex items-start gap-3">
                        <DollarSign className="h-5 w-5 text-green-500 mt-0.5" />
                        <div>
                            <p className="font-medium">Earn Revenue Share</p>
                            <p className="text-sm text-muted-foreground">
                                Get 20% of subscription revenue from users who engage with your content
                            </p>
                        </div>
                    </CardContent>
                </Card>
                <Card className="liquid-panel border-white/10">
                    <CardContent className="pt-6 flex items-start gap-3">
                        <Users className="h-5 w-5 text-blue-500 mt-0.5" />
                        <div>
                            <p className="font-medium">Grow Your Audience</p>
                            <p className="text-sm text-muted-foreground">
                                Your itineraries and spots reach travelers worldwide
                            </p>
                        </div>
                    </CardContent>
                </Card>
                <Card className="liquid-panel border-white/10">
                    <CardContent className="pt-6 flex items-start gap-3">
                        <TrendingUp className="h-5 w-5 text-purple-500 mt-0.5" />
                        <div>
                            <p className="font-medium">Monthly Payouts</p>
                            <p className="text-sm text-muted-foreground">
                                Automatic monthly transfers via Stripe ($10 minimum)
                            </p>
                        </div>
                    </CardContent>
                </Card>
                <Card className="liquid-panel border-white/10">
                    <CardContent className="pt-6 flex items-start gap-3">
                        <MapPin className="h-5 w-5 text-red-500 mt-0.5" />
                        <div>
                            <p className="font-medium">Local Expert Badge</p>
                            <p className="text-sm text-muted-foreground">
                                Stand out with a verified local guide badge on your profile
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Application Form */}
            <Card className="liquid-panel border-white/10">
                <CardHeader>
                    <CardTitle>Guide Application</CardTitle>
                    <CardDescription>
                        Tell us about yourself and your local expertise
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="bio">About You *</Label>
                        <Textarea
                            id="bio"
                            placeholder="Tell travelers why you're the best guide for your city. What unique experiences can you share?"
                            value={bio}
                            onChange={(e) => setBio(e.target.value)}
                            rows={4}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Your Cities *</Label>
                        <p className="text-sm text-muted-foreground">Select the cities you know best</p>
                        <div className="flex flex-wrap gap-2">
                            {CITIES.map((city) => (
                                <button
                                    key={city}
                                    type="button"
                                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                                        selectedCities.includes(city)
                                            ? "border-violet-300/60 bg-violet-500 text-white shadow-lg shadow-violet-500/20"
                                            : "border-white/10 bg-white/5 text-white/75 hover:border-violet-300/40 hover:bg-violet-500/10"
                                    }`}
                                    onClick={() => toggleCity(city)}
                                >
                                    <CityImageAvatar city={city} className="h-5 w-5 rounded-full" sizes="20px" />
                                    {city}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Specialties</Label>
                        <p className="text-sm text-muted-foreground">What are you passionate about?</p>
                        <div className="flex flex-wrap gap-2">
                            {SPECIALTIES.map((spec) => (
                                <Badge
                                    key={spec}
                                    variant={selectedSpecialties.includes(spec) ? "default" : "outline"}
                                    className="cursor-pointer"
                                    onClick={() => toggleSpecialty(spec)}
                                >
                                    {spec}
                                </Badge>
                            ))}
                        </div>
                    </div>

                    <Button
                        onClick={handleSubmit}
                        disabled={isSubmitting || !bio.trim() || selectedCities.length === 0}
                        className="w-full"
                        size="lg"
                    >
                        {isSubmitting ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</>
                        ) : (
                            "Submit Application"
                        )}
                    </Button>
                </CardContent>
            </Card>
        </div>
        </AppBackground>
    );
}
