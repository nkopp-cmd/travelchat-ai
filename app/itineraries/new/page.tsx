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
import { Loader2, Sparkles, MapPin, DollarSign, Users, Zap, LayoutTemplate, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getTemplateById, ItineraryTemplate } from "@/lib/templates";

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

function NewItineraryForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<ItineraryTemplate | null>(null);

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

        if (selectedInterests.length === 0) {
            toast({
                title: "Select interests",
                description: "Please select at least one interest",
                variant: "destructive",
            });
            return;
        }

        setIsLoading(true);

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

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || "Failed to generate itinerary");
            }

            const data = await response.json();

            toast({
                title: "Itinerary created! 🎉",
                description: `${data.itinerary.title} is ready to explore`,
            });

            // Redirect to the new itinerary
            if (data.itinerary.id) {
                router.push(`/itineraries/${data.itinerary.id}`);
            } else {
                // If no ID (save failed), redirect to itineraries list
                toast({
                    title: "Itinerary generated",
                    description: "There was an issue saving. Please try again.",
                    variant: "destructive",
                });
                router.push('/itineraries');
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

    return (
        <div className="max-w-3xl mx-auto py-8 px-4">
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
                            <Input
                                id="city"
                                placeholder="e.g. Seoul, Tokyo, Bangkok, Singapore"
                                value={city}
                                onChange={(e) => setCity(e.target.value)}
                                className="text-lg h-12"
                                required
                            />
                            <p className="text-xs text-muted-foreground">
                                We have spots in Seoul, Tokyo, Bangkok, and Singapore
                            </p>
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
                    <CardFooter>
                        <Button
                            type="submit"
                            className="w-full h-14 text-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 shadow-lg shadow-violet-500/20"
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                    Generating Your Perfect Trip...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="mr-2 h-5 w-5" />
                                    Generate Itinerary
                                </>
                            )}
                        </Button>
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
