import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Map, Calendar, Star, Sparkles } from "lucide-react";
import { auth } from "@clerk/nextjs/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { redirect } from "next/navigation";

async function getItineraries() {
    const { userId } = await auth();

    if (!userId) {
        redirect("/sign-in");
    }

    const supabase = createSupabaseAdmin();

    const { data: itineraries, error } = await supabase
        .from("itineraries")
        .select("*")
        .eq("clerk_user_id", userId)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Error fetching itineraries:", error);
        return [];
    }

    return itineraries || [];
}

export default async function ItinerariesPage() {
    const itineraries = await getItineraries();

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Your Itineraries</h1>
                    <p className="text-muted-foreground">
                        Manage your travel plans and saved trips.
                    </p>
                </div>
                <Link href="/itineraries/new">
                    <Button className="bg-violet-600 hover:bg-violet-700">
                        <Plus className="mr-2 h-4 w-4" />
                        New Itinerary
                    </Button>
                </Link>
            </div>

            {itineraries.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {itineraries.map((itinerary) => (
                        <Link key={itinerary.id} href={`/itineraries/${itinerary.id}`}>
                            <Card className="hover:shadow-md transition-all cursor-pointer h-full flex flex-col group">
                                <CardHeader>
                                    <CardTitle className="flex items-start justify-between group-hover:text-violet-600 transition-colors">
                                        <span className="line-clamp-2">{itinerary.title}</span>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="flex-1">
                                    <div className="space-y-2 text-sm text-muted-foreground">
                                        <div className="flex items-center gap-2">
                                            <Map className="h-4 w-4" />
                                            {itinerary.city}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Calendar className="h-4 w-4" />
                                            {itinerary.days} {itinerary.days === 1 ? 'Day' : 'Days'}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                                            Local Score: {itinerary.local_score}/10
                                        </div>
                                    </div>
                                </CardContent>
                                <CardFooter className="bg-muted/50 p-4">
                                    <p className="text-xs text-muted-foreground">
                                        Created {new Date(itinerary.created_at).toLocaleDateString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric'
                                        })}
                                    </p>
                                </CardFooter>
                            </Card>
                        </Link>
                    ))}
                </div>
            ) : (
                <div className="col-span-full flex flex-col items-center justify-center py-16 border-2 border-dashed rounded-xl bg-muted/20">
                    <div className="h-16 w-16 rounded-full bg-violet-100 dark:bg-violet-900/20 flex items-center justify-center mb-4">
                        <Sparkles className="h-8 w-8 text-violet-600" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">No itineraries yet</h3>
                    <p className="text-muted-foreground mb-6 text-center max-w-md">
                        Start planning your next adventure with AI-powered recommendations for hidden gems and local favorites
                    </p>
                    <Link href="/itineraries/new">
                        <Button className="bg-violet-600 hover:bg-violet-700">
                            <Sparkles className="mr-2 h-4 w-4" />
                            Create Your First Itinerary
                        </Button>
                    </Link>
                </div>
            )}
        </div>
    );
}
