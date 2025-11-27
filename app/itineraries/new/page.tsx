"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Sparkles, MapPin, DollarSign, Users, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

export default function NewItineraryPage() {
    const router = useRouter();
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);

    // Form state
    const [city, setCity] = useState("");
    const [days, setDays] = useState("3");
    const [budget, setBudget] = useState("moderate");
    const [localnessLevel, setLocalnessLevel] = useState([3]);
    const [pace, setPace] = useState("moderate");
    const [groupType, setGroupType] = useState("solo");
    const [selectedInterests, setSelectedInterests] = useState<string[]>([]);

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
                // If no ID (save failed), show the itinerary data
                console.log("Generated itinerary:", data.itinerary);
                toast({
                    title: "Itinerary generated",
                    description: "Check the console for details (save failed)",
                });
            }
        } catch (error) {
            console.error("Error:", error);
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
            <Card className="border-violet-200/20 shadow-xl">
                <CardHeader className="space-y-1">
                    <CardTitle className="text-3xl font-bold bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
                        Create Your Perfect Itinerary
                    </CardTitle>
                    <CardDescription className="text-base">
                        Tell Alley what you&apos;re looking for, and get a custom plan filled with hidden gems and local favorites
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
                                <RadioGroup value={pace} onValueChange={setPace} className="flex flex-col gap-2">
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
