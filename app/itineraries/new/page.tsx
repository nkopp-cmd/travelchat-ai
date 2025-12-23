"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, MapPin, DollarSign, Users, Zap, LayoutTemplate, X, AlertCircle, CheckCircle2, Gift } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getTemplateById, ItineraryTemplate } from "@/lib/templates";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";

const INTERESTS = [
    "Food & Dining",
    "Cafes & Coffee",
    "Nightlife & Bars",
    "Shopping",
    "Art & Culture",
    "Nature & Parks",
    "History",
    "Street Food",
    "Vintage & Thrift",
    "Music & Entertainment"
];

// Supported cities for validation
const SUPPORTED_CITIES = ["Seoul", "Tokyo", "Bangkok", "Singapore"];

// City validation helper
function isCitySupported(input: string): string | null {
    const normalizedInput = input.toLowerCase().trim();
    for (const city of SUPPORTED_CITIES) {
        if (city.toLowerCase() === normalizedInput || normalizedInput.includes(city.toLowerCase())) {
            return city;
        }
    }
    return null;
}

// Progress messages for generation
const PROGRESS_MESSAGES = [
    "Finding hidden gems...",
    "Discovering local favorites...",
    "Mapping the best routes...",
    "Adding insider tips...",
    "Curating your perfect trip...",
    "Almost there...",
];

function NewItineraryForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const { isSignedIn, isLoaded } = useUser();
    const [isLoading, setIsLoading] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<ItineraryTemplate | null>(null);
    const [progressMessage, setProgressMessage] = useState("");
    const [cityError, setCityError] = useState<string | null>(null);
    const [generatedItinerary, setGeneratedItinerary] = useState<{
        itinerary: unknown;
        isAnonymous: boolean;
        signupPrompt?: {
            message: string;
            benefits: string[];
            signupUrl: string;
        };
    } | null>(null);

    // Form state
    const [city, setCity] = useState("");
    const [days, setDays] = useState("3");
    const [budget, setBudget] = useState("moderate");
    const [localnessLevel, setLocalnessLevel] = useState([3]);
    const [pace, setPace] = useState<"relaxed" | "moderate" | "active">("moderate");
    const [groupType, setGroupType] = useState("solo");
    const [selectedInterests, setSelectedInterests] = useState<string[]>([]);

    // Load template from URL params on mount
    useEffect(() => {
        const templateId = searchParams.get("template");
        if (templateId) {
            const template = getTemplateById(templateId);
            if (template) {
                setSelectedTemplate(template);
                setDays(template.days.toString());
                setPace(template.pace);
                // Pre-select interests based on template focus
                const mappedInterests: string[] = [];
                template.focus.forEach(focus => {
                    const fl = focus.toLowerCase();
                    if (fl.includes("food") || fl.includes("dining") || fl.includes("restaurant")) mappedInterests.push("Food & Dining");
                    else if (fl.includes("cafe") || fl.includes("coffee")) mappedInterests.push("Cafes & Coffee");
                    else if (fl.includes("nightlife") || fl.includes("bar") || fl.includes("evening")) mappedInterests.push("Nightlife & Bars");
                    else if (fl.includes("shop") || fl.includes("market")) mappedInterests.push("Shopping");
                    else if (fl.includes("culture") || fl.includes("art") || fl.includes("museum")) mappedInterests.push("Art & Culture");
                    else if (fl.includes("nature") || fl.includes("park")) mappedInterests.push("Nature & Parks");
                    else if (fl.includes("histor")) mappedInterests.push("History");
                    else if (fl.includes("street food")) mappedInterests.push("Street Food");
                    else if (fl.includes("vintage") || fl.includes("thrift")) mappedInterests.push("Vintage & Thrift");
                    else if (fl.includes("music") || fl.includes("entertainment")) mappedInterests.push("Music & Entertainment");
                });
                setSelectedInterests([...new Set(mappedInterests)]);
            }
        }
    }, [searchParams]);

    // Progress message animation during loading
    useEffect(() => {
        if (!isLoading) {
            setProgressMessage("");
            return;
        }

        let index = 0;
        setProgressMessage(PROGRESS_MESSAGES[0]);

        const interval = setInterval(() => {
            index = (index + 1) % PROGRESS_MESSAGES.length;
            setProgressMessage(PROGRESS_MESSAGES[index]);
        }, 3000);

        return () => clearInterval(interval);
    }, [isLoading]);

    // Validate city on change
    const handleCityChange = (value: string) => {
        setCity(value);
        setCityError(null);

        if (value.trim() && !isCitySupported(value)) {
            setCityError(`We don't have spots for "${value}" yet. Try: ${SUPPORTED_CITIES.join(", ")}`);
        }
    };

    const clearTemplate = () => {
        setSelectedTemplate(null);
        router.replace("/itineraries/new");
    };

    const toggleInterest = (interest: string) => {
        setSelectedInterests(prev =>
            prev.includes(interest)
                ? prev.filter(i => i !== interest)
                : [...prev, interest]
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!city.trim()) {
            toast({
                title: "City required",
                description: "Please enter a city name",
                variant: "destructive",
            });
            return;
        }

        // Validate city before submitting
        const validCity = isCitySupported(city);
        if (!validCity) {
            toast({
                title: "City not supported yet",
                description: `We have curated spots in: ${SUPPORTED_CITIES.join(", ")}`,
                variant: "destructive",
            });
            return;
        }

        if (selectedInterests.length === 0) {
            toast({
                title: "Select interests",
                description: "Please select at least one interest",
                variant: "destructive",
            });
            return;
        }

        setIsLoading(true);
        setGeneratedItinerary(null);

        try {
            const response = await fetch("/api/itineraries/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    city: city.trim(),
                    days: parseInt(days),
                    interests: selectedInterests,
                    budget,
                    localnessLevel: localnessLevel[0],
                    pace,
                    groupType,
                    templatePrompt: selectedTemplate?.prompt,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                // Handle specific error types
                if (data.error === "signup_required") {
                    toast({
                        title: "Sign up to continue",
                        description: data.message,
                    });
                    router.push("/sign-up?redirect=/itineraries/new");
                    return;
                }

                if (data.error === "unsupported_city") {
                    setCityError(data.suggestion);
                    throw new Error(data.message);
                }

                if (data.error === "limit_exceeded") {
                    toast({
                        title: "Limit reached",
                        description: data.message,
                    });
                    if (data.upgrade) {
                        router.push("/pricing");
                    }
                    return;
                }

                throw new Error(data.error || data.message || "Failed to generate itinerary");
            }

            // Handle anonymous user - show itinerary with signup prompt
            if (data.isAnonymous) {
                setGeneratedItinerary(data);
                toast({
                    title: "Itinerary created!",
                    description: "Sign up to save it and create more",
                });
            } else {
                // Authenticated user - redirect to saved itinerary
                toast({
                    title: "Itinerary created!",
                    description: `${data.itinerary.title} is ready to explore`,
                });

                if (data.itinerary.id) {
                    router.push(`/itineraries/${data.itinerary.id}`);
                } else {
                    router.push('/itineraries');
                }
            }
        } catch (error) {
            toast({
                title: "Generation failed",
                description: error instanceof Error ? error.message : "Please try again",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    // Show generated itinerary for anonymous users
    if (generatedItinerary) {
        const itinerary = generatedItinerary.itinerary as {
            title: string;
            subtitle?: string;
            city: string;
            days: number;
            highlights?: string[];
            dailyPlans?: Array<{ day: number; theme: string; activities: Array<{ name: string }> }>;
        };

        return (
            <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
                {/* Success Banner */}
                <Card className="border-green-200 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30">
                    <CardContent className="p-6">
                        <div className="flex items-start gap-4">
                            <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center flex-shrink-0">
                                <CheckCircle2 className="h-6 w-6 text-green-600" />
                            </div>
                            <div className="flex-1">
                                <h2 className="text-xl font-bold text-green-800 dark:text-green-200">
                                    Your itinerary is ready!
                                </h2>
                                <p className="text-green-700 dark:text-green-300 mt-1">
                                    {itinerary.title} - {itinerary.days} days in {itinerary.city}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Itinerary Preview */}
                <Card>
                    <CardHeader>
                        <CardTitle>{itinerary.title}</CardTitle>
                        {itinerary.subtitle && (
                            <CardDescription>{itinerary.subtitle}</CardDescription>
                        )}
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {itinerary.highlights && itinerary.highlights.length > 0 && (
                            <div>
                                <h4 className="font-semibold mb-2">Highlights</h4>
                                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                                    {itinerary.highlights.map((h, i) => (
                                        <li key={i}>{h}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {itinerary.dailyPlans && (
                            <div>
                                <h4 className="font-semibold mb-2">Your Days</h4>
                                <div className="space-y-2">
                                    {itinerary.dailyPlans.slice(0, 3).map((day) => (
                                        <div key={day.day} className="p-3 rounded-lg bg-muted/50">
                                            <p className="font-medium">Day {day.day}: {day.theme}</p>
                                            <p className="text-sm text-muted-foreground">
                                                {day.activities.slice(0, 3).map(a => a.name).join(" → ")}
                                                {day.activities.length > 3 && ` + ${day.activities.length - 3} more`}
                                            </p>
                                        </div>
                                    ))}
                                    {itinerary.dailyPlans.length > 3 && (
                                        <p className="text-sm text-muted-foreground pl-3">
                                            + {itinerary.dailyPlans.length - 3} more days...
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Sign Up Prompt */}
                {generatedItinerary.signupPrompt && (
                    <Card className="border-violet-200 bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-950/30 dark:to-indigo-950/30">
                        <CardContent className="p-6">
                            <div className="flex items-start gap-4">
                                <div className="h-12 w-12 rounded-full bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center flex-shrink-0">
                                    <Gift className="h-6 w-6 text-violet-600" />
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-lg font-bold text-violet-800 dark:text-violet-200">
                                        {generatedItinerary.signupPrompt.message}
                                    </h3>
                                    <ul className="mt-3 space-y-2">
                                        {generatedItinerary.signupPrompt.benefits.map((benefit, i) => (
                                            <li key={i} className="flex items-center gap-2 text-violet-700 dark:text-violet-300">
                                                <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                                                <span>{benefit}</span>
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="flex gap-3 mt-4">
                                        <Link href="/sign-up" className="flex-1">
                                            <Button className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700">
                                                <Sparkles className="mr-2 h-4 w-4" />
                                                Sign Up Free
                                            </Button>
                                        </Link>
                                        <Button
                                            variant="outline"
                                            onClick={() => setGeneratedItinerary(null)}
                                        >
                                            Create Another
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto py-8 px-4">
            {/* Anonymous User Banner */}
            {isLoaded && !isSignedIn && (
                <Card className="mb-6 border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30">
                    <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                            <Gift className="h-5 w-5 text-amber-600 flex-shrink-0" />
                            <div className="flex-1">
                                <p className="font-medium text-amber-800 dark:text-amber-200">
                                    Try it free! Create 1 itinerary without signing up.
                                </p>
                                <p className="text-sm text-amber-700 dark:text-amber-300">
                                    <Link href="/sign-up" className="underline hover:no-underline">Sign up</Link> to save and create more.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Template Banner */}
            {selectedTemplate && (
                <Card className="mb-6 border-violet-200 bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-950/30 dark:to-indigo-950/30">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <span className="text-3xl">{selectedTemplate.emoji}</span>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <LayoutTemplate className="h-4 w-4 text-violet-600" />
                                        <Badge variant="secondary" className="text-xs">Template</Badge>
                                    </div>
                                    <h3 className="font-semibold">{selectedTemplate.name}</h3>
                                    <p className="text-sm text-muted-foreground">{selectedTemplate.description}</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" onClick={clearTemplate}>
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            <Card className="border-violet-200/20 shadow-xl">
                <CardHeader className="space-y-1">
                    <CardTitle className="text-3xl font-bold bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
                        {selectedTemplate ? `Create ${selectedTemplate.name}` : "Create Your Perfect Itinerary"}
                    </CardTitle>
                    <CardDescription className="text-base">
                        {selectedTemplate
                            ? `Just enter your destination city and customize the settings below`
                            : "Tell Alley what you're looking for, and get a custom plan filled with hidden gems and local favorites"
                        }
                    </CardDescription>
                </CardHeader>
                <form onSubmit={handleSubmit}>
                    <CardContent className="space-y-8">
                        {/* City Input */}
                        <div className="space-y-2">
                            <Label htmlFor="city" className="text-base font-semibold flex items-center gap-2">
                                <MapPin className="h-4 w-4 text-violet-600" />
                                Where are you going?
                            </Label>
                            <div className="relative">
                                <Input
                                    id="city"
                                    placeholder="Seoul, Tokyo, Bangkok, or Singapore"
                                    value={city}
                                    onChange={(e) => handleCityChange(e.target.value)}
                                    className={`text-lg h-12 ${cityError ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                                    required
                                />
                            </div>
                            {cityError ? (
                                <p className="text-sm text-red-500 flex items-center gap-1">
                                    <AlertCircle className="h-4 w-4" />
                                    {cityError}
                                </p>
                            ) : (
                                <div className="flex gap-2 flex-wrap">
                                    {SUPPORTED_CITIES.map((c) => (
                                        <button
                                            key={c}
                                            type="button"
                                            onClick={() => { setCity(c); setCityError(null); }}
                                            className="text-xs px-2 py-1 rounded-full bg-violet-100 text-violet-700 hover:bg-violet-200 dark:bg-violet-900/30 dark:text-violet-300 transition-colors"
                                        >
                                            {c}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Days and Budget */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="days" className="text-base font-semibold">Duration</Label>
                                <Select value={days} onValueChange={setDays}>
                                    <SelectTrigger className="h-12">
                                        <SelectValue placeholder="Select days" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                                            <SelectItem key={day} value={day.toString()}>
                                                {day} {day === 1 ? "Day" : "Days"}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="budget" className="text-base font-semibold flex items-center gap-2">
                                    <DollarSign className="h-4 w-4 text-violet-600" />
                                    Budget
                                </Label>
                                <Select value={budget} onValueChange={setBudget}>
                                    <SelectTrigger className="h-12">
                                        <SelectValue placeholder="Select budget" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="cheap">Budget Friendly ($)</SelectItem>
                                        <SelectItem value="moderate">Moderate ($$)</SelectItem>
                                        <SelectItem value="splurge">Treat Yourself ($$$)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Interests */}
                        <div className="space-y-3">
                            <Label className="text-base font-semibold">What interests you?</Label>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {INTERESTS.map((interest) => (
                                    <button
                                        key={interest}
                                        type="button"
                                        onClick={() => toggleInterest(interest)}
                                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${selectedInterests.includes(interest)
                                                ? "bg-violet-600 text-white shadow-md"
                                                : "bg-violet-100 text-violet-700 hover:bg-violet-200 dark:bg-violet-900/30 dark:text-violet-300"
                                            }`}
                                    >
                                        {interest}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Localness Level */}
                        <div className="space-y-4">
                            <Label className="text-base font-semibold">How &quot;Local&quot; do you want to go?</Label>
                            <div className="pt-2">
                                <Slider
                                    value={localnessLevel}
                                    onValueChange={setLocalnessLevel}
                                    max={5}
                                    min={1}
                                    step={1}
                                    className="w-full"
                                />
                                <div className="flex justify-between text-xs text-muted-foreground mt-3">
                                    <span>Tourist Highlights</span>
                                    <span className="font-semibold text-violet-600">Level {localnessLevel[0]}</span>
                                    <span>Deep Local Only</span>
                                </div>
                            </div>
                        </div>

                        {/* Pace and Group Type */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-3">
                                <Label className="text-base font-semibold flex items-center gap-2">
                                    <Zap className="h-4 w-4 text-violet-600" />
                                    Pace
                                </Label>
                                <RadioGroup value={pace} onValueChange={(v) => setPace(v as "relaxed" | "moderate" | "active")} className="flex flex-col gap-2">
                                    <div className="flex items-center space-x-2 p-3 rounded-lg border border-border hover:bg-accent transition-colors">
                                        <RadioGroupItem value="relaxed" id="relaxed" />
                                        <Label htmlFor="relaxed" className="cursor-pointer flex-1">Relaxed - Take it easy</Label>
                                    </div>
                                    <div className="flex items-center space-x-2 p-3 rounded-lg border border-border hover:bg-accent transition-colors">
                                        <RadioGroupItem value="moderate" id="moderate" />
                                        <Label htmlFor="moderate" className="cursor-pointer flex-1">Moderate - Balanced</Label>
                                    </div>
                                    <div className="flex items-center space-x-2 p-3 rounded-lg border border-border hover:bg-accent transition-colors">
                                        <RadioGroupItem value="packed" id="packed" />
                                        <Label htmlFor="packed" className="cursor-pointer flex-1">Packed - See it all</Label>
                                    </div>
                                </RadioGroup>
                            </div>

                            <div className="space-y-3">
                                <Label className="text-base font-semibold flex items-center gap-2">
                                    <Users className="h-4 w-4 text-violet-600" />
                                    Traveling with
                                </Label>
                                <RadioGroup value={groupType} onValueChange={setGroupType} className="flex flex-col gap-2">
                                    <div className="flex items-center space-x-2 p-3 rounded-lg border border-border hover:bg-accent transition-colors">
                                        <RadioGroupItem value="solo" id="solo" />
                                        <Label htmlFor="solo" className="cursor-pointer flex-1">Solo</Label>
                                    </div>
                                    <div className="flex items-center space-x-2 p-3 rounded-lg border border-border hover:bg-accent transition-colors">
                                        <RadioGroupItem value="couple" id="couple" />
                                        <Label htmlFor="couple" className="cursor-pointer flex-1">Couple</Label>
                                    </div>
                                    <div className="flex items-center space-x-2 p-3 rounded-lg border border-border hover:bg-accent transition-colors">
                                        <RadioGroupItem value="friends" id="friends" />
                                        <Label htmlFor="friends" className="cursor-pointer flex-1">Friends</Label>
                                    </div>
                                    <div className="flex items-center space-x-2 p-3 rounded-lg border border-border hover:bg-accent transition-colors">
                                        <RadioGroupItem value="family" id="family" />
                                        <Label htmlFor="family" className="cursor-pointer flex-1">Family</Label>
                                    </div>
                                </RadioGroup>
                            </div>
                        </div>
                    </CardContent>
                    <CardFooter className="flex-col gap-4">
                        <Button
                            type="submit"
                            className="w-full h-14 text-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 shadow-lg shadow-violet-500/20 disabled:opacity-70"
                            disabled={isLoading || !!cityError}
                        >
                            {isLoading ? (
                                <div className="flex flex-col items-center">
                                    <div className="flex items-center">
                                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                        <span>{progressMessage || "Generating..."}</span>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <Sparkles className="mr-2 h-5 w-5" />
                                    Generate Itinerary
                                </>
                            )}
                        </Button>
                        {isLoading && (
                            <p className="text-sm text-muted-foreground text-center">
                                This usually takes 20-30 seconds. We&apos;re finding the best spots for you!
                            </p>
                        )}
                    </CardFooter>
                </form>
            </Card>
        </div>
    );
}

// Wrap with Suspense for useSearchParams
export default function NewItineraryPage() {
    return (
        <Suspense fallback={
            <div className="max-w-3xl mx-auto py-8 px-4">
                <Card className="border-violet-200/20 shadow-xl animate-pulse">
                    <CardHeader className="space-y-1">
                        <div className="h-8 bg-gray-200 rounded w-3/4"></div>
                        <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                    </CardHeader>
                    <CardContent className="space-y-8">
                        <div className="h-12 bg-gray-200 rounded"></div>
                        <div className="h-12 bg-gray-200 rounded"></div>
                    </CardContent>
                </Card>
            </div>
        }>
            <NewItineraryForm />
        </Suspense>
    );
}
